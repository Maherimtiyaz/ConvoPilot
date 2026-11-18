-- Catalog and privilege checks (EVALUATION.md S23, S24, S15, S17, S20).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select ok(exists(select 1 from pg_extension where extname = 'pgcrypto'
  and extnamespace = 'extensions'::regnamespace), 'pgcrypto installed in schema extensions');

-- Schema privileges
select ok(not has_schema_privilege('anon', 'app_private', 'usage'), 'anon has no USAGE on app_private');
select ok(has_schema_privilege('authenticated', 'app_private', 'usage'), 'authenticated has USAGE on app_private (RLS helpers)');
select ok(has_schema_privilege('supabase_auth_admin', 'app_private', 'usage'), 'supabase_auth_admin has USAGE on app_private (hook)');
select ok(not has_schema_privilege('authenticated', 'app_private', 'create'), 'authenticated cannot CREATE in app_private');

select is(
  (select count(*)::int from pg_class c
     cross join (values ('anon'), ('authenticated'), ('supabase_auth_admin')) r(role)
    where c.relnamespace = 'app_private'::regnamespace and c.relkind = 'r'
      and has_table_privilege(r.role, c.oid, 'select,insert,update,delete,truncate,references,trigger')),
  0, 'no API role or supabase_auth_admin has any privilege on app_private tables');

-- Function EXECUTE matrix (docs/DATABASE.md §4.3)
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and has_function_privilege('anon', p.oid, 'execute')),
  array['join_waitlist', 'verify_invitation'], 'anon can execute only join_waitlist and verify_invitation');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and has_function_privilege('authenticated', p.oid, 'execute')),
  array['approve_task', 'create_invitation', 'create_task', 'current_user_is_operator', 'decide_proposal',
        'import_conversation', 'invite_waitlist_entries',
        'is_workspace_member', 'is_workspace_owner', 'join_waitlist', 'list_invitations', 'list_waitlist', 'log_event',
        'record_ai_usage', 'request_account_deletion', 'revoke_invitation', 'save_contact', 'search_messages',
        'set_task_status', 'set_waitlist_entry_status', 'soft_delete_contact', 'soft_delete_conversation', 'soft_delete_draft',
        'store_commitment_proposals', 'verify_invitation'],
  'authenticated can execute only the allow-listed functions');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and has_function_privilege('supabase_auth_admin', p.oid, 'execute')),
  array['before_user_created_hook'], 'supabase_auth_admin can execute only the sign-up hook');
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0)),
  0, 'no function in public/app_private is executable by PUBLIC');

-- Function hygiene
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and not coalesce('search_path=""' = any(p.proconfig), false)),
  0, 'every function sets search_path to empty');
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.proowner <> 'postgres'::regrole),
  0, 'all functions owned by postgres');

-- Fail-closed defaults for functions created later
create function public.zz_probe_public() returns int language sql set search_path = '' as 'select 1';
create function app_private.zz_probe_private() returns int language sql set search_path = '' as 'select 1';
select ok(
  not has_function_privilege('anon', 'public.zz_probe_public()', 'execute')
  and not has_function_privilege('authenticated', 'public.zz_probe_public()', 'execute')
  and not has_function_privilege('authenticated', 'app_private.zz_probe_private()', 'execute'),
  'new functions are not executable by API roles without an explicit grant');

-- Fail-closed defaults for tables created later in public
create table public.zz_probe_table (id int);
select ok(
  not has_table_privilege('anon', 'public.zz_probe_table', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.zz_probe_table', 'select,insert,update,delete'),
  'new public tables are not accessible to API roles without an explicit grant');

-- RLS enabled on every public table
select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname not like 'zz_probe%' and not c.relrowsecurity),
  0, 'RLS enabled on every public table');

-- Write restrictions
select ok(not has_table_privilege('authenticated', 'public.workspace_members', 'insert,update,delete'),
  'authenticated cannot write workspace_members');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'insert,update,delete,truncate'),
  'authenticated cannot write audit_events');
select is(
  (select count(*)::int from pg_class c cross join (values ('anon'), ('authenticated')) r(role)
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not like 'zz_probe%'
      and has_table_privilege(r.role, c.oid, 'delete,truncate')),
  0, 'no hard DELETE/TRUNCATE on any public table for API roles');
select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not like 'zz_probe%'
      and has_table_privilege('anon', c.oid, 'select,insert,update')),
  0, 'anon has no access to any public table');
select ok(
  not has_column_privilege('authenticated', 'public.workspaces', 'deleted_at', 'update')
  and not has_column_privilege('authenticated', 'public.workspaces', 'created_by', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'deletion_requested_at', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'update'),
  'protected columns are not user-updatable');

-- Sequences (review L1)
select is(
  (select count(*)::int from pg_class c cross join (values ('anon'), ('authenticated')) r(role)
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
      and has_sequence_privilege(r.role, c.oid, 'usage,select,update')),
  0, 'API roles have no privileges on public sequences');
create sequence public.zz_probe_seq;
select ok(not has_sequence_privilege('anon', 'public.zz_probe_seq', 'usage,select,update')
      and not has_sequence_privilege('authenticated', 'public.zz_probe_seq', 'usage,select,update'),
  'new public sequences are not accessible to API roles');

-- app_private tables have RLS enabled (review L6)
select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'app_private'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS enabled on every app_private table');

-- auth.users carries the invitation-binding, passwordless and provisioning triggers (B1)
select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal),
  array['bind_invitation_on_user_insert', 'enforce_passwordless_on_user_update', 'on_auth_user_created'],
  'auth.users has exactly the expected ConvoPilot triggers');
select ok(
  (select bool_and(p.prosecdef and p.proowner = 'postgres'::regrole)
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal),
  'auth.users trigger functions are SECURITY DEFINER and owned by postgres');
select ok(
  (select count(*) = 1 and bool_and(not p.prosecdef and p.proowner = 'postgres'::regrole
                                     and 'search_path=""' = any(p.proconfig)
                                     and t.tgtype & 2 = 2 and t.tgtype & 4 = 4 and t.tgtype & 16 = 16)
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.identities'::regclass and not t.tgisinternal),
  'auth.identities has one BEFORE INSERT OR UPDATE token-stripping trigger (invoker, empty search_path)');

select * from finish();
rollback;
