-- M1.3 / 0001 — private schema, extensions and fail-closed default privileges.
-- See docs/DATABASE.md §4.1–§4.3.

create extension if not exists pgcrypto with schema extensions;

-- Internal schema: never exposed through the Data API (config.toml [api] schemas = ["public"]).
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
-- RLS policies run as the caller and call app_private helpers, so the caller needs USAGE.
-- USAGE grants no table access and does not expose the schema through the API.
grant usage on schema app_private to authenticated;
-- Supabase Auth executes the before_user_created hook in app_private.
grant usage on schema app_private to supabase_auth_admin;

-- Fail closed for functions created later by postgres.
-- GLOBAL revoke is required: per-schema default privileges cannot remove PostgreSQL's
-- built-in EXECUTE-to-PUBLIC default (M1.3 Stage 0 finding).
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema app_private
  revoke execute on functions from public, anon, authenticated;

-- Fail closed for tables created later by postgres in public (in addition to
-- config.toml auto_expose_new_tables = false).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
-- Sequences too: the platform default grants UPDATE (nextval/setval) to API roles
-- (M1.3 review finding L1).
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- Generic trigger helpers (invoker; never callable by API roles).
create function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke execute on function app_private.set_updated_at() from public, anon, authenticated;

create function app_private.prevent_workspace_id_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.prevent_workspace_id_change() from public, anon, authenticated;
