-- M1.3 / 0005 — operator-issued, single-use, token-bound invitations.
-- See docs/DATABASE.md §3.5. Remediated after the M1.3 security review (B1, M1, M2, M3, L4, L6).

create table app_private.invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null check (char_length(email_normalized) between 3 and 320),
  token_hash bytea not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- First successful token check. Informational only: it NEVER authorises sign-up.
  -- Account creation requires the raw token itself (docs/DATABASE.md §3.6).
  verified_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('operator', 'expired_replaced')),
  check (expires_at > created_at),
  check ((revoked_at is null) = (revoked_reason is null))
);
-- At most one open (unconsumed, unrevoked) invitation per email. Expiry is handled
-- transactionally in create_invitation (an index predicate cannot depend on now()).
create unique index invitations_one_open_per_email
  on app_private.invitations (email_normalized)
  where consumed_at is null and revoked_at is null;
revoke all on app_private.invitations from public, anon, authenticated;
-- Defence in depth (review L6): no policies, so only definer functions read or write it.
alter table app_private.invitations enable row level security;

-- Typed result instead of exceptions so that denial audit events commit (review M1).
-- status: created | not_authenticated | not_authorized | invalid_email | invalid_ttl | already_invited
create function public.create_invitation(p_email text, p_ttl interval default interval '7 days')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
  v_retired uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if not app_private.is_platform_operator() then
    perform app_private.write_audit('account', null, v_uid, 'invitation.create_denied',
      'invitation', null, '{}'::jsonb);
    return jsonb_build_object('status', 'not_authorized');
  end if;
  if p_email is null or position('@' in p_email) = 0 or char_length(btrim(p_email)) > 320 then
    return jsonb_build_object('status', 'invalid_email');
  end if;
  if p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    return jsonb_build_object('status', 'invalid_ttl');
  end if;

  v_email := lower(btrim(p_email));
  -- Serialise invitation changes per email (concurrent create/re-invite; review M2).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('convopilot.invitation:' || v_email, 0));

  -- An expired open invitation is retired so the email can be re-invited (review M2).
  for v_retired in
    update app_private.invitations
       set revoked_at = pg_catalog.now(), revoked_reason = 'expired_replaced'
     where email_normalized = v_email
       and consumed_at is null
       and revoked_at is null
       and expires_at <= pg_catalog.now()
    returning id
  loop
    perform app_private.write_audit('account', null, v_uid, 'invitation.expired_replaced',
      'invitation', v_retired::text, '{}'::jsonb);
  end loop;

  if exists (select 1 from app_private.invitations
              where email_normalized = v_email and consumed_at is null and revoked_at is null) then
    return jsonb_build_object('status', 'already_invited');
  end if;

  v_token := pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires := pg_catalog.now() + p_ttl;
  begin
    insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
    values (v_email, extensions.digest(v_token, 'sha256'), v_uid, v_expires)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('status', 'already_invited');
  end;
  perform app_private.write_audit('account', null, v_uid, 'invitation.created', 'invitation',
    v_id::text, '{}'::jsonb);
  -- The plaintext token is returned once and never stored.
  return jsonb_build_object('status', 'created', 'invitation_id', v_id, 'token', v_token,
    'expires_at', v_expires);
end;
$$;
revoke execute on function public.create_invitation(text, interval) from public, anon, authenticated;
grant execute on function public.create_invitation(text, interval) to authenticated;

-- status: revoked | not_found | not_authenticated | not_authorized
create function public.revoke_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if not app_private.is_platform_operator() then
    perform app_private.write_audit('account', null, v_uid, 'invitation.revoke_denied',
      'invitation', p_invitation_id::text, '{}'::jsonb);
    return jsonb_build_object('status', 'not_authorized');
  end if;
  update app_private.invitations
     set revoked_at = pg_catalog.now(), revoked_reason = 'operator'
   where id = p_invitation_id and consumed_at is null and revoked_at is null
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform app_private.write_audit('account', null, v_uid, 'invitation.revoked', 'invitation',
    v_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'revoked');
end;
$$;
revoke execute on function public.revoke_invitation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- UX pre-check before the client requests a magic link. Returns only a boolean (same
-- shape for unknown email and wrong token) and does NOT authorise anything.
-- Unknown or invalid tokens cause no writes at all (review M3); only the first
-- successful verification of an invitation is recorded and audited.
-- Rate limiting is applied at the application edge (M1.4).
create function public.verify_invitation(p_token text, p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_first boolean;
begin
  if p_token is null or p_email is null or char_length(p_token) > 200 or char_length(p_email) > 320 then
    return false;
  end if;
  select i.id, i.verified_at is null into v_id, v_first
    from app_private.invitations i
   where i.token_hash = extensions.digest(p_token, 'sha256')
     and i.email_normalized = lower(btrim(p_email))
     and i.consumed_at is null
     and i.revoked_at is null
     and i.expires_at > pg_catalog.now();
  if v_id is null then
    return false;
  end if;
  if v_first then
    update app_private.invitations set verified_at = pg_catalog.now()
     where id = v_id and verified_at is null;
    if found then
      perform app_private.write_audit('account', null, (select auth.uid()), 'invitation.verified',
        'invitation', v_id::text, '{}'::jsonb);
    end if;
  end if;
  return true;
end;
$$;
revoke execute on function public.verify_invitation(text, text) from public, anon, authenticated;
grant execute on function public.verify_invitation(text, text) to anon, authenticated;
