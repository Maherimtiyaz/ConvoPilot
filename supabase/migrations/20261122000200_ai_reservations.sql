-- Security review 2026-11-22 (database, finding 1, medium) — one-time AI spend reservations.
-- Before: record_ai_usage() released any amount the caller named, so a signed-in user calling the
-- API directly could zero today's reservations and let many concurrent app requests pass the
-- daily cap. Now each reservation is its own private row; settling names that row and releases
-- exactly its amount, once. Unknown or already-settled ids release nothing.
-- Also (finding 3, low): size limits on JSON a user can write directly.

create table app_private.ai_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  amount_micro_usd bigint not null check (amount_micro_usd between 1 and 100000000),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index ai_reservations_open on app_private.ai_reservations (workspace_id, day) where settled_at is null;
alter table app_private.ai_reservations enable row level security; -- no policies, no grants: definer functions only
revoke all on app_private.ai_reservations from public, anon, authenticated;

-- status: ok (+ reservation_id) | over_cap | not_found | invalid
create or replace function public.reserve_ai_usage(p_workspace_id uuid, p_amount_micro_usd bigint, p_cap_micro_usd bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_row public.ai_usage_daily;
  v_id uuid;
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
  -- Housekeeping: reservation rows only matter for their own day.
  delete from app_private.ai_reservations where workspace_id = p_workspace_id and day < v_day - 1;
  insert into app_private.ai_reservations (workspace_id, day, amount_micro_usd)
  values (p_workspace_id, v_day, p_amount_micro_usd) returning id into v_id;
  update public.ai_usage_daily set reserved_micro_usd = reserved_micro_usd + p_amount_micro_usd
   where workspace_id = p_workspace_id and day = v_day;
  return jsonb_build_object('status', 'ok', 'reservation_id', v_id);
end;
$$;
revoke execute on function public.reserve_ai_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, bigint, bigint) to authenticated;

-- Settles one model run: adds its real usage and releases its own reservation (once).
drop function public.record_ai_usage(uuid, int, int, bigint, bigint);
create function public.record_ai_usage(p_workspace_id uuid, p_input_tokens int, p_output_tokens int, p_cost_micro_usd bigint,
                                       p_reservation_id uuid default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_released bigint;
  v_released_day date;
begin
  if not app_private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_input_tokens is null or p_input_tokens < 0 or p_output_tokens is null or p_output_tokens < 0
     or p_cost_micro_usd is null or p_cost_micro_usd < 0 or p_cost_micro_usd > 100000000 then
    raise exception 'invalid usage' using errcode = '22023';
  end if;
  insert into public.ai_usage_daily as u (workspace_id, day, requests, input_tokens, output_tokens, cost_micro_usd)
  values (p_workspace_id, (pg_catalog.now() at time zone 'utc')::date, 1, p_input_tokens, p_output_tokens, p_cost_micro_usd)
  on conflict (workspace_id, day) do update
     set requests = u.requests + 1,
         input_tokens = u.input_tokens + excluded.input_tokens,
         output_tokens = u.output_tokens + excluded.output_tokens,
         cost_micro_usd = u.cost_micro_usd + excluded.cost_micro_usd
  returning cost_micro_usd into v_total;
  if p_reservation_id is not null then
    update app_private.ai_reservations set settled_at = pg_catalog.now()
     where id = p_reservation_id and workspace_id = p_workspace_id and settled_at is null
    returning amount_micro_usd, day into v_released, v_released_day;
    if v_released is not null then
      update public.ai_usage_daily set reserved_micro_usd = greatest(0, reserved_micro_usd - v_released)
       where workspace_id = p_workspace_id and day = v_released_day;
    end if;
  end if;
  return v_total;
end;
$$;
revoke execute on function public.record_ai_usage(uuid, int, int, bigint, uuid) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, int, int, bigint, uuid) to authenticated;

-- Size limits on JSON written through the API (the app already validates far smaller shapes).
alter table public.workspace_settings add constraint writing_style_profile_size check (octet_length(writing_style_profile::text) <= 20000);
alter table public.thread_analyses add constraint analysis_size check (octet_length(analysis::text) <= 200000);
