-- W1 / 0009 — public early-access waitlist. Separate from product sign-up: joining the waitlist
-- never creates an account or grants access. The operator later invites selected entries
-- (M1.5 console). See CLAUDE.md §11.

create table app_private.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique
    check (char_length(email_normalized) between 3 and 320 and email_normalized ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text not null check (char_length(full_name) between 1 and 120),
  role text not null check (role in ('founder', 'operator', 'investor', 'other')),
  company_size text not null check (company_size in ('solo', '2-10', '11-50', '51-200', '200+')),
  biggest_challenge text check (biggest_challenge is null or char_length(biggest_challenge) <= 500),
  consent_at timestamptz not null,
  source text check (source is null or source ~ '^[a-z0-9_-]{1,40}$'),
  status text not null default 'pending' check (status in ('pending', 'invited', 'declined')),
  invited_at timestamptz,
  invitation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index waitlist_entries_status_created_idx on app_private.waitlist_entries (status, created_at);
create trigger waitlist_entries_set_updated_at before update on app_private.waitlist_entries
  for each row execute function app_private.set_updated_at();
revoke all on app_private.waitlist_entries from public, anon, authenticated;
alter table app_private.waitlist_entries enable row level security;

-- Public entry point. Returns only {status}: 'ok' | 'invalid' | 'busy'.
-- * 'ok' is returned for new AND already-registered emails (no way to learn who joined).
-- * A global flood limit protects the table from scripted floods; per-IP limits and a bot
--   challenge are added at the edge once hosting is set up (CLAUDE.md §11).
create function public.join_waitlist(
  p_email text,
  p_full_name text,
  p_role text,
  p_company_size text,
  p_biggest_challenge text default null,
  p_consent boolean default false,
  p_source text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_challenge text := nullif(btrim(coalesce(p_biggest_challenge, '')), '');
  v_source text := nullif(lower(btrim(coalesce(p_source, ''))), '');
begin
  if coalesce(p_consent, false) is not true
     or char_length(v_email) not between 3 and 320
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(v_name) not between 1 and 120
     or coalesce(p_role, '') not in ('founder', 'operator', 'investor', 'other')
     or coalesce(p_company_size, '') not in ('solo', '2-10', '11-50', '51-200', '200+')
     or (v_challenge is not null and char_length(v_challenge) > 500)
     or (v_source is not null and v_source !~ '^[a-z0-9_-]{1,40}$') then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Serialise the flood check so concurrent requests cannot all pass it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('convopilot.waitlist', 0));
  if (select count(*) from app_private.waitlist_entries
       where created_at > pg_catalog.now() - interval '1 minute') >= 60 then
    return jsonb_build_object('status', 'busy');
  end if;

  insert into app_private.waitlist_entries
    (email_normalized, full_name, role, company_size, biggest_challenge, consent_at, source)
  values
    (v_email, v_name, p_role, p_company_size, v_challenge, pg_catalog.now(), v_source)
  on conflict (email_normalized) do nothing;

  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.join_waitlist(text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text, text, text, text, boolean, text)
  to anon, authenticated;
