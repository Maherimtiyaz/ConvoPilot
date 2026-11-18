-- M1.3 / 0002 — foundation tables. See docs/DATABASE.md §2.1, §3.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 200),
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  -- No FK to auth.users: the workspace must outlive Auth user deletion until the
  -- privileged runner permanently deletes its content (docs/DATABASE.md §8.6).
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  writing_style_profile jsonb not null default '{}'::jsonb,
  ai_hosted_processing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function app_private.set_updated_at();
create trigger workspace_settings_set_updated_at before update on public.workspace_settings
  for each row execute function app_private.set_updated_at();
create trigger workspace_settings_workspace_id_immutable before update on public.workspace_settings
  for each row execute function app_private.prevent_workspace_id_change();

-- created_by never changes.
create function app_private.prevent_created_by_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.prevent_created_by_change() from public, anon, authenticated;
create trigger workspaces_created_by_immutable before update on public.workspaces
  for each row execute function app_private.prevent_created_by_change();

-- Membership rows are immutable once created (docs/DATABASE.md §3.2).
create function app_private.prevent_membership_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'workspace membership rows are immutable' using errcode = '42501';
end;
$$;
revoke execute on function app_private.prevent_membership_update() from public, anon, authenticated;
create trigger workspace_members_immutable before update on public.workspace_members
  for each row execute function app_private.prevent_membership_update();
