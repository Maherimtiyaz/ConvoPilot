-- M4 contacts and retrieval: linking, search, isolation, soft delete.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.as_user(p_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;

insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
values ('a@example.com', extensions.digest('a-token', 'sha256'), gen_random_uuid(), now() + interval '1 day'),
       ('b@example.com', extensions.digest('b-token', 'sha256'), gen_random_uuid(), now() + interval '1 day');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"invitation_token": "a-token"}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"invitation_token": "b-token"}');
create temp table ws on commit drop as
  select m.user_id, m.workspace_id from public.workspace_members m
   where m.user_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b');
grant select on ws to authenticated;
create temp table ids (k text primary key, v uuid) on commit drop;
grant select, insert on ids to authenticated;
create function pg_temp.wsa() returns uuid language sql as $$ select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' $$;
grant execute on function pg_temp.wsa() to authenticated;

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
insert into ids select 'conv1', (public.import_conversation(pg_temp.wsa(), 'Deck', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","sent_at":"2026-03-12T09:14:00Z","body":"Could you send the revised deck by Friday?","direction":"inbound"}]'::jsonb) ->> 'conversation_id')::uuid;

-- ---------------------------------------------------------------- save contact
insert into ids select 'priya', (public.save_contact(pg_temp.wsa(), 'Priya Shah', 'Priya@Example.com', 'Northwind', 'CEO') ->> 'contact_id')::uuid;
select ok((select v from ids where k = 'priya') is not null, 'contact created from a sender');
select is((select count(*)::int from public.conversation_participants where contact_id = (select v from ids where k = 'priya')), 1,
  'existing conversations from that email are linked');
select is((select last_interaction_at from public.contacts where id = (select v from ids where k = 'priya')), '2026-03-12T09:14:00Z'::timestamptz,
  'last interaction comes from the latest message');
select is((select c.name from public.companies c join public.contacts p on p.company_id = c.id where p.id = (select v from ids where k = 'priya')), 'Northwind',
  'company is created and linked');
select is(public.save_contact(pg_temp.wsa(), 'P. Shah', 'priya@example.com') ->> 'status', 'existing', 'the same email returns the existing contact');
select is(public.save_contact(pg_temp.wsa(), '', 'x@example.com') ->> 'status', 'invalid', 'a name is required');

insert into ids select 'conv2', (public.import_conversation(pg_temp.wsa(), 'Pilot', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","body":"Can the pilot start in March?","direction":"inbound"}]'::jsonb) ->> 'conversation_id')::uuid;
select is((select count(*)::int from public.conversation_participants where contact_id = (select v from ids where k = 'priya')), 2,
  'new imports from a known email link automatically');

-- ---------------------------------------------------------------- search
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), 'deck')), 1, 'keyword search finds the message');
select is((select subject from public.search_messages(pg_temp.wsa(), 'pilot march')), 'Pilot', 'multi-word search returns the conversation subject');
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), 'deck', (select v from ids where k = 'priya'))), 1, 'search can be limited to a contact');
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), '')), 0, 'empty queries return nothing');
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), repeat('x', 201))), 0, 'over-long queries return nothing');

select throws_ok($$ delete from public.contacts $$, '42501', null, 'hard delete is revoked');
select throws_ok($$ update public.contacts set deleted_at = now() $$, '42501', null, 'deleted_at is not directly writable');

-- ---------------------------------------------------------------- isolation
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.contacts), 0, 'another user sees no contacts');
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), 'deck')), 0, 'another user cannot search this workspace');
select throws_ok($$ select public.save_contact(pg_temp.wsa(), 'Intruder', 'i@example.com') $$, '42501', null, 'cannot add contacts to another workspace');
select is(public.soft_delete_contact((select v from ids where k = 'priya')) ->> 'status', 'not_found', 'cannot delete another user''s contact');

-- ---------------------------------------------------------------- deletion
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select is(public.soft_delete_contact((select v from ids where k = 'priya')) ->> 'status', 'deleted', 'owner can delete a contact');
select ok((select count(*) from public.contacts) = 0 and (select count(*) from public.conversation_participants) = 0,
  'deleted contact and its links disappear');
select is(public.save_contact(pg_temp.wsa(), 'Priya Shah', 'priya@example.com') ->> 'status', 'created', 'the email can be saved again');
select public.soft_delete_conversation((select v from ids where k = 'conv1'));
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), 'deck')), 0, 'deleted conversations never appear in search');

select * from finish();
rollback;
