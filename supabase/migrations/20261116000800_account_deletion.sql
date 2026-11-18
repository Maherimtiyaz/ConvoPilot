-- M1.3 / 0008 — account deletion request (database side). See docs/DATABASE.md §8.6.
-- Session revocation (global sign-out with the user's own session) and permanent
-- deletion via the Auth Admin API (privileged runner) are NOT done here.

create function public.request_account_deletion()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, pg_catalog.now())
   where user_id = v_uid;

  for v_ws in
    update public.workspaces w
       set deleted_at = pg_catalog.now()
     where w.deleted_at is null
       and exists (select 1 from public.workspace_members m
                    where m.workspace_id = w.id and m.user_id = v_uid and m.role = 'owner')
    returning w.id
  loop
    perform app_private.write_audit('workspace', v_ws, v_uid, 'workspace.soft_deleted',
      'workspace', v_ws::text, jsonb_build_object('reason', 'account_deletion_requested'));
  end loop;

  perform app_private.write_audit('account', null, v_uid, 'account.deletion_requested', 'user',
    v_uid::text, '{}'::jsonb);
end;
$$;
revoke execute on function public.request_account_deletion() from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;
