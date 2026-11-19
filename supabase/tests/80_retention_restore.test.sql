-- Retention (30 days), user restore of conversations and contacts, permanent erasure job and
-- account erasure (docs/DATABASE.md §8; owner decisions 2026-11-18). Synthetic data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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
create function pg_temp.wsb() returns uuid language sql as $$ select workspace_id from ws where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' $$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.wsa() to authenticated;
grant execute on function pg_temp.wsb() to authenticated;
grant execute on function pg_temp.id(text) to authenticated;

-- ---------------------------------------------------------------- A's data
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
insert into ids select 'priya', (public.save_contact(pg_temp.wsa(), 'Priya Shah', 'priya@example.com') ->> 'contact_id')::uuid;
insert into ids select 'conv', (public.import_conversation(pg_temp.wsa(), 'Deck', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","body":"Could you send the revised deck by Friday?","direction":"inbound"}]'::jsonb) ->> 'conversation_id')::uuid;
insert into ids select 'm1', id from public.messages where conversation_id = pg_temp.id('conv');
select public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'), jsonb_build_array(
  jsonb_build_object('description', 'Send the revised deck', 'owner', 'me', 'origin', 'extracted',
    'citations', jsonb_build_array(jsonb_build_object('message_id', pg_temp.id('m1'), 'quote', 'send the revised deck')),
    'task', jsonb_build_object('title', 'Send deck'))), '{}');
insert into ids select 'c1', id from public.commitments;
insert into ids select 't_ai', id from public.tasks where commitment_id = pg_temp.id('c1');
select public.approve_task(pg_temp.id('t_ai'), true);
insert into ids select 't_own', (public.create_task(pg_temp.wsa(), 'Book the venue', null, 'normal', pg_temp.id('conv')) ->> 'task_id')::uuid;

-- ---------------------------------------------------------------- time zone setting
select lives_ok($$ update public.workspace_settings set time_zone = 'Asia/Kolkata' where workspace_id = pg_temp.wsa() $$, 'the user can set their time zone');
select throws_ok($$ update public.workspace_settings set time_zone = 'x; drop table' where workspace_id = pg_temp.wsa() $$, '23514', null, 'an invalid time zone name is refused');

-- ---------------------------------------------------------------- recently deleted + restore conversation
select public.soft_delete_conversation(pg_temp.id('conv'));
select is((public.list_recently_deleted() -> 'items' -> 0 ->> 'kind'), 'conversation', 'a deleted conversation is listed');
select ok(((public.list_recently_deleted() -> 'items' -> 0 ->> 'erase_at')::timestamptz - (public.list_recently_deleted() -> 'items' -> 0 ->> 'deleted_at')::timestamptz) = interval '30 days',
  'it will be erased 30 days after deletion');
select is((select evidence_state from public.commitments where id = pg_temp.id('c1')), 'sources_hidden', 'its commitment is flagged while deleted');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000000b');
select is(jsonb_array_length(public.list_recently_deleted() -> 'items'), 0, 'another user sees none of it');
select is(public.restore_conversation(pg_temp.id('conv')) ->> 'status', 'not_found', 'another user cannot restore it');
select is(public.restore_contact(pg_temp.id('priya')) ->> 'status', 'not_found', 'another user cannot restore a contact');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select is(public.restore_conversation(pg_temp.id('conv')) ->> 'status', 'restored', 'the owner restores the conversation');
select is((select count(*)::int from public.messages where conversation_id = pg_temp.id('conv')), 1, 'its messages are back');
select is((select evidence_state from public.commitments where id = pg_temp.id('c1')), 'supported', 'its commitment is supported again');
select is(public.restore_conversation(pg_temp.id('conv')) ->> 'status', 'not_found', 'restoring twice does nothing');

-- The same thread imported again meanwhile blocks the restore.
select public.soft_delete_conversation(pg_temp.id('conv'));
insert into ids select 'conv_again', (public.import_conversation(pg_temp.wsa(), 'Deck', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","body":"Could you send the revised deck by Friday?","direction":"inbound"}]'::jsonb) ->> 'conversation_id')::uuid;
select is(public.restore_conversation(pg_temp.id('conv')) ->> 'status', 'duplicate', 'a restore never creates a duplicate thread');
select public.soft_delete_conversation(pg_temp.id('conv_again'));

-- ---------------------------------------------------------------- restore contact
select public.soft_delete_contact(pg_temp.id('priya'));
select is((select count(*)::int from public.contacts), 0, 'the deleted contact is hidden');
select is(public.restore_contact(pg_temp.id('priya')) ->> 'status', 'restored', 'the owner restores the contact');
select is((select value_normalized from public.contact_identifiers where contact_id = pg_temp.id('priya')), 'priya@example.com', 'its email is back');

select public.soft_delete_contact(pg_temp.id('priya'));
insert into ids select 'priya2', (public.save_contact(pg_temp.wsa(), 'P. Shah', 'priya@example.com') ->> 'contact_id')::uuid;
select is(public.restore_contact(pg_temp.id('priya')) ->> 'emails_skipped', '1', 'an email now used by another contact stays with that contact');
select public.soft_delete_contact(pg_temp.id('priya2'));

-- ---------------------------------------------------------------- retention window and erasure
reset role;
update public.conversations set deleted_at = now() - interval '31 days' where id = pg_temp.id('conv_again');
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select is(public.restore_conversation(pg_temp.id('conv_again')) ->> 'status', 'not_found', 'nothing can be restored after 30 days');
select is(jsonb_array_length(public.list_recently_deleted() -> 'items'), 2, 'only items inside the window are listed');

reset role;
select throws_ok($$ set local role authenticated; select app_private.purge_expired() $$, '42501', null, 'the erasure job is not callable through the API');
reset role;
select app_private.purge_expired(now() + interval '29 days');
select is((select count(*)::int from public.conversations where id = pg_temp.id('conv_again')), 0, 'the item deleted over 30 days ago is erased');
select is((select count(*)::int from public.conversations where id = pg_temp.id('conv')), 1, 'the recently deleted conversation is still kept');
select app_private.purge_expired(now() + interval '31 days');
select is((select count(*)::int from public.conversations where id = pg_temp.id('conv')), 0, 'after 30 days it is erased too');
select is((select count(*)::int from public.messages where conversation_id = pg_temp.id('conv')), 0, 'its messages are erased');
select is((select count(*)::int from public.commitments where id = pg_temp.id('c1')) + (select count(*)::int from public.tasks where id = pg_temp.id('t_ai')), 0,
  'derived commitments and AI tasks are erased with it');
select is((select coalesce(conversation_id::text, 'unlinked') from public.tasks where id = pg_temp.id('t_own')), 'unlinked', 'the user''s own task is kept, unlinked');
select is((select count(*)::int from public.contacts where id = pg_temp.id('priya2')), 0, 'expired deleted contacts are erased');

-- ---------------------------------------------------------------- account erasure
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select public.request_account_deletion();
reset role;
select app_private.purge_expired(now() + interval '29 days');
select is((select count(*)::int from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 1, 'an account is kept during the 30 days');
select ok((app_private.purge_expired(now() + interval '31 days') ->> 'accounts')::int >= 1, 'after 30 days the account is erased (the job reports counts only)');
select ok(not exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a')
          and not exists (select 1 from public.workspaces where id = pg_temp.wsa())
          and not exists (select 1 from public.tasks where workspace_id = pg_temp.wsa()),
  'the Auth user, workspace and all content are gone');
select ok(exists (select 1 from public.audit_events where action = 'account.erased' and target_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and actor_kind = 'system')
          and exists (select 1 from public.workspaces where id = pg_temp.wsb()),
  'a minimal system audit record remains and other users are untouched');
select is((select schedule from cron.job where jobname = 'convopilot-purge-expired'), '17 3 * * *', 'the erasure job runs daily');

select * from finish();
rollback;
