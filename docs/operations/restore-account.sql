-- Restore a deleted ConvoPilot account (operator only; run in the Supabase SQL Editor).
-- Owner decision 2026-11-18: deleted accounts are restored only on the person's request, and only
-- within 30 days of deletion (after that the daily job has permanently erased them).
--
-- 1. Replace the email below with the address the person signed up with.
-- 2. Run it. The result says 'restored', 'not_found' or 'already_erased_or_not_deleted'.
-- 3. Tell the person they can sign in again with an email link.

with target as (
  select u.id as user_id, p.deletion_requested_at
    from auth.users u
    join public.profiles p on p.user_id = u.id
   where lower(u.email) = lower('person@example.com')   -- ← change this
),
restored_workspaces as (
  update public.workspaces w
     set deleted_at = null
    from target t
   where t.deletion_requested_at is not null
     and t.deletion_requested_at > now() - interval '30 days'
     and w.deleted_at is not null
     and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = t.user_id and m.role = 'owner')
  returning w.id
),
restored_profile as (
  update public.profiles p
     set deletion_requested_at = null
    from target t
   where p.user_id = t.user_id and t.deletion_requested_at > now() - interval '30 days'
  returning p.user_id
),
audit as (
  insert into public.audit_events (scope, workspace_id, actor_user_id, actor_kind, action, target_type, target_id, metadata)
  select 'account', null, null, 'system', 'account.restored', 'user', user_id::text, '{"by": "operator"}'::jsonb
    from restored_profile
  returning 1
)
select case
         when not exists (select 1 from target) then 'not_found'
         when exists (select 1 from restored_profile) then 'restored'
         else 'already_erased_or_not_deleted'
       end as result,
       (select count(*) from restored_workspaces) as workspaces_restored;
