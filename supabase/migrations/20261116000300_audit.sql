-- M1.3 / 0003 — append-only audit events with trusted writers only.
-- See docs/DATABASE.md §10.

create table public.audit_events (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('workspace', 'account')),
  -- No FK to workspaces: workspace-scope events outlive workspace deletion (§8.5).
  workspace_id uuid,
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'system')),
  action text not null check (char_length(action) <= 100),
  target_type text check (target_type is null or char_length(target_type) <= 100),
  target_id text check (target_id is null or char_length(target_id) <= 200),
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.octet_length(metadata::text) <= 2048),
  created_at timestamptz not null default now(),
  check ((scope = 'workspace') = (workspace_id is not null)),
  check ((actor_kind = 'user') = (actor_user_id is not null))
);
create index audit_events_workspace_idx on public.audit_events (workspace_id, created_at);
-- Only trusted definer functions insert; API roles need no sequence access (review L1).
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated;

-- The only writer. No EXECUTE grant to any API role.
create function app_private.write_audit(
  p_scope text,
  p_workspace_id uuid,
  p_actor uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events
    (scope, workspace_id, actor_user_id, actor_kind, action, target_type, target_id, metadata)
  values
    (p_scope, p_workspace_id, p_actor,
     case when p_actor is null then 'system' else 'user' end,
     p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke execute on function app_private.write_audit(text, uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
