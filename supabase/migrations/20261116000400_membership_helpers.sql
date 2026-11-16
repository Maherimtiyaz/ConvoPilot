-- M1.3 / 0004 — membership and operator helpers. See docs/DATABASE.md §3.4, §4.3.

create table app_private.platform_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by_note text check (granted_by_note is null or char_length(granted_by_note) <= 200)
);
revoke all on app_private.platform_operators from public, anon, authenticated;
-- Defence in depth (review L6): no policies, so only the table owner (definer functions) reads it.
alter table app_private.platform_operators enable row level security;

create function app_private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
     where m.workspace_id = ws
       and m.user_id = (select auth.uid())
       and w.deleted_at is null
  );
$$;
revoke execute on function app_private.is_workspace_member(uuid) from public, anon, authenticated;
grant execute on function app_private.is_workspace_member(uuid) to authenticated;

create function app_private.is_workspace_owner(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
     where m.workspace_id = ws
       and m.user_id = (select auth.uid())
       and m.role = 'owner'
       and w.deleted_at is null
  );
$$;
revoke execute on function app_private.is_workspace_owner(uuid) from public, anon, authenticated;
grant execute on function app_private.is_workspace_owner(uuid) to authenticated;

create function app_private.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Operator rights end as soon as the operator requests account deletion (review L3).
  select exists (
    select 1
      from app_private.platform_operators o
      join public.profiles p on p.user_id = o.user_id
     where o.user_id = (select auth.uid())
       and p.deletion_requested_at is null
  );
$$;
revoke execute on function app_private.is_platform_operator() from public, anon, authenticated;

-- Operator grants/revocations are audited (account scope). Granted only by a DBA via SQL.
create function app_private.audit_platform_operator_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.write_audit('account', null, null,
    case tg_op when 'INSERT' then 'operator.granted' else 'operator.revoked' end,
    'user', coalesce(new.user_id, old.user_id)::text, '{}'::jsonb);
  return null;
end;
$$;
revoke execute on function app_private.audit_platform_operator_change() from public, anon, authenticated;
create trigger platform_operators_audit after insert or delete on app_private.platform_operators
  for each row execute function app_private.audit_platform_operator_change();

-- Membership changes are audited (workspace scope).
create function app_private.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.write_audit('workspace', coalesce(new.workspace_id, old.workspace_id),
    (select auth.uid()),
    case tg_op when 'INSERT' then 'membership.added' else 'membership.removed' end,
    'user', coalesce(new.user_id, old.user_id)::text,
    jsonb_build_object('role', coalesce(new.role, old.role)));
  return null;
end;
$$;
revoke execute on function app_private.audit_membership_change() from public, anon, authenticated;
create trigger workspace_members_audit after insert or delete on public.workspace_members
  for each row execute function app_private.audit_membership_change();

-- Validates log_event's free-form inputs so private content cannot enter audit
-- records (review L2): fixed target types, identifier-shaped values, allow-listed
-- metadata keys with short identifier or numeric values.
create function app_private.is_safe_audit_identifier(p_value text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_value is null or p_value ~ '^[A-Za-z0-9_.:-]{1,64}$';
$$;
revoke execute on function app_private.is_safe_audit_identifier(text) from public, anon, authenticated;

create function app_private.is_safe_audit_metadata(p_metadata jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(p_metadata) = 'object'
     and not exists (
       select 1 from jsonb_each(p_metadata) e(k, v)
        where e.k not in ('tool', 'reason_code', 'count')
           or not (
             (jsonb_typeof(e.v) = 'string' and (e.v #>> '{}') ~ '^[A-Za-z0-9_.:-]{0,64}$')
             or (jsonb_typeof(e.v) = 'number' and (e.v #>> '{}')::numeric between 0 and 1000000)
           )
     );
$$;
revoke execute on function app_private.is_safe_audit_metadata(jsonb) from public, anon, authenticated;

-- Non-data events (docs/DATABASE.md §10.1 path 3). Actor forced to auth.uid();
-- workspace derived from the caller's own membership; fixed action allow-list.
create function public.log_event(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
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
  if p_action not in ('ai.policy_denied', 'export.requested') then
    raise exception 'action not allowed' using errcode = '22023';
  end if;
  if (p_target_type is not null and p_target_type not in ('tool', 'export', 'workspace'))
     or not app_private.is_safe_audit_identifier(p_target_id)
     or not app_private.is_safe_audit_metadata(coalesce(p_metadata, '{}'::jsonb)) then
    raise exception 'invalid audit event fields' using errcode = '22023';
  end if;
  select m.workspace_id into v_ws
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = v_uid and m.role = 'owner' and w.deleted_at is null
   order by m.created_at
   limit 1;
  if v_ws is null then
    raise exception 'no active workspace' using errcode = '42501';
  end if;
  perform app_private.write_audit('workspace', v_ws, v_uid, p_action, p_target_type, p_target_id,
    coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke execute on function public.log_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_event(text, text, text, jsonb) to authenticated;
