-- M1.3 / 0006 — token-bound, invite-only, passwordless account creation.
-- See docs/DATABASE.md §3.6. Remediated after the M1.3 security review (B1).
--
-- The client passes the raw invitation token in sign-up metadata:
--   signInWithOtp({ email, options: { shouldCreateUser: true, data: { invitation_token } } })
-- Observed with GoTrue v2.197.0 (M1.3 remediation):
--   * the before_user_created hook receives user.user_metadata (including the token)
--     but no password information;
--   * /otp and password /signup produce identical INSERTs (GoTrue gives OTP users a
--     random password internally), so password sign-up cannot be told apart at creation;
--   * GoTrue rewrites raw_user_meta_data from memory in later UPDATEs, so the token must
--     be stripped on UPDATE as well as INSERT.
-- Therefore: the hook and an INSERT trigger both require the token; the INSERT trigger
-- consumes the invitation atomically, strips the token and removes the password hash;
-- an UPDATE trigger strips the token and rejects any password write.

-- 1) Early, clean rejection (HTTP 403) before GoTrue writes anything.
create function app_private.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
  v_token text := event -> 'user' -> 'user_metadata' ->> 'invitation_token';
begin
  if v_email is not null and v_token is not null and char_length(v_token) <= 200 and exists (
    select 1 from app_private.invitations i
     where i.token_hash = extensions.digest(v_token, 'sha256')
       and i.email_normalized = v_email
       and i.consumed_at is null
       and i.revoked_at is null
       and i.expires_at > pg_catalog.now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign-up requires a valid invitation.'));
end;
$$;
revoke execute on function app_private.before_user_created_hook(jsonb) from public, anon, authenticated;
grant execute on function app_private.before_user_created_hook(jsonb) to supabase_auth_admin;

-- 2) Authoritative check: runs for every insert into auth.users, however it is made.
-- Consumes the invitation atomically (row lock on the invitation; a concurrent second
-- attempt re-evaluates after the first commits and finds it consumed), strips the token
-- and removes the password hash. Error messages never include the token.
create function app_private.bind_invitation_on_user_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := new.raw_user_meta_data ->> 'invitation_token';
  v_inv uuid;
begin
  if v_token is null or char_length(v_token) > 200 then
    raise exception 'sign-up requires a valid invitation' using errcode = '42501';
  end if;

  update app_private.invitations i
     set consumed_at = pg_catalog.now(), consumed_by = new.id
   where i.token_hash = extensions.digest(v_token, 'sha256')
     and i.email_normalized = lower(btrim(new.email))
     and i.consumed_at is null
     and i.revoked_at is null
     and i.expires_at > pg_catalog.now()
  returning i.id into v_inv;

  if v_inv is null then
    raise exception 'sign-up requires a valid invitation' using errcode = '42501';
  end if;

  new.raw_user_meta_data := new.raw_user_meta_data - 'invitation_token';
  -- Passwordless accounts only (approved: magic link / OTP). No usable password hash.
  new.encrypted_password := null;
  return new;
end;
$$;
revoke execute on function app_private.bind_invitation_on_user_insert() from public, anon, authenticated;

create trigger bind_invitation_on_user_insert
  before insert on auth.users
  for each row execute function app_private.bind_invitation_on_user_insert();

-- 3) Every later write: never persist the token; never accept a password.
create function app_private.enforce_passwordless_on_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'invitation_token' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'invitation_token';
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    raise exception 'password authentication is disabled' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.enforce_passwordless_on_user_update() from public, anon, authenticated;

create trigger enforce_passwordless_on_user_update
  before update on auth.users
  for each row execute function app_private.enforce_passwordless_on_user_update();

-- 3b) GoTrue copies sign-up metadata into auth.identities.identity_data: it INSERTs the
-- identity with the token at sign-up and UPDATEs identity_data (token included, from
-- memory) at email confirmation (observed with GoTrue v2.197.0; M1.3 re-review finding).
-- Strip the key on every insert and update. Only NEW is modified, so the function needs
-- no table privileges: SECURITY INVOKER, empty search_path, no EXECUTE grants.
create function app_private.strip_invitation_token_from_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(new.identity_data) = 'object' and new.identity_data ? 'invitation_token' then
    new.identity_data := new.identity_data - 'invitation_token';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.strip_invitation_token_from_identity() from public, anon, authenticated;

create trigger strip_invitation_token_from_identity
  before insert or update on auth.identities
  for each row execute function app_private.strip_invitation_token_from_identity();

-- 4) Provisioning, in the same transaction as the user insert. Any exception aborts the
-- user creation, so no partial records remain and the invitation is not consumed.
-- Trigger functions need no EXECUTE grant (checked at CREATE TRIGGER time).
create function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv uuid;
  v_ws uuid;
begin
  select i.id into v_inv from app_private.invitations i where i.consumed_by = new.id;
  if v_inv is null then
    raise exception 'sign-up requires a valid invitation' using errcode = '42501';
  end if;

  insert into public.profiles (user_id) values (new.id);
  insert into public.workspaces (name, created_by) values ('Personal', new.id) returning id into v_ws;
  insert into public.workspace_settings (workspace_id) values (v_ws);
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  perform app_private.write_audit('account', null, null, 'account.provisioned', 'user', new.id::text,
    jsonb_build_object('invitation_id', v_inv, 'workspace_id', v_ws));
  return new;
end;
$$;
revoke execute on function app_private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();
