-- M1.5 / 0010 — operator console: review the waitlist, invite in batches, decline, revoke.
-- Every function is SECURITY DEFINER with an empty search_path, callable only by `authenticated`,
-- and re-checks app_private.is_platform_operator() itself (CLAUDE.md §4–§5). Results are typed
-- jsonb statuses (not exceptions) so that denial audit events commit (review M1 pattern).
-- No message content is ever written to audit metadata.

-- Lets the app decide whether to show the console. Says nothing about anyone else.
create function public.current_user_is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and app_private.is_platform_operator();
$$;
revoke execute on function public.current_user_is_operator() from public, anon, authenticated;
grant execute on function public.current_user_is_operator() to authenticated;

-- Shared guard: returns null when the caller is an operator, otherwise the denial result.
create function app_private.operator_guard(p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if not app_private.is_platform_operator() then
    perform app_private.write_audit('account', null, v_uid, p_action || '_denied', 'waitlist', null, '{}'::jsonb);
    return jsonb_build_object('status', 'not_authorized');
  end if;
  return null;
end;
$$;
revoke execute on function app_private.operator_guard(text) from public, anon, authenticated;

-- Invitation state as the console shows it.
create function app_private.invitation_state(i app_private.invitations)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when i.id is null then null
    when i.consumed_at is not null then 'accepted'
    when i.revoked_at is not null then 'revoked'
    when i.expires_at <= pg_catalog.now() then 'expired'
    else 'open'
  end;
$$;
revoke execute on function app_private.invitation_state(app_private.invitations) from public, anon, authenticated;

-- status: ok | invalid | not_authenticated | not_authorized
-- p_status: null (all) | pending | invited | declined. Newest first.
create function public.list_waitlist(p_status text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_denied jsonb := app_private.operator_guard('waitlist.read');
  v_total int;
  v_entries jsonb;
  v_counts jsonb;
begin
  if v_denied is not null then
    return v_denied;
  end if;
  if (p_status is not null and p_status not in ('pending', 'invited', 'declined'))
     or p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select count(*) into v_total from app_private.waitlist_entries w
   where p_status is null or w.status = p_status;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb) into v_entries
    from (
      select w.id, w.email_normalized as email, w.full_name, w.role, w.company_size, w.biggest_challenge,
             w.source, w.status, w.created_at, w.invited_at, w.invitation_id,
             app_private.invitation_state(i) as invitation_state
        from app_private.waitlist_entries w
        left join app_private.invitations i on i.id = w.invitation_id
       where p_status is null or w.status = p_status
       order by w.created_at desc
       limit p_limit offset p_offset
    ) x;

  select jsonb_build_object(
           'all', count(*),
           'pending', count(*) filter (where status = 'pending'),
           'invited', count(*) filter (where status = 'invited'),
           'declined', count(*) filter (where status = 'declined'))
    into v_counts from app_private.waitlist_entries;

  perform app_private.write_audit('account', null, (select auth.uid()), 'waitlist.viewed', 'waitlist', null, '{}'::jsonb);
  return jsonb_build_object('status', 'ok', 'total', v_total, 'counts', v_counts, 'entries', v_entries);
end;
$$;
revoke execute on function public.list_waitlist(text, int, int) from public, anon, authenticated;
grant execute on function public.list_waitlist(text, int, int) to authenticated;

-- Invites up to 50 waitlist entries at once.
-- status: ok | invalid | not_authenticated | not_authorized
-- Per entry: created (with the one-time token) | already_invited | already_member | not_found | declined
create function public.invite_waitlist_entries(p_entry_ids uuid[], p_ttl interval default interval '7 days')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_denied jsonb := app_private.operator_guard('waitlist.invite');
  v_id uuid;
  v_entry app_private.waitlist_entries;
  v_state text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if v_denied is not null then
    return v_denied;
  end if;
  if p_entry_ids is null or cardinality(p_entry_ids) < 1 or cardinality(p_entry_ids) > 50
     or array_position(p_entry_ids, null) is not null
     or (select count(distinct x) from unnest(p_entry_ids) x) <> cardinality(p_entry_ids)
     or p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    return jsonb_build_object('status', 'invalid');
  end if;

  foreach v_id in array p_entry_ids loop
    select * into v_entry from app_private.waitlist_entries where id = v_id for update;
    if not found then
      v_results := v_results || jsonb_build_object('entry_id', v_id, 'status', 'not_found');
      continue;
    end if;
    if v_entry.status = 'declined' then
      v_results := v_results || jsonb_build_object('entry_id', v_id, 'email', v_entry.email_normalized, 'status', 'declined');
      continue;
    end if;
    if exists (select 1 from auth.users u where lower(u.email) = v_entry.email_normalized) then
      v_results := v_results || jsonb_build_object('entry_id', v_id, 'email', v_entry.email_normalized, 'status', 'already_member');
      continue;
    end if;

    -- create_invitation re-checks the operator, retires expired invitations and audits.
    v_result := public.create_invitation(v_entry.email_normalized, p_ttl);
    if v_result ->> 'status' = 'created' then
      update app_private.waitlist_entries
         set status = 'invited', invited_at = pg_catalog.now(), invitation_id = (v_result ->> 'invitation_id')::uuid
       where id = v_id;
      v_results := v_results || jsonb_build_object(
        'entry_id', v_id, 'email', v_entry.email_normalized, 'status', 'created',
        'token', v_result ->> 'token', 'expires_at', v_result -> 'expires_at');
    else
      select app_private.invitation_state(i) into v_state
        from app_private.invitations i where i.id = v_entry.invitation_id;
      v_results := v_results || jsonb_build_object('entry_id', v_id, 'email', v_entry.email_normalized,
        'status', coalesce(v_result ->> 'status', 'invalid'), 'invitation_state', v_state);
    end if;
  end loop;

  return jsonb_build_object('status', 'ok', 'results', v_results);
end;
$$;
revoke execute on function public.invite_waitlist_entries(uuid[], interval) from public, anon, authenticated;
grant execute on function public.invite_waitlist_entries(uuid[], interval) to authenticated;

-- Decline an entry, or put a declined entry back to pending. Invited entries are unchanged
-- (revoke the invitation instead).
-- status: ok | not_found | invalid | not_authenticated | not_authorized
create function public.set_waitlist_entry_status(p_entry_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_denied jsonb := app_private.operator_guard('waitlist.update');
  v_current text;
begin
  if v_denied is not null then
    return v_denied;
  end if;
  if p_entry_id is null or p_status is null or p_status not in ('pending', 'declined') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select status into v_current from app_private.waitlist_entries where id = p_entry_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_current = 'invited' then
    return jsonb_build_object('status', 'invalid');
  end if;
  update app_private.waitlist_entries set status = p_status where id = p_entry_id;
  perform app_private.write_audit('account', null, (select auth.uid()),
    case p_status when 'declined' then 'waitlist.declined' else 'waitlist.restored' end,
    'waitlist_entry', p_entry_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.set_waitlist_entry_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_waitlist_entry_status(uuid, text) to authenticated;

-- Invitations, newest first, with their state. Never returns tokens or hashes.
-- status: ok | invalid | not_authenticated | not_authorized
create function public.list_invitations(p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_denied jsonb := app_private.operator_guard('invitation.read');
  v_items jsonb;
begin
  if v_denied is not null then
    return v_denied;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb) into v_items
    from (
      select i.id, i.email_normalized as email, i.created_at, i.expires_at, i.consumed_at, i.revoked_at,
             app_private.invitation_state(i) as state
        from app_private.invitations i
       order by i.created_at desc
       limit p_limit offset p_offset
    ) x;
  return jsonb_build_object('status', 'ok', 'invitations', v_items);
end;
$$;
revoke execute on function public.list_invitations(int, int) from public, anon, authenticated;
grant execute on function public.list_invitations(int, int) to authenticated;
