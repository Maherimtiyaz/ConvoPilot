-- M3 / 0011 — Communication Studio content: conversations, messages, thread analyses, drafts,
-- citations (docs/DATABASE.md §2.2, §6, §7, §8) and the daily AI usage ledger (AGENT_DESIGN §9).
-- RLS on every table; hard DELETE revoked; soft delete only through audited definer functions;
-- workspace_id immutable; composite workspace-scoped foreign keys.

-- ---------------------------------------------------------------- tables
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 300),
  source_type text not null check (source_type in ('paste', 'file')),
  import_hash text not null check (import_hash ~ '^[0-9a-f]{64}$'),
  message_count int not null check (message_count between 1 and 50),
  last_message_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id)
);
create unique index conversations_import_once on public.conversations (workspace_id, import_hash) where deleted_at is null;
create index conversations_recent_idx on public.conversations (workspace_id, created_at desc) where deleted_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  position int not null check (position between 1 and 50),
  direction text not null check (direction in ('inbound', 'outbound', 'unknown')),
  sender_name text check (sender_name is null or char_length(sender_name) <= 200),
  sender_email text check (sender_email is null or char_length(sender_email) <= 320),
  sent_at timestamptz,
  body_text text not null check (char_length(body_text) between 1 and 50000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  source_file_name text check (source_file_name is null or char_length(source_file_name) <= 255),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, conversation_id, position),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade
);
create index messages_body_fts on public.messages using gin (to_tsvector('simple', body_text));

create table public.thread_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  analysis jsonb not null check (jsonb_typeof(analysis) = 'object'),
  ai_provider text not null check (char_length(ai_provider) <= 40),
  ai_model text not null check (char_length(ai_model) <= 80),
  prompt_version text not null check (prompt_version ~ '^[a-z][a-z0-9-]{1,40}@[0-9]{1,4}$'),
  input_tokens int not null check (input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade
);
create index thread_analyses_conv_idx on public.thread_analyses (workspace_id, conversation_id, created_at desc);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  content text not null check (char_length(content) between 1 and 20000),
  tone text not null check (tone in ('warm', 'neutral', 'formal')),
  length text not null check (length in ('short', 'medium', 'long')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  edited_by_user boolean not null default false,
  ai_provider text check (ai_provider is null or char_length(ai_provider) <= 40),
  ai_model text check (ai_model is null or char_length(ai_model) <= 80),
  prompt_version text check (prompt_version is null or prompt_version ~ '^[a-z][a-z0-9-]{1,40}@[0-9]{1,4}$'),
  input_tokens int check (input_tokens is null or input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade
);
create index drafts_conv_idx on public.drafts (workspace_id, conversation_id, created_at desc);

-- Exclusive-arc citations with real composite FKs (docs/DATABASE.md §6.2). Subjects in M3:
-- thread analyses and drafts (memories/commitments are added in M4/M5). Source: messages.
create table public.citations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  thread_analysis_id uuid,
  draft_id uuid,
  message_id uuid not null,
  quote text check (quote is null or char_length(quote) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (num_nonnulls(thread_analysis_id, draft_id) = 1),
  foreign key (workspace_id, thread_analysis_id) references public.thread_analyses (workspace_id, id) on delete cascade,
  foreign key (workspace_id, draft_id) references public.drafts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, message_id) references public.messages (workspace_id, id) on delete cascade
);
create index citations_analysis_idx on public.citations (workspace_id, thread_analysis_id);
create index citations_draft_idx on public.citations (workspace_id, draft_id);

-- Daily AI usage per workspace (cost cap; AGENT_DESIGN §9). Written only by record_ai_usage().
create table public.ai_usage_daily (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  requests int not null default 0 check (requests >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  primary key (workspace_id, day)
);

-- ---------------------------------------------------------------- triggers
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function app_private.set_updated_at();
create trigger drafts_set_updated_at before update on public.drafts
  for each row execute function app_private.set_updated_at();
create trigger conversations_workspace_id_immutable before update on public.conversations
  for each row execute function app_private.prevent_workspace_id_change();
create trigger drafts_workspace_id_immutable before update on public.drafts
  for each row execute function app_private.prevent_workspace_id_change();

-- ---------------------------------------------------------------- RLS and grants
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.thread_analyses enable row level security;
alter table public.drafts enable row level security;
alter table public.citations enable row level security;
alter table public.ai_usage_daily enable row level security;

revoke all on public.conversations, public.messages, public.thread_analyses, public.drafts,
  public.citations, public.ai_usage_daily from public, anon, authenticated;
grant select, insert on public.conversations, public.messages, public.thread_analyses, public.drafts,
  public.citations to authenticated;
grant update (subject) on public.conversations to authenticated;
grant update (content, tone, length, edited_by_user) on public.drafts to authenticated;
grant select on public.ai_usage_daily to authenticated;

create policy conversations_select on public.conversations for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy conversations_insert on public.conversations for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null and created_by = (select auth.uid()));
create policy conversations_update on public.conversations for update to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null)
  with check ((select app_private.is_workspace_member(workspace_id)));

create policy messages_select on public.messages for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy messages_insert on public.messages for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);

create policy thread_analyses_select on public.thread_analyses for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy thread_analyses_insert on public.thread_analyses for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null and created_by = (select auth.uid()));

create policy drafts_select on public.drafts for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy drafts_insert on public.drafts for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null
              and status = 'draft' and created_by = (select auth.uid()));
create policy drafts_update on public.drafts for update to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null)
  with check ((select app_private.is_workspace_member(workspace_id)));

-- Citations are visible only while their subject and source are visible (§8.2).
create policy citations_select on public.citations for select to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and exists (select 1 from public.messages m where m.workspace_id = citations.workspace_id and m.id = citations.message_id and m.deleted_at is null)
    and (thread_analysis_id is null or exists (select 1 from public.thread_analyses a where a.workspace_id = citations.workspace_id and a.id = citations.thread_analysis_id and a.deleted_at is null))
    and (draft_id is null or exists (select 1 from public.drafts d where d.workspace_id = citations.workspace_id and d.id = citations.draft_id and d.deleted_at is null))
  );
create policy citations_insert on public.citations for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)));

create policy ai_usage_daily_select on public.ai_usage_daily for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------- import (security invoker: RLS applies)
-- status: created | duplicate | invalid. Messages: [{sender_name, sender_email, sent_at, body, direction}]
create function public.import_conversation(
  p_workspace_id uuid,
  p_subject text,
  p_source_type text,
  p_source_file_name text,
  p_messages jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count int;
  v_hash text;
  v_existing uuid;
  v_id uuid;
  v_last timestamptz;
  m jsonb;
  i int := 0;
begin
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_count := jsonb_array_length(p_messages);
  if v_count < 1 or v_count > 50 or p_subject is null or char_length(btrim(p_subject)) not between 1 and 300
     or p_source_type not in ('paste', 'file') then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_messages::text, 'sha256'), 'hex');
  select c.id into v_existing from public.conversations c
   where c.workspace_id = p_workspace_id and c.import_hash = v_hash and c.deleted_at is null;
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate', 'conversation_id', v_existing);
  end if;

  select max(nullif(x ->> 'sent_at', '')::timestamptz) into v_last from jsonb_array_elements(p_messages) x;

  insert into public.conversations (workspace_id, subject, source_type, import_hash, message_count, last_message_at)
  values (p_workspace_id, btrim(p_subject), p_source_type, v_hash, v_count, v_last)
  returning id into v_id;

  for m in select * from jsonb_array_elements(p_messages) loop
    i := i + 1;
    insert into public.messages (workspace_id, conversation_id, position, direction, sender_name, sender_email,
                                 sent_at, body_text, content_hash, source_file_name)
    values (p_workspace_id, v_id, i,
            coalesce(m ->> 'direction', 'unknown'),
            nullif(btrim(m ->> 'sender_name'), ''),
            nullif(lower(btrim(m ->> 'sender_email')), ''),
            nullif(m ->> 'sent_at', '')::timestamptz,
            m ->> 'body',
            pg_catalog.encode(extensions.digest(
              coalesce(lower(btrim(m ->> 'sender_email')), '') || '|' || coalesce(m ->> 'sent_at', '') || '|' || btrim(m ->> 'body'),
              'sha256'), 'hex'),
            p_source_file_name);
  end loop;

  return jsonb_build_object('status', 'created', 'conversation_id', v_id);
end;
$$;
revoke execute on function public.import_conversation(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_conversation(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- soft delete (definer, audited)
-- status: deleted | not_found
create function public.soft_delete_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_now timestamptz := pg_catalog.now();
begin
  select c.workspace_id into v_ws from public.conversations c
   where c.id = p_conversation_id and c.deleted_at is null
   for update;
  if v_ws is null or not app_private.is_workspace_member(v_ws) then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.conversations set deleted_at = v_now where id = p_conversation_id;
  update public.messages set deleted_at = v_now where workspace_id = v_ws and conversation_id = p_conversation_id and deleted_at is null;
  update public.thread_analyses set deleted_at = v_now where workspace_id = v_ws and conversation_id = p_conversation_id and deleted_at is null;
  update public.drafts set deleted_at = v_now where workspace_id = v_ws and conversation_id = p_conversation_id and deleted_at is null;
  perform app_private.write_audit('workspace', v_ws, (select auth.uid()), 'conversation.deleted', 'conversation',
    p_conversation_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'deleted');
end;
$$;
revoke execute on function public.soft_delete_conversation(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_conversation(uuid) to authenticated;

create function public.soft_delete_draft(p_draft_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
begin
  select d.workspace_id into v_ws from public.drafts d where d.id = p_draft_id and d.deleted_at is null for update;
  if v_ws is null or not app_private.is_workspace_member(v_ws) then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.drafts set deleted_at = pg_catalog.now() where id = p_draft_id;
  perform app_private.write_audit('workspace', v_ws, (select auth.uid()), 'draft.deleted', 'draft', p_draft_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'deleted');
end;
$$;
revoke execute on function public.soft_delete_draft(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_draft(uuid) to authenticated;

-- ---------------------------------------------------------------- AI usage ledger
-- Adds one model call's usage to today's (UTC) total and returns the new cost total.
create function public.record_ai_usage(p_workspace_id uuid, p_input_tokens int, p_output_tokens int, p_cost_micro_usd bigint)
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
  return v_total;
end;
$$;
revoke execute on function public.record_ai_usage(uuid, int, int, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, int, int, bigint) to authenticated;
