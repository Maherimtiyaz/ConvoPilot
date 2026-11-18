-- M5 / 0013 — commitments and tasks with human approval (docs/DATABASE.md §5, §6, §8).
-- Rules enforced here, not only in the app:
--   * AI proposals are stored only through store_commitment_proposals(): status 'proposed', at least
--     one citation to a non-deleted message of the same conversation whose text contains the quote.
--   * status / origin / evidence / decision columns are never writable by the API: no INSERT or
--     UPDATE grants on these tables. Changes go through audited SECURITY DEFINER functions:
--     decide_proposal, approve_task, create_task, set_task_status.
--   * evidence_state follows source deletion (trigger on messages); status is never changed by it.
-- Every function re-checks membership, has an empty search_path and an explicit EXECUTE grant.

-- ---------------------------------------------------------------- helpers
create function app_private.normalize_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(coalesce(p, ''),
      pg_catalog.chr(8216) || pg_catalog.chr(8217) || pg_catalog.chr(8220) || pg_catalog.chr(8221),
      pg_catalog.chr(39) || pg_catalog.chr(39) || pg_catalog.chr(34) || pg_catalog.chr(34)), '\s+', ' ', 'g')));
$$;
revoke execute on function app_private.normalize_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- tables
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null,
  contact_id uuid,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  owner text not null check (owner in ('me', 'them')),
  due_date date,
  due_text_raw text check (due_text_raw is null or char_length(due_text_raw) between 1 and 200),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected', 'superseded')),
  origin text not null check (origin in ('user_stated', 'extracted', 'inferred')),
  evidence_state text not null default 'supported' check (evidence_state in ('supported', 'sources_hidden', 'sources_deleted')),
  confidence text check (confidence is null or confidence in ('low', 'medium', 'high')),
  decided_by uuid,
  decided_at timestamptz,
  supersedes_id uuid,
  ai_provider text,
  ai_model text,
  prompt_version text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  check ((status = 'proposed') = (decided_at is null) or origin = 'user_stated'),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id),
  foreign key (workspace_id, supersedes_id) references public.commitments (workspace_id, id)
);
create index commitments_conversation_idx on public.commitments (workspace_id, conversation_id) where deleted_at is null;
create index commitments_status_idx on public.commitments (workspace_id, status) where deleted_at is null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  status text not null check (status in ('proposed', 'open', 'done', 'dismissed', 'rejected')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  due_text_raw text check (due_text_raw is null or char_length(due_text_raw) between 1 and 200),
  contact_id uuid,
  conversation_id uuid,
  commitment_id uuid,
  origin text not null check (origin in ('user_stated', 'extracted', 'inferred')),
  decided_by uuid,
  decided_at timestamptz,
  completed_at timestamptz,
  ai_provider text,
  ai_model text,
  prompt_version text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  -- AI-proposed tasks carry no citations of their own; their evidence is the commitment (§5.6).
  check (origin = 'user_stated' or commitment_id is not null),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, commitment_id) references public.commitments (workspace_id, id) on delete cascade
);
create index tasks_status_idx on public.tasks (workspace_id, status, due_date) where deleted_at is null;
create index tasks_commitment_idx on public.tasks (workspace_id, commitment_id);

-- Citations gain the commitment arc (exclusive arc with real FKs, §6.2).
alter table public.citations add column commitment_id uuid;
alter table public.citations drop constraint citations_check;
alter table public.citations add constraint citations_one_subject check (num_nonnulls(thread_analysis_id, draft_id, commitment_id) = 1);
alter table public.citations add foreign key (workspace_id, commitment_id) references public.commitments (workspace_id, id) on delete cascade;
create index citations_commitment_idx on public.citations (workspace_id, commitment_id);
create index citations_message_idx on public.citations (workspace_id, message_id);

drop policy citations_select on public.citations;
create policy citations_select on public.citations for select to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and exists (select 1 from public.messages m where m.workspace_id = citations.workspace_id and m.id = citations.message_id and m.deleted_at is null)
    and (thread_analysis_id is null or exists (select 1 from public.thread_analyses a where a.workspace_id = citations.workspace_id and a.id = citations.thread_analysis_id and a.deleted_at is null))
    and (draft_id is null or exists (select 1 from public.drafts d where d.workspace_id = citations.workspace_id and d.id = citations.draft_id and d.deleted_at is null))
    and (commitment_id is null or exists (select 1 from public.commitments c where c.workspace_id = citations.workspace_id and c.id = citations.commitment_id and c.deleted_at is null))
  );
-- Commitment citations are written only by store_commitment_proposals().
drop policy citations_insert on public.citations;
create policy citations_insert on public.citations for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and commitment_id is null);

-- ---------------------------------------------------------------- triggers
create function app_private.enforce_proposal_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'commitments' and new.origin <> 'user_stated' and new.status <> 'proposed' then
      raise exception 'AI-origin commitments must start proposed' using errcode = '23514';
    end if;
    if tg_table_name = 'tasks' and new.origin = 'user_stated' and new.status <> 'open' then
      raise exception 'user tasks must start open' using errcode = '23514';
    end if;
    if tg_table_name = 'tasks' and new.origin <> 'user_stated' and new.status <> 'proposed' then
      raise exception 'AI-origin tasks must start proposed' using errcode = '23514';
    end if;
  elsif new.origin is distinct from old.origin then
    raise exception 'origin is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.enforce_proposal_rules() from public, anon, authenticated;

create trigger commitments_proposal_rules before insert or update on public.commitments
  for each row execute function app_private.enforce_proposal_rules();
create trigger tasks_proposal_rules before insert or update on public.tasks
  for each row execute function app_private.enforce_proposal_rules();
create trigger commitments_set_updated_at before update on public.commitments for each row execute function app_private.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function app_private.set_updated_at();
create trigger commitments_workspace_id_immutable before update on public.commitments for each row execute function app_private.prevent_workspace_id_change();
create trigger tasks_workspace_id_immutable before update on public.tasks for each row execute function app_private.prevent_workspace_id_change();

-- Evidence follows its sources (§5.5): when a cited message is soft-deleted (or restored), every
-- commitment citing it is re-evaluated. status is never touched.
create function app_private.refresh_commitment_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.commitments c
     set evidence_state = case
           when exists (select 1 from public.citations ci join public.messages m on m.workspace_id = ci.workspace_id and m.id = ci.message_id
                         where ci.workspace_id = c.workspace_id and ci.commitment_id = c.id and m.deleted_at is null)
           then 'supported' else 'sources_hidden' end
   where c.workspace_id = new.workspace_id
     and c.origin <> 'user_stated'
     and c.id in (select ci.commitment_id from public.citations ci where ci.workspace_id = new.workspace_id and ci.message_id = new.id and ci.commitment_id is not null);
  return null;
end;
$$;
revoke execute on function app_private.refresh_commitment_evidence() from public, anon, authenticated;
create trigger messages_refresh_commitment_evidence after update of deleted_at on public.messages
  for each row when (old.deleted_at is distinct from new.deleted_at)
  execute function app_private.refresh_commitment_evidence();

-- ---------------------------------------------------------------- RLS and grants (read-only API)
alter table public.commitments enable row level security;
alter table public.tasks enable row level security;
revoke all on public.commitments, public.tasks from public, anon, authenticated;
grant select on public.commitments, public.tasks to authenticated;

create policy commitments_select on public.commitments for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy tasks_select on public.tasks for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);

-- ---------------------------------------------------------------- store AI proposals
-- p_items: [{description, owner: me|them, origin: extracted|inferred, confidence, due_date (YYYY-MM-DD|null),
--            due_text (text|null), citations: [{message_id, quote}], task: {title}|null}]
-- p_meta: {provider, model, prompt_version}
-- status: ok | invalid | not_found. Per run: created, duplicates, unsupported counts; never raises on content.
create function public.store_commitment_proposals(p_workspace_id uuid, p_conversation_id uuid, p_items jsonb, p_meta jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  item jsonb;
  c jsonb;
  v_id uuid;
  v_contact uuid;
  v_valid uuid[];
  v_quotes text[];
  v_msg uuid;
  v_created int := 0;
  v_dupes int := 0;
  v_unsupported int := 0;
  v_tasks int := 0;
  v_ids uuid[] := '{}';
  v_due date;
begin
  if v_uid is null or p_workspace_id is null or not app_private.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not exists (select 1 from public.conversations where workspace_id = p_workspace_id and id = p_conversation_id and deleted_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20
     or p_meta is null or jsonb_typeof(p_meta) <> 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object'
       or char_length(btrim(coalesce(item ->> 'description', ''))) not between 1 and 500
       or coalesce(item ->> 'owner', '') not in ('me', 'them')
       or coalesce(item ->> 'origin', '') not in ('extracted', 'inferred')
       or jsonb_typeof(item -> 'citations') is distinct from 'array' then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- Never re-propose something already proposed, confirmed or rejected in this conversation.
    if exists (select 1 from public.commitments x where x.workspace_id = p_workspace_id and x.conversation_id = p_conversation_id
                and x.deleted_at is null and app_private.normalize_text(x.description) = app_private.normalize_text(item ->> 'description')) then
      v_dupes := v_dupes + 1;
      continue;
    end if;

    -- Keep only citations to visible messages of this conversation whose text contains the quote.
    v_valid := '{}';
    v_quotes := '{}';
    for c in select * from jsonb_array_elements(item -> 'citations') limit 4 loop
      v_msg := null;
      if jsonb_typeof(c) = 'object' and (c ->> 'message_id') ~ '^[0-9a-f-]{36}$'
         and char_length(app_private.normalize_text(c ->> 'quote')) between 1 and 300 then
        select m.id into v_msg from public.messages m
         where m.workspace_id = p_workspace_id and m.conversation_id = p_conversation_id
           and m.id = (c ->> 'message_id')::uuid and m.deleted_at is null
           and pg_catalog.strpos(app_private.normalize_text(m.body_text), app_private.normalize_text(c ->> 'quote')) > 0;
      end if;
      if v_msg is not null then
        v_valid := v_valid || v_msg;
        v_quotes := v_quotes || left(c ->> 'quote', 1000);
      end if;
    end loop;
    if cardinality(v_valid) = 0 then
      v_unsupported := v_unsupported + 1;
      continue;
    end if;

    v_due := case when (item ->> 'due_date') ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'due_date')::date end;

    -- The other person: the sender of the first cited received message, else any linked participant.
    select ci.contact_id into v_contact
      from public.messages m
      join public.contact_identifiers ci on ci.workspace_id = m.workspace_id and ci.kind = 'email' and ci.value_normalized = m.sender_email
      join public.contacts k on k.workspace_id = ci.workspace_id and k.id = ci.contact_id and k.deleted_at is null
     where m.workspace_id = p_workspace_id and m.id = any (v_valid) and m.direction <> 'outbound'
     limit 1;
    if v_contact is null then
      select p.contact_id into v_contact from public.conversation_participants p
        join public.contacts k on k.workspace_id = p.workspace_id and k.id = p.contact_id and k.deleted_at is null
       where p.workspace_id = p_workspace_id and p.conversation_id = p_conversation_id
       order by p.created_at limit 1;
    end if;

    insert into public.commitments (workspace_id, conversation_id, contact_id, description, owner, due_date, due_text_raw,
                                    status, origin, confidence, ai_provider, ai_model, prompt_version, created_by)
    values (p_workspace_id, p_conversation_id, v_contact, btrim(item ->> 'description'), item ->> 'owner', v_due,
            nullif(left(btrim(coalesce(item ->> 'due_text', '')), 200), ''),
            'proposed', item ->> 'origin',
            case when item ->> 'confidence' in ('low', 'medium', 'high') then item ->> 'confidence' end,
            left(p_meta ->> 'provider', 100), left(p_meta ->> 'model', 100), left(p_meta ->> 'prompt_version', 100), v_uid)
    returning id into v_id;

    for i in 1 .. cardinality(v_valid) loop
      insert into public.citations (workspace_id, commitment_id, message_id, quote)
      values (p_workspace_id, v_id, v_valid[i], v_quotes[i]);
    end loop;

    if jsonb_typeof(item -> 'task') = 'object' and char_length(btrim(coalesce(item -> 'task' ->> 'title', ''))) between 1 and 200 then
      insert into public.tasks (workspace_id, title, status, due_date, due_text_raw, contact_id, conversation_id, commitment_id,
                                origin, ai_provider, ai_model, prompt_version, created_by)
      values (p_workspace_id, btrim(item -> 'task' ->> 'title'), 'proposed', v_due,
              nullif(left(btrim(coalesce(item ->> 'due_text', '')), 200), ''), v_contact, p_conversation_id, v_id,
              item ->> 'origin', left(p_meta ->> 'provider', 100), left(p_meta ->> 'model', 100), left(p_meta ->> 'prompt_version', 100), v_uid);
      v_tasks := v_tasks + 1;
    end if;

    v_ids := v_ids || v_id;
    v_created := v_created + 1;
  end loop;

  if v_created > 0 then
    perform app_private.write_audit('workspace', p_workspace_id, v_uid, 'commitment.proposed', 'conversation', p_conversation_id::text,
      jsonb_build_object('commitments', v_created, 'tasks', v_tasks));
  end if;
  return jsonb_build_object('status', 'ok', 'created', v_created, 'tasks', v_tasks, 'duplicates', v_dupes,
                            'unsupported', v_unsupported, 'commitment_ids', to_jsonb(v_ids));
end;
$$;
revoke execute on function public.store_commitment_proposals(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.store_commitment_proposals(uuid, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- decisions (user actions only)
-- p_kind: commitment | task. p_decision: confirm | reject.
-- Tasks are confirmed only through approve_task (their evidence is the commitment).
-- status: ok | not_found | invalid | invalid_transition | unsupported
create function public.decide_proposal(p_kind text, p_id uuid, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_status text;
  v_evidence text;
  v_task uuid;
begin
  if v_uid is null or p_id is null or p_kind not in ('commitment', 'task') or p_decision not in ('confirm', 'reject') then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_kind = 'commitment' then
    select workspace_id, status, evidence_state into v_ws, v_status, v_evidence
      from public.commitments where id = p_id and deleted_at is null for update;
    if v_ws is null or not app_private.is_workspace_member(v_ws) then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_status <> 'proposed' then
      return jsonb_build_object('status', 'invalid_transition');
    end if;
    if p_decision = 'confirm' and v_evidence <> 'supported' then
      return jsonb_build_object('status', 'unsupported');
    end if;
    update public.commitments
       set status = case p_decision when 'confirm' then 'confirmed' else 'rejected' end, decided_by = v_uid, decided_at = pg_catalog.now()
     where id = p_id;
    perform app_private.write_audit('workspace', v_ws, v_uid,
      case p_decision when 'confirm' then 'commitment.confirmed' else 'commitment.rejected' end, 'commitment', p_id::text, '{}'::jsonb);
    -- A rejected commitment takes its still-proposed tasks with it.
    if p_decision = 'reject' then
      for v_task in
        update public.tasks set status = 'rejected', decided_by = v_uid, decided_at = pg_catalog.now()
         where workspace_id = v_ws and commitment_id = p_id and status = 'proposed' and deleted_at is null
        returning id
      loop
        perform app_private.write_audit('workspace', v_ws, v_uid, 'task.rejected', 'task', v_task::text, '{}'::jsonb);
      end loop;
    end if;
    return jsonb_build_object('status', 'ok');
  end if;

  select workspace_id, status into v_ws, v_status from public.tasks where id = p_id and deleted_at is null for update;
  if v_ws is null or not app_private.is_workspace_member(v_ws) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_status <> 'proposed' or p_decision <> 'reject' then
    return jsonb_build_object('status', 'invalid_transition');
  end if;
  update public.tasks set status = 'rejected', decided_by = v_uid, decided_at = pg_catalog.now() where id = p_id;
  perform app_private.write_audit('workspace', v_ws, v_uid, 'task.rejected', 'task', p_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.decide_proposal(text, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_proposal(text, uuid, text) to authenticated;

-- Atomic approval (§5.6): optionally confirms the proposed commitment, then opens the task.
-- All checks run before any write, so a refusal changes nothing.
-- status: ok | not_found | invalid_transition | commitment_not_confirmed | unsupported
create function public.approve_task(p_task_id uuid, p_confirm_commitment boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_task public.tasks;
  v_commitment public.commitments;
begin
  if v_uid is null or p_task_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_task from public.tasks where id = p_task_id and deleted_at is null for update;
  if v_task.id is null or not app_private.is_workspace_member(v_task.workspace_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_task.status <> 'proposed' then
    return jsonb_build_object('status', 'invalid_transition');
  end if;
  select * into v_commitment from public.commitments
   where workspace_id = v_task.workspace_id and id = v_task.commitment_id and deleted_at is null for update;
  if v_commitment.id is null then
    return jsonb_build_object('status', 'commitment_not_confirmed');
  end if;
  if v_commitment.evidence_state <> 'supported' then
    return jsonb_build_object('status', 'unsupported');
  end if;
  if v_commitment.status = 'proposed' and coalesce(p_confirm_commitment, false) then
    update public.commitments set status = 'confirmed', decided_by = v_uid, decided_at = pg_catalog.now() where id = v_commitment.id;
    perform app_private.write_audit('workspace', v_task.workspace_id, v_uid, 'commitment.confirmed', 'commitment', v_commitment.id::text, '{}'::jsonb);
  elsif v_commitment.status <> 'confirmed' then
    return jsonb_build_object('status', 'commitment_not_confirmed');
  end if;
  update public.tasks set status = 'open', decided_by = v_uid, decided_at = pg_catalog.now() where id = p_task_id;
  perform app_private.write_audit('workspace', v_task.workspace_id, v_uid, 'task.approved', 'task', p_task_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.approve_task(uuid, boolean) from public, anon, authenticated;
grant execute on function public.approve_task(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- the user's own tasks
-- status: created | invalid | not_found
create function public.create_task(p_workspace_id uuid, p_title text, p_due_date date default null,
                                   p_priority text default 'normal', p_conversation_id uuid default null)
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
  if v_uid is null or p_workspace_id is null or not app_private.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 or coalesce(p_priority, '') not in ('low', 'normal', 'high') then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_conversation_id is not null and not exists (
       select 1 from public.conversations where workspace_id = p_workspace_id and id = p_conversation_id and deleted_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.tasks (workspace_id, title, status, priority, due_date, conversation_id, origin, created_by)
  values (p_workspace_id, btrim(p_title), 'open', p_priority, p_due_date, p_conversation_id, 'user_stated', v_uid)
  returning id into v_id;
  perform app_private.write_audit('workspace', p_workspace_id, v_uid, 'task.created', 'task', v_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'created', 'task_id', v_id);
end;
$$;
revoke execute on function public.create_task(uuid, text, date, text, uuid) from public, anon, authenticated;
grant execute on function public.create_task(uuid, text, date, text, uuid) to authenticated;

-- open → done | dismissed; done | dismissed → open (undo). Proposed tasks need approve_task.
-- status: ok | not_found | invalid | invalid_transition
create function public.set_task_status(p_task_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_status text;
begin
  if v_uid is null or p_task_id is null or coalesce(p_status, '') not in ('open', 'done', 'dismissed') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select workspace_id, status into v_ws, v_status from public.tasks where id = p_task_id and deleted_at is null for update;
  if v_ws is null or not app_private.is_workspace_member(v_ws) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not ((v_status = 'open' and p_status in ('done', 'dismissed')) or (v_status in ('done', 'dismissed') and p_status = 'open')) then
    return jsonb_build_object('status', 'invalid_transition');
  end if;
  update public.tasks
     set status = p_status, completed_at = case when p_status = 'done' then pg_catalog.now() end
   where id = p_task_id;
  perform app_private.write_audit('workspace', v_ws, v_uid, case p_status when 'open' then 'task.reopened' else 'task.' || p_status end, 'task', p_task_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.set_task_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_task_status(uuid, text) to authenticated;
