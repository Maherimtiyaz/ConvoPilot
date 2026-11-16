-- M1.3 / 0007 — RLS, table and column privileges. See docs/DATABASE.md §4.4.

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.audit_events enable row level security;

-- Start from nothing, then grant the minimum.
revoke all on public.profiles, public.workspaces, public.workspace_members,
  public.workspace_settings, public.audit_events from public, anon, authenticated;

grant select on public.profiles, public.workspaces, public.workspace_members,
  public.workspace_settings, public.audit_events to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (name) on public.workspaces to authenticated;
grant update (writing_style_profile, ai_hosted_processing_opt_in) on public.workspace_settings to authenticated;
-- No INSERT/DELETE for API roles on any of these tables; no access at all for anon.

-- profiles: own row only.
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- workspaces: members read (non-deleted, enforced in the helper); owners rename.
create policy workspaces_select on public.workspaces for select to authenticated
  using ((select app_private.is_workspace_member(id)));
create policy workspaces_update on public.workspaces for update to authenticated
  using ((select app_private.is_workspace_owner(id)))
  with check ((select app_private.is_workspace_owner(id)));

-- workspace_members: read rows of own non-deleted workspaces; never written by users.
create policy workspace_members_select on public.workspace_members for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

-- workspace_settings: members read; owner updates.
create policy workspace_settings_select on public.workspace_settings for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));
create policy workspace_settings_update on public.workspace_settings for update to authenticated
  using ((select app_private.is_workspace_owner(workspace_id)))
  with check ((select app_private.is_workspace_owner(workspace_id)));

-- audit_events: workspace-scope events readable by the workspace owner only.
create policy audit_events_select on public.audit_events for select to authenticated
  using (scope = 'workspace' and (select app_private.is_workspace_owner(workspace_id)));
