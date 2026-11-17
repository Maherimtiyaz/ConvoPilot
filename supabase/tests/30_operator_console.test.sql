-- M1.5 operator console: only platform operators can list, invite, decline and see invitations.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------- fixtures (as postgres)
create function pg_temp.as_user(p_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;

insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
values ('op@example.com', extensions.digest('op-token', 'sha256'), gen_random_uuid(), now() + interval '1 day'),
       ('member@example.com', extensions.digest('member-token', 'sha256'), gen_random_uuid(), now() + interval '1 day');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'op@example.com', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '{"invitation_token": "op-token"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'member@example.com', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '{"invitation_token": "member-token"}');
insert into app_private.platform_operators (user_id) values ('00000000-0000-0000-0000-0000000000e1');

insert into app_private.waitlist_entries (id, email_normalized, full_name, role, company_size, consent_at, created_at) values
  ('11111111-0000-0000-0000-000000000001', 'w1@example.com', 'One', 'founder', 'solo', now(), now() - interval '3 hours'),
  ('11111111-0000-0000-0000-000000000002', 'w2@example.com', 'Two', 'operator', '2-10', now(), now() - interval '2 hours'),
  ('11111111-0000-0000-0000-000000000003', 'w3@example.com', 'Three', 'investor', '11-50', now(), now() - interval '1 hour'),
  ('11111111-0000-0000-0000-000000000004', 'member@example.com', 'Member', 'founder', 'solo', now(), now());

create temp table expected_pending on commit drop as
  select count(*)::int as n from app_private.waitlist_entries where status = 'pending';
grant select on expected_pending to authenticated;

-- ---------------------------------------------------------------- anon: no access at all
set local role anon;
select throws_ok($$ select public.list_waitlist() $$, '42501', null, 'anon cannot call list_waitlist');
select throws_ok($$ select public.invite_waitlist_entries(array['11111111-0000-0000-0000-000000000001']::uuid[]) $$,
  '42501', null, 'anon cannot call invite_waitlist_entries');
reset role;

-- ---------------------------------------------------------------- a normal member is denied
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is(public.current_user_is_operator(), false, 'a member is not an operator');
select is(public.list_waitlist() ->> 'status', 'not_authorized', 'a member cannot list the waitlist');
select is(public.invite_waitlist_entries(array['11111111-0000-0000-0000-000000000001']::uuid[]) ->> 'status',
  'not_authorized', 'a member cannot invite');
select is(public.set_waitlist_entry_status('11111111-0000-0000-0000-000000000001', 'declined') ->> 'status',
  'not_authorized', 'a member cannot decline entries');
select is(public.list_invitations() ->> 'status', 'not_authorized', 'a member cannot list invitations');
reset role;
select ok((select count(*) from public.audit_events
            where action = 'waitlist.read_denied' and actor_user_id = '00000000-0000-0000-0000-0000000000e2') = 1,
  'denied read is audited with the actor');
select is((select status from app_private.waitlist_entries where id = '11111111-0000-0000-0000-000000000001'),
  'pending', 'denied calls change nothing');

-- ---------------------------------------------------------------- the operator
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select is(public.current_user_is_operator(), true, 'the operator is recognised');
select is((public.list_waitlist() -> 'counts' ->> 'pending')::int,
  (select n from expected_pending), 'operator sees counts by status');
select is(public.list_waitlist('pending', 2, 0) #>> '{entries,0,email}', 'member@example.com',
  'entries are newest first and paginated');
select is(public.list_waitlist('bogus') ->> 'status', 'invalid', 'unknown status filter is rejected');
select is(public.invite_waitlist_entries(array[]::uuid[]) ->> 'status', 'invalid', 'empty batch is rejected');
select is(public.invite_waitlist_entries(array['11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000001']::uuid[]) ->> 'status', 'invalid', 'duplicate ids are rejected');

select is(public.set_waitlist_entry_status('11111111-0000-0000-0000-000000000003', 'declined') ->> 'status',
  'ok', 'operator can decline an entry');

create temp table r on commit drop as
  select public.invite_waitlist_entries(array[
    '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000000']::uuid[]) as j;
select is((select j #>> '{results,0,status}' from r), 'created', 'pending entry gets an invitation');
select ok((select char_length(j #>> '{results,0,token}') = 43 from r), 'the one-time token is returned once');
select is((select j #>> '{results,1,status}' from r), 'declined', 'declined entries are skipped');
select is((select j #>> '{results,2,status}' from r), 'already_member', 'existing members are not re-invited');
select is((select j #>> '{results,3,status}' from r), 'not_found', 'unknown ids are reported');
select is(public.invite_waitlist_entries(array['11111111-0000-0000-0000-000000000001']::uuid[]) #>> '{results,0,status}',
  'already_invited', 'an open invitation is not duplicated');
select is((select x ->> 'state' || '|' || (x ? 'token')::text || '|' || (x ? 'token_hash')::text
             from jsonb_array_elements(public.list_invitations() -> 'invitations') x
            where x ->> 'email' = 'w1@example.com'),
  'open|false|false', 'invitations list shows state, never tokens');
reset role;

select is((select status || '|' || (invitation_id is not null)::text from app_private.waitlist_entries
            where id = '11111111-0000-0000-0000-000000000001'), 'invited|true',
  'invited entry is linked to its invitation');

select * from finish();
rollback;
