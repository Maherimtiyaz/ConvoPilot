-- Pre-launch / 0015 — retention, restore and permanent erasure (docs/DATABASE.md §8).
-- Owner decisions (2026-11-18): deleted data is kept 30 days, then permanently erased; users
-- restore their own deleted conversations and contacts during that time; a deleted account is
-- restored only by the operator, on request (docs/operations/restore-account.sql).
-- Engineering decision: erasure runs as a pg_cron job inside the database, so no service-role key
-- exists anywhere (replaces the "privileged runner" options in §4.5). Deleting the auth.users row
-- from SQL cascades to Auth identities, sessions and refresh tokens.

-- ---------------------------------------------------------------- retention window
create function app_private.retention_interval()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 days' $$;
revoke execute on function app_private.retention_interval() from public, anon, authenticated;

-- Emails of a soft-deleted contact, kept so a restore can bring them back (identifiers are removed
-- on delete so the same email can be saved as a new contact meanwhile).
alter table public.contacts add column deleted_emails text[];

-- Time zone for "today", "overdue" and "due this week" (IANA name; validated by the app).
alter table public.workspace_settings add column time_zone text not null default 'UTC'
  check (char_length(time_zone) between 1 and 64 and time_zone ~ '^[A-Za-z0-9_+/-]+$');
grant update (time_zone) on public.workspace_settings to authenticated;

-- ---------------------------------------------------------------- contact deletion keeps its emails
create or replace function public.soft_delete_contact(p_contact_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
begin
  select c.workspace_id into v_ws from public.contacts c where c.id = p_contact_id and c.deleted_at is null for update;
  if v_ws is null or not app_private.is_workspace_member(v_ws) then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.contacts
     set deleted_at = pg_catalog.now(),
         deleted_emails = (select array_agg(i.value_normalized order by i.value_normalized)
                             from public.contact_identifiers i
                            where i.workspace_id = v_ws and i.contact_id = p_contact_id and i.kind = 'email')
   where id = p_contact_id;
  -- Identifiers are removed so the email can be saved again as a new contact.
  delete from public.contact_identifiers where workspace_id = v_ws and contact_id = p_contact_id;
  perform app_private.write_audit('workspace', v_ws, (select auth.uid()), 'contact.deleted', 'contact', p_contact_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'deleted');
end;
$$;

-- ---------------------------------------------------------------- recently deleted (the caller's own)
-- status: ok. Items deleted within the retention window, newest first, with their erase date.
create function public.list_recently_deleted()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_items jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'ok', 'items', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(x order by x.deleted_at desc), '[]'::jsonb) into v_items from (
    select 'conversation' as kind, c.id, c.subject as title, c.deleted_at, c.deleted_at + app_private.retention_interval() as erase_at
      from public.conversations c
     where c.deleted_at is not null and c.deleted_at > pg_catalog.now() - app_private.retention_interval()
       and app_private.is_workspace_member(c.workspace_id)
    union all
    select 'contact', k.id, k.full_name, k.deleted_at, k.deleted_at + app_private.retention_interval()
      from public.contacts k
     where k.deleted_at is not null and k.deleted_at > pg_catalog.now() - app_private.retention_interval()
       and app_private.is_workspace_member(k.workspace_id)
     limit 200
  ) x;
  return jsonb_build_object('status', 'ok', 'items', v_items);
end;
$$;
revoke execute on function public.list_recently_deleted() from public, anon, authenticated;
grant execute on function public.list_recently_deleted() to authenticated;

-- ---------------------------------------------------------------- restore (definer, member, audited)
-- status: restored | not_found | duplicate (the same thread was imported again meanwhile)
create function public.restore_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.conversations;
begin
  select * into v_row from public.conversations
   where id = p_conversation_id and deleted_at is not null
     and deleted_at > pg_catalog.now() - app_private.retention_interval()
   for update;
  if v_row.id is null or not app_private.is_workspace_member(v_row.workspace_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from public.conversations c where c.workspace_id = v_row.workspace_id
              and c.import_hash = v_row.import_hash and c.deleted_at is null) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  -- Bring back exactly what was deleted together with the conversation.
  update public.conversations set deleted_at = null where id = v_row.id;
  update public.messages set deleted_at = null
   where workspace_id = v_row.workspace_id and conversation_id = v_row.id and deleted_at = v_row.deleted_at;
  update public.thread_analyses set deleted_at = null
   where workspace_id = v_row.workspace_id and conversation_id = v_row.id and deleted_at = v_row.deleted_at;
  update public.drafts set deleted_at = null
   where workspace_id = v_row.workspace_id and conversation_id = v_row.id and deleted_at = v_row.deleted_at;
  perform app_private.write_audit('workspace', v_row.workspace_id, (select auth.uid()), 'conversation.restored', 'conversation', v_row.id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'restored');
end;
$$;
revoke execute on function public.restore_conversation(uuid) from public, anon, authenticated;
grant execute on function public.restore_conversation(uuid) to authenticated;

-- status: restored | not_found. Emails now used by another contact stay with that contact
-- (reported as emails_skipped). Conversations from the restored emails are linked again.
create function public.restore_contact(p_contact_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.contacts;
  v_email text;
  v_skipped int := 0;
begin
  select * into v_row from public.contacts
   where id = p_contact_id and deleted_at is not null
     and deleted_at > pg_catalog.now() - app_private.retention_interval()
   for update;
  if v_row.id is null or not app_private.is_workspace_member(v_row.workspace_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.contacts set deleted_at = null, deleted_emails = null where id = v_row.id;
  foreach v_email in array coalesce(v_row.deleted_emails, '{}') loop
    if exists (select 1 from public.contact_identifiers i where i.workspace_id = v_row.workspace_id and i.kind = 'email' and i.value_normalized = v_email) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.contact_identifiers (workspace_id, contact_id, kind, value_normalized)
    values (v_row.workspace_id, v_row.id, 'email', v_email);
    insert into public.conversation_participants (workspace_id, conversation_id, contact_id, role)
    select distinct m.workspace_id, m.conversation_id, v_row.id, 'from'
      from public.messages m
     where m.workspace_id = v_row.workspace_id and m.sender_email = v_email and m.deleted_at is null
    on conflict do nothing;
  end loop;
  perform app_private.write_audit('workspace', v_row.workspace_id, (select auth.uid()), 'contact.restored', 'contact', v_row.id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'restored', 'emails_skipped', v_skipped);
end;
$$;
revoke execute on function public.restore_contact(uuid) from public, anon, authenticated;
grant execute on function public.restore_contact(uuid) to authenticated;

-- ---------------------------------------------------------------- permanent erasure (job only)
-- Erases everything soft-deleted longer than the retention window. Not callable through the API.
-- Derived records go with their source: erasing a conversation erases its messages, analyses,
-- drafts, citations, commitments and AI-proposed tasks; the user's own tasks are kept, unlinked.
-- Returns counts only (no content).
create function app_private.purge_expired(p_now timestamptz default pg_catalog.now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := p_now - app_private.retention_interval();
  v_conversations int := 0;
  v_contacts int := 0;
  v_accounts int := 0;
  v_user uuid;
  v_ws uuid;
begin
  -- 1. Accounts whose deletion request is older than the window: erase their workspaces, then
  --    the Auth user (cascades to profile, memberships, operator grant, identities and sessions).
  for v_user in
    select p.user_id from public.profiles p
     where p.deletion_requested_at is not null and p.deletion_requested_at < v_cutoff
  loop
    for v_ws in
      select w.id from public.workspaces w
       where w.deleted_at is not null
         and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = v_user and m.role = 'owner')
    loop
      delete from public.workspaces where id = v_ws;
    end loop;
    delete from auth.users where id = v_user;
    perform app_private.write_audit('account', null, null, 'account.erased', 'user', v_user::text, '{}'::jsonb);
    v_accounts := v_accounts + 1;
  end loop;

  -- 2. Conversations: keep the user's own tasks, unlinked; everything derived goes with it.
  update public.tasks t set conversation_id = null
    from public.conversations c
   where t.workspace_id = c.workspace_id and t.conversation_id = c.id and t.origin = 'user_stated'
     and c.deleted_at is not null and c.deleted_at < v_cutoff;
  with gone as (
    delete from public.conversations c where c.deleted_at is not null and c.deleted_at < v_cutoff returning 1
  ) select count(*) into v_conversations from gone;

  -- 3. Contacts: unlink commitments and tasks first (they are not erased with a contact).
  update public.commitments x set contact_id = null
    from public.contacts k
   where x.workspace_id = k.workspace_id and x.contact_id = k.id and k.deleted_at is not null and k.deleted_at < v_cutoff;
  update public.tasks t set contact_id = null
    from public.contacts k
   where t.workspace_id = k.workspace_id and t.contact_id = k.id and k.deleted_at is not null and k.deleted_at < v_cutoff;
  with gone as (
    delete from public.contacts k where k.deleted_at is not null and k.deleted_at < v_cutoff returning 1
  ) select count(*) into v_contacts from gone;

  -- 4. Drafts deleted on their own.
  delete from public.drafts d where d.deleted_at is not null and d.deleted_at < v_cutoff;

  return jsonb_build_object('accounts', v_accounts, 'conversations', v_conversations, 'contacts', v_contacts);
end;
$$;
revoke execute on function app_private.purge_expired(timestamptz) from public, anon, authenticated;

-- Daily at 03:17 UTC.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('convopilot-purge-expired', '17 3 * * *', $$select app_private.purge_expired()$$);
