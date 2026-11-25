-- Production-readiness review 2026-11-25.
-- 1) A request killed by the hosting time limit never settles its AI cost reservation, which then
--    blocked the user's AI until midnight. reserve_ai_usage() now first releases this workspace's
--    open reservations older than 10 minutes (pages allow 5 minutes; the app's own deadline is 4).
-- 2) An analysis or draft and its citations were saved in two calls, so a failure in between left
--    an AI result without its evidence. Each is now saved by one function in one transaction.
--    The functions run with the caller's rights (security invoker): the existing insert policies
--    and grants still decide what is allowed.

-- ---------------------------------------------------------------- 1. stale reservations
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
  v_stale record;
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

  -- Release reservations abandoned by requests that were killed before settling.
  for v_stale in
    update app_private.ai_reservations set settled_at = pg_catalog.now()
     where workspace_id = p_workspace_id and settled_at is null and created_at < pg_catalog.now() - interval '10 minutes'
    returning day, amount_micro_usd
  loop
    update public.ai_usage_daily set reserved_micro_usd = greatest(0, reserved_micro_usd - v_stale.amount_micro_usd)
     where workspace_id = p_workspace_id and day = v_stale.day;
  end loop;
  select * into v_row from public.ai_usage_daily where workspace_id = p_workspace_id and day = v_day;

  if v_row.cost_micro_usd >= p_cap_micro_usd
     or (v_row.reserved_micro_usd > 0 and v_row.cost_micro_usd + v_row.reserved_micro_usd + p_amount_micro_usd > p_cap_micro_usd) then
    return jsonb_build_object('status', 'over_cap');
  end if;
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

-- ---------------------------------------------------------------- 2. atomic AI saves
-- p_citations: [{"message_id": uuid, "quote": text|null}, …] (at most 200).
create function public.save_thread_analysis(
  p_workspace_id uuid, p_conversation_id uuid, p_analysis jsonb,
  p_ai_provider text, p_ai_model text, p_prompt_version text, p_input_tokens int, p_output_tokens int,
  p_citations jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_citations) is distinct from 'array' or jsonb_array_length(p_citations) > 200 then
    raise exception 'invalid citations' using errcode = '22023';
  end if;
  insert into public.thread_analyses (workspace_id, conversation_id, analysis, ai_provider, ai_model, prompt_version, input_tokens, output_tokens)
  values (p_workspace_id, p_conversation_id, p_analysis, p_ai_provider, p_ai_model, p_prompt_version, p_input_tokens, p_output_tokens)
  returning id into v_id;
  insert into public.citations (workspace_id, thread_analysis_id, message_id, quote)
  select p_workspace_id, v_id, c.message_id, c.quote
    from jsonb_to_recordset(p_citations) as c(message_id uuid, quote text);
  return v_id;
end;
$$;
revoke execute on function public.save_thread_analysis(uuid, uuid, jsonb, text, text, text, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.save_thread_analysis(uuid, uuid, jsonb, text, text, text, int, int, jsonb) to authenticated;

-- p_cited_message_ids: [uuid, …] (at most 200).
create function public.save_ai_draft(
  p_workspace_id uuid, p_conversation_id uuid, p_content text, p_tone text, p_length text,
  p_ai_provider text, p_ai_model text, p_prompt_version text, p_input_tokens int, p_output_tokens int,
  p_cited_message_ids jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_cited_message_ids) is distinct from 'array' or jsonb_array_length(p_cited_message_ids) > 200 then
    raise exception 'invalid citations' using errcode = '22023';
  end if;
  insert into public.drafts (workspace_id, conversation_id, content, tone, length, ai_provider, ai_model, prompt_version, input_tokens, output_tokens)
  values (p_workspace_id, p_conversation_id, p_content, p_tone, p_length, p_ai_provider, p_ai_model, p_prompt_version, p_input_tokens, p_output_tokens)
  returning id into v_id;
  insert into public.citations (workspace_id, draft_id, message_id)
  select p_workspace_id, v_id, m::uuid from jsonb_array_elements_text(p_cited_message_ids) as m;
  return v_id;
end;
$$;
revoke execute on function public.save_ai_draft(uuid, uuid, text, text, text, text, text, text, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.save_ai_draft(uuid, uuid, text, text, text, text, text, text, int, int, jsonb) to authenticated;
