-- v0.1 acceptance / 0014 — security review fixes.
-- M1: the daily AI cost cap was checked before a model call and recorded after it, so concurrent
-- requests could all pass the check. Now every AI run first RESERVES its worst-case cost under a
-- row lock, and record_ai_usage() settles the real cost and releases the reservation.
-- A reservation left behind by a crashed request only lasts until the UTC day ends.

alter table public.ai_usage_daily
  add column reserved_micro_usd bigint not null default 0 check (reserved_micro_usd >= 0);

-- status: ok | over_cap | not_found | invalid
-- A lone request may start while today's spend is under the cap (as before); while others are in
-- flight, a new request must fit within the cap together with their reservations. Overshoot is
-- therefore bounded by one request's budget instead of being unbounded.
create function public.reserve_ai_usage(p_workspace_id uuid, p_amount_micro_usd bigint, p_cap_micro_usd bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_row public.ai_usage_daily;
begin
  if p_workspace_id is null or not app_private.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_amount_micro_usd is null or p_amount_micro_usd < 1 or p_amount_micro_usd > 100000000
     or p_cap_micro_usd is null or p_cap_micro_usd < 1 or p_cap_micro_usd > 1000000000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.ai_usage_daily (workspace_id, day) values (p_workspace_id, v_day) on conflict do nothing;
  select * into v_row from public.ai_usage_daily where workspace_id = p_workspace_id and day = v_day for update;
  if v_row.cost_micro_usd >= p_cap_micro_usd
     or (v_row.reserved_micro_usd > 0 and v_row.cost_micro_usd + v_row.reserved_micro_usd + p_amount_micro_usd > p_cap_micro_usd) then
    return jsonb_build_object('status', 'over_cap');
  end if;
  update public.ai_usage_daily set reserved_micro_usd = reserved_micro_usd + p_amount_micro_usd
   where workspace_id = p_workspace_id and day = v_day;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.reserve_ai_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, bigint, bigint) to authenticated;

-- Settles one model run: adds its real usage and releases its reservation.
drop function public.record_ai_usage(uuid, int, int, bigint);
create function public.record_ai_usage(p_workspace_id uuid, p_input_tokens int, p_output_tokens int, p_cost_micro_usd bigint,
                                       p_release_micro_usd bigint default 0)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total bigint;
begin
  if not app_private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_input_tokens is null or p_input_tokens < 0 or p_output_tokens is null or p_output_tokens < 0
     or p_cost_micro_usd is null or p_cost_micro_usd < 0 or p_cost_micro_usd > 100000000
     or p_release_micro_usd is null or p_release_micro_usd < 0 or p_release_micro_usd > 100000000 then
    raise exception 'invalid usage' using errcode = '22023';
  end if;
  insert into public.ai_usage_daily as u (workspace_id, day, requests, input_tokens, output_tokens, cost_micro_usd)
  values (p_workspace_id, (pg_catalog.now() at time zone 'utc')::date, 1, p_input_tokens, p_output_tokens, p_cost_micro_usd)
  on conflict (workspace_id, day) do update
     set requests = u.requests + 1,
         input_tokens = u.input_tokens + excluded.input_tokens,
         output_tokens = u.output_tokens + excluded.output_tokens,
         cost_micro_usd = u.cost_micro_usd + excluded.cost_micro_usd,
         reserved_micro_usd = greatest(0, u.reserved_micro_usd - p_release_micro_usd)
  returning cost_micro_usd into v_total;
  return v_total;
end;
$$;
revoke execute on function public.record_ai_usage(uuid, int, int, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, int, int, bigint, bigint) to authenticated;
