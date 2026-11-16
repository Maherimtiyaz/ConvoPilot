-- Behaviour checks with simulated users. The Auth hook and the real Auth API flows are
-- exercised end-to-end in tests/integration/auth-signup.test.ts; here users are inserted
-- directly into auth.users, which fires the invitation-binding and provisioning triggers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- ---------------------------------------------------------------- fixtures (as postgres)
-- Each fixture invitation's raw token is '<email>-token'.
create function pg_temp.invite(p_email text, p_expires interval default interval '1 day') returns uuid
language sql as $$
  insert into app_private.invitations (email_normalized, token_hash, created_by, created_at, expires_at)
  values (lower(p_email), extensions.digest(lower(p_email) || '-token', 'sha256'), gen_random_uuid(),
          now() - interval '10 days', now() + p_expires)
  returning id;
$$;
create function pg_temp.new_user(p_id uuid, p_email text, p_token text) returns void
language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password, raw_user_meta_data)
  values (p_id, p_email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
          'not-a-real-hash', case when p_token is null then '{}'::jsonb
                                  else jsonb_build_object('invitation_token', p_token, 'name', 'x') end);
$$;
create function pg_temp.as_user(p_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- The migrations' fail-closed defaults also apply to these temporary helpers.
grant execute on function pg_temp.as_user(uuid) to authenticated;

select pg_temp.invite('a@example.com');
select pg_temp.invite('b@example.com');
select pg_temp.invite('op@example.com');
select pg_temp.new_user('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', 'a@example.com-token');
select pg_temp.new_user('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', 'b@example.com-token');
select pg_temp.new_user('00000000-0000-0000-0000-0000000000ee', 'op@example.com', 'op@example.com-token');
insert into app_private.platform_operators (user_id) values ('00000000-0000-0000-0000-0000000000ee');

-- ---------------------------------------------------------------- B1: token-bound, passwordless creation
select is(
  (select count(*)::int from public.workspace_members m
     join public.workspace_settings s on s.workspace_id = m.workspace_id
     join public.profiles p on p.user_id = m.user_id
    where m.user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and m.role = 'owner'),
  1, 'valid token: profile, workspace, settings and one owner membership provisioned');
select ok((select consumed_by = 'aaaaaaaa-0000-0000-0000-000000000001'
             from app_private.invitations where email_normalized = 'a@example.com'),
  'valid token: invitation consumed by the new user');
select ok((select not (raw_user_meta_data ? 'invitation_token') and raw_user_meta_data ->> 'name' = 'x'
             from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'raw token stripped from raw_user_meta_data at insert; other metadata kept');
select ok((select encrypted_password is null from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'password hash removed at insert (passwordless account)');

select pg_temp.invite('notoken@example.com');
update app_private.invitations set verified_at = now() where email_normalized = 'notoken@example.com';
select throws_ok($$ select pg_temp.new_user(gen_random_uuid(), 'notoken@example.com', null) $$,
  '42501', 'sign-up requires a valid invitation', 'verified invitation state without the raw token is rejected');
select throws_ok($$ select pg_temp.new_user(gen_random_uuid(), 'notoken@example.com', 'wrong-token') $$,
  '42501', 'sign-up requires a valid invitation', 'wrong token is rejected');
select throws_ok($$ select pg_temp.new_user(gen_random_uuid(), 'notoken@example.com', 'a@example.com-token') $$,
  '42501', 'sign-up requires a valid invitation', 'token bound to another email is rejected');
select throws_ok($$ select pg_temp.new_user(gen_random_uuid(), 'a2@example.com', 'a@example.com-token') $$,
  '42501', 'sign-up requires a valid invitation', 'consumed token cannot create a second account (replay)');
select pg_temp.invite('expired@example.com', interval '-1 minute');
select throws_ok($$ select pg_temp.new_user(gen_random_uuid(), 'expired@example.com', 'expired@example.com-token') $$,
  '42501', 'sign-up requires a valid invitation', 'expired invitation is rejected');

select pg_temp.invite('rollback@example.com');
alter table public.workspaces add constraint zz_force_fail check (name <> 'Personal') not valid;
select throws_ok($$ select pg_temp.new_user(gen_random_uuid(), 'rollback@example.com', 'rollback@example.com-token') $$,
  '23514', null, 'provisioning failure aborts the account creation');
alter table public.workspaces drop constraint zz_force_fail;
select ok((select consumed_at is null from app_private.invitations where email_normalized = 'rollback@example.com')
      and not exists (select 1 from auth.users where email = 'rollback@example.com')
      and not exists (select 1 from public.profiles p where not exists (select 1 from auth.users u where u.id = p.user_id)),
  'failed provisioning leaves no user, no orphan profile and an unconsumed invitation');

select throws_ok(
  $$ update auth.users set encrypted_password = 'attacker-hash' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', 'password authentication is disabled', 'setting a password on an existing account is rejected');
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"invitation_token": "x"}'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select ok((select not (raw_user_meta_data ? 'invitation_token') from auth.users
            where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'invitation_token is stripped from metadata on update too');

-- ---------------------------------------------------------------- identity_data never keeps the token
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        jsonb_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'a@example.com',
                           'email_verified', false, 'invitation_token', 'a@example.com-token'),
        'email');
select ok((select not (identity_data ? 'invitation_token') from auth.identities
            where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and provider = 'email'),
  'invitation_token stripped from identity_data on insert');
select is((select identity_data - 'email_verified' from auth.identities
            where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and provider = 'email'),
  jsonb_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'a@example.com'),
  'legitimate identity fields are preserved');
update auth.identities set identity_data = identity_data || '{"email_verified": true, "invitation_token": "x"}'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and provider = 'email';
select ok((select not (identity_data ? 'invitation_token') and (identity_data ->> 'email_verified')::boolean
             from auth.identities where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and provider = 'email'),
  'invitation_token stripped from identity_data on update; other changes applied');
select lives_ok(
  $$ update auth.identities set identity_data = '["not-an-object"]'::jsonb
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and provider = 'email' $$,
  'non-object identity_data is handled safely');

-- ---------------------------------------------------------------- tenant isolation (user A)
create temp table b_ws as
  select workspace_id from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
grant select on b_ws to authenticated;
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');

select is((select count(*)::int from public.workspaces), 1, 'A sees exactly one workspace');
select is((select count(*)::int from public.workspaces where id = (select workspace_id from b_ws)), 0,
  'A cannot see B''s workspace');
select is((select count(*)::int from public.profiles), 1, 'A sees only own profile');
select is((select count(*)::int from public.workspace_settings), 1, 'A sees only own settings');
select is_empty(
  $$ update public.workspaces set name = 'pwned' where id = (select workspace_id from b_ws) returning id $$,
  'A cannot rename B''s workspace');
select lives_ok($$ update public.workspaces set name = 'A renamed' $$, 'A can rename own workspace');
select throws_ok($$ update public.workspaces set deleted_at = now() $$, '42501', null,
  'A cannot set deleted_at directly');
select throws_ok($$ delete from public.workspaces $$, '42501', null, 'A cannot hard-delete workspaces');
select throws_ok(
  $$ insert into public.workspace_members (workspace_id, user_id, role)
     values ((select workspace_id from b_ws), 'aaaaaaaa-0000-0000-0000-000000000001', 'owner') $$,
  '42501', null, 'A cannot add self to B''s workspace');
select throws_ok($$ update public.workspace_members set role = 'member' $$, '42501', null,
  'A cannot change own role');
select throws_ok($$ delete from public.workspace_members $$, '42501', null, 'A cannot delete memberships');
select throws_ok(
  $$ insert into public.audit_events (scope, actor_kind, action) values ('account', 'system', 'forged') $$,
  '42501', null, 'A cannot insert audit events');
select throws_ok($$ select app_private.write_audit('account', null, null, 'x', null, null, '{}') $$,
  '42501', null, 'A cannot call the internal audit writer');
select throws_ok($$ select nextval('public.audit_events_id_seq') $$, '42501', null,
  'A cannot use the audit sequence (L1)');

-- ---------------------------------------------------------------- log_event (actor, allow-list, L2)
select lives_ok($$ select public.log_event('ai.policy_denied', 'tool', 'search_messages', '{"reason_code": "not_allowed"}') $$,
  'log_event accepts an allow-listed action with identifier-shaped fields');
select throws_ok($$ select public.log_event('proposal.confirmed') $$, '22023', null,
  'log_event rejects approval-type actions');
select throws_ok($$ select public.log_event('export.requested', 'message', 'Dear Bob, the price is $4.2M') $$,
  '22023', 'invalid audit event fields', 'log_event rejects free text in target fields (L2)');
select throws_ok($$ select public.log_event('export.requested', null, null, '{"body": "private email text"}') $$,
  '22023', 'invalid audit event fields', 'log_event rejects non-allow-listed metadata (L2)');
reset role;
select ok((select bool_and(actor_user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
             from public.audit_events where action = 'ai.policy_denied'),
  'log_event actor is forced to auth.uid()');

-- ---------------------------------------------------------------- audit visibility
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is((select count(*)::int from public.audit_events where scope = 'account'), 0,
  'account-scope audit events are not readable through the API');
select is((select count(*)::int from public.audit_events where workspace_id = (select workspace_id from b_ws)), 0,
  'A cannot read B''s workspace audit events');

-- ---------------------------------------------------------------- invitations: M1 denial audit
select is(public.create_invitation('c@example.com') ->> 'status', 'not_authorized',
  'workspace owner (non-operator) cannot create invitations');
reset role;
select is((select count(*)::int from public.audit_events
            where action = 'invitation.create_denied' and actor_user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1, 'M1: the create denial audit event persists');
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is(public.revoke_invitation(gen_random_uuid()) ->> 'status', 'not_authorized',
  'non-operator cannot revoke invitations');
reset role;
select is((select count(*)::int from public.audit_events
            where action = 'invitation.revoke_denied' and actor_user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1, 'M1: the revoke denial audit event persists (scoped to the fixture user)');

-- ---------------------------------------------------------------- invitations: operator flows, M2
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
create temp table inv_c as select public.create_invitation('c@example.com') as r;
select is((select r ->> 'status' from inv_c), 'created', 'operator creates an invitation');
select is(public.create_invitation('C@example.com') ->> 'status', 'already_invited',
  'M2: an active invitation still prevents a duplicate (email normalised)');
reset role;
select ok((select count(*) = 1 from app_private.invitations
            where email_normalized = 'c@example.com'
              and token_hash = extensions.digest((select r ->> 'token' from inv_c), 'sha256')),
  'invitation stored as SHA-256 hash only');

update app_private.invitations set created_at = now() - interval '9 days', expires_at = now() - interval '1 day'
 where email_normalized = 'c@example.com';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
create temp table inv_c2 as select public.create_invitation('c@example.com') as r;
grant select on inv_c2 to anon;
select is((select r ->> 'status' from inv_c2), 'created', 'M2: an expired invitation can be replaced');
reset role;
select ok((select count(*) filter (where revoked_reason = 'expired_replaced') = 1
              and count(*) filter (where consumed_at is null and revoked_at is null) = 1
             from app_private.invitations where email_normalized = 'c@example.com'),
  'M2: the expired invitation is retired; exactly one open invitation remains');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
select is(public.revoke_invitation(((select r ->> 'invitation_id' from inv_c2))::uuid) ->> 'status', 'revoked',
  'operator revokes an invitation');
select is(public.create_invitation('c@example.com') ->> 'status', 'created',
  'M2: a revoked invitation can be followed by a new one');
reset role;

-- ---------------------------------------------------------------- verify_invitation: M3, L4
set local role anon;
select ok(not public.verify_invitation('c@example.com-wrong', 'c@example.com')
      and not public.verify_invitation((select r ->> 'token' from inv_c2), 'c@example.com'),
  'wrong token and revoked invitation token both return false');
reset role;
create temp table audit_before as select count(*) as n from public.audit_events;
set local role anon;
select count(*) from generate_series(1, 60) g where public.verify_invitation('bogus-' || g, 'x@example.com');
reset role;
select is((select count(*) from public.audit_events) - (select n from audit_before), 0::bigint,
  'M3: 60 anonymous invalid-token verifications write no audit rows');

select pg_temp.invite('d@example.com');
set local role anon;
select ok(public.verify_invitation('d@example.com-token', 'D@Example.com '), 'valid token verifies (email normalised)');
select ok(public.verify_invitation('d@example.com-token', 'd@example.com'), 'repeat verification still returns true');
reset role;
select is((select count(*)::int from public.audit_events a join app_private.invitations i on i.id::text = a.target_id
            where a.action = 'invitation.verified' and i.email_normalized = 'd@example.com'), 1,
  'M3: only the first successful verification is audited');

-- ---------------------------------------------------------------- operator rights end on deletion request (L3)
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
select public.request_account_deletion();
select is(public.create_invitation('e@example.com') ->> 'status', 'not_authorized',
  'L3: an operator who requested account deletion can no longer invite');
reset role;

-- ---------------------------------------------------------------- membership immutability (privileged role)
select throws_ok(
  $$ update public.workspace_members set role = 'member' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', 'workspace membership rows are immutable', 'membership rows are immutable even for privileged roles');

-- ---------------------------------------------------------------- account deletion request
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.request_account_deletion();
select is((select count(*)::int from public.workspaces) + (select count(*)::int from public.workspace_settings)
          + (select count(*)::int from public.workspace_members), 0,
  'after a deletion request the same JWT immediately loses workspace access');
reset role;

select * from finish();
rollback;
