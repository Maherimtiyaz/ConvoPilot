-- M4 / 0012 — contacts, companies, identifiers, conversation participants, keyword retrieval
-- (docs/DATABASE.md §2.2, §7, §8). RLS on every table; hard DELETE revoked; soft delete audited;
-- retrieval functions are SECURITY INVOKER so RLS removes deleted rows before ranking (§8.1).

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  domain text check (domain is null or domain ~ '^[a-z0-9.-]{1,253}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id)
);
create unique index companies_name_unique on public.companies (workspace_id, lower(name)) where deleted_at is null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  company_id uuid,
  role_title text check (role_title is null or char_length(role_title) <= 200),
  relationship_context text check (relationship_context is null or char_length(relationship_context) <= 2000),
  last_interaction_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.companies (workspace_id, id)
);
create index contacts_name_idx on public.contacts (workspace_id, lower(full_name)) where deleted_at is null;

create table public.contact_identifiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id uuid not null,
  kind text not null check (kind in ('email')),
  value_normalized text not null check (char_length(value_normalized) between 3 and 320 and value_normalized = lower(btrim(value_normalized))),
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, value_normalized),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade
);

create table public.conversation_participants (
  workspace_id uuid not null,
  conversation_id uuid not null,
  contact_id uuid not null,
  role text not null default 'from' check (role in ('from', 'to', 'cc')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, conversation_id, contact_id, role),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade
);
create index conversation_participants_contact_idx on public.conversation_participants (workspace_id, contact_id);
create index messages_sender_idx on public.messages (workspace_id, sender_email) where deleted_at is null;

create trigger companies_set_updated_at before update on public.companies for each row execute function app_private.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts for each row execute function app_private.set_updated_at();
create trigger companies_workspace_id_immutable before update on public.companies for each row execute function app_private.prevent_workspace_id_change();
create trigger contacts_workspace_id_immutable before update on public.contacts for each row execute function app_private.prevent_workspace_id_change();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_identifiers enable row level security;
alter table public.conversation_participants enable row level security;

revoke all on public.companies, public.contacts, public.contact_identifiers, public.conversation_participants
  from public, anon, authenticated;
grant select, insert on public.companies, public.contacts, public.contact_identifiers, public.conversation_participants to authenticated;
grant update (name, domain) on public.companies to authenticated;
grant update (full_name, company_id, role_title, relationship_context, last_interaction_at) on public.contacts to authenticated;

create policy companies_select on public.companies for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy companies_insert on public.companies for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy companies_update on public.companies for update to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null)
  with check ((select app_private.is_workspace_member(workspace_id)));

create policy contacts_select on public.contacts for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null);
create policy contacts_insert on public.contacts for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null and created_by = (select auth.uid()));
create policy contacts_update on public.contacts for update to authenticated
  using ((select app_private.is_workspace_member(workspace_id)) and deleted_at is null)
  with check ((select app_private.is_workspace_member(workspace_id)));

-- Child rows follow their parent's visibility (§8.2).
create policy contact_identifiers_select on public.contact_identifiers for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id))
         and exists (select 1 from public.contacts c where c.workspace_id = contact_identifiers.workspace_id and c.id = contact_identifiers.contact_id and c.deleted_at is null));
create policy contact_identifiers_insert on public.contact_identifiers for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)));

create policy conversation_participants_select on public.conversation_participants for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id))
         and exists (select 1 from public.conversations v where v.workspace_id = conversation_participants.workspace_id and v.id = conversation_participants.conversation_id and v.deleted_at is null)
         and exists (select 1 from public.contacts c where c.workspace_id = conversation_participants.workspace_id and c.id = conversation_participants.contact_id and c.deleted_at is null));
create policy conversation_participants_insert on public.conversation_participants for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------- save a contact (invoker: RLS applies)
-- Creates the contact (or returns the one that already owns this email), optionally a company,
-- and links every non-deleted conversation in which this email sent a message.
-- status: created | existing | invalid
create function public.save_contact(
  p_workspace_id uuid,
  p_full_name text,
  p_email text,
  p_company text default null,
  p_role_title text default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_contact uuid;
  v_company uuid;
  v_status text := 'created';
begin
  if p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 200
     or (v_email is not null and (char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
     or (p_company is not null and char_length(btrim(p_company)) > 200)
     or (p_role_title is not null and char_length(btrim(p_role_title)) > 200) then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_email is not null then
    select i.contact_id into v_contact from public.contact_identifiers i
     where i.workspace_id = p_workspace_id and i.kind = 'email' and i.value_normalized = v_email;
  end if;

  if v_contact is null then
    if nullif(btrim(coalesce(p_company, '')), '') is not null then
      select c.id into v_company from public.companies c
       where c.workspace_id = p_workspace_id and lower(c.name) = lower(btrim(p_company)) and c.deleted_at is null;
      if v_company is null then
        insert into public.companies (workspace_id, name, domain)
        values (p_workspace_id, btrim(p_company), case when v_email is not null then split_part(v_email, '@', 2) end)
        returning id into v_company;
      end if;
    end if;
    insert into public.contacts (workspace_id, full_name, company_id, role_title)
    values (p_workspace_id, btrim(p_full_name), v_company, nullif(btrim(coalesce(p_role_title, '')), ''))
    returning id into v_contact;
    if v_email is not null then
      insert into public.contact_identifiers (workspace_id, contact_id, kind, value_normalized)
      values (p_workspace_id, v_contact, 'email', v_email);
    end if;
  else
    v_status := 'existing';
  end if;

  if v_email is not null then
    insert into public.conversation_participants (workspace_id, conversation_id, contact_id, role)
    select distinct m.workspace_id, m.conversation_id, v_contact, 'from'
      from public.messages m
     where m.workspace_id = p_workspace_id and m.sender_email = v_email
    on conflict do nothing;
    update public.contacts c
       set last_interaction_at = coalesce(
             (select max(coalesce(m.sent_at, m.created_at)) from public.messages m
               where m.workspace_id = p_workspace_id and m.sender_email = v_email),
             c.last_interaction_at)
     where c.id = v_contact;
  end if;

  return jsonb_build_object('status', v_status, 'contact_id', v_contact);
end;
$$;
revoke execute on function public.save_contact(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_contact(uuid, text, text, text, text) to authenticated;

-- New imports from a known email are linked to its contact automatically.
create function app_private.link_message_to_contact()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.sender_email is not null then
    insert into public.conversation_participants (workspace_id, conversation_id, contact_id, role)
    select new.workspace_id, new.conversation_id, i.contact_id, 'from'
      from public.contact_identifiers i
     where i.workspace_id = new.workspace_id and i.kind = 'email' and i.value_normalized = new.sender_email
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function app_private.link_message_to_contact() from public, anon, authenticated;
create trigger messages_link_contact after insert on public.messages
  for each row execute function app_private.link_message_to_contact();

-- ---------------------------------------------------------------- soft delete (definer, audited)
create function public.soft_delete_contact(p_contact_id uuid)
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
  update public.contacts set deleted_at = pg_catalog.now() where id = p_contact_id;
  -- Identifiers are removed so the email can be saved again as a new contact.
  delete from public.contact_identifiers where workspace_id = v_ws and contact_id = p_contact_id;
  perform app_private.write_audit('workspace', v_ws, (select auth.uid()), 'contact.deleted', 'contact', p_contact_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'deleted');
end;
$$;
revoke execute on function public.soft_delete_contact(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_contact(uuid) to authenticated;

-- ---------------------------------------------------------------- retrieval (invoker: RLS applies)
-- Keyword search over non-deleted messages, optionally limited to one contact's conversations.
create function public.search_messages(p_workspace_id uuid, p_query text, p_contact_id uuid default null, p_limit int default 10)
returns table (
  message_id uuid,
  conversation_id uuid,
  subject text,
  message_position int,
  sender_name text,
  sender_email text,
  sent_at timestamptz,
  body_text text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.conversation_id, c.subject, m.position, m.sender_name, m.sender_email, m.sent_at,
         left(m.body_text, 4000),
         ts_rank(to_tsvector('simple', m.body_text), q.query)
    from public.messages m
    join public.conversations c on c.workspace_id = m.workspace_id and c.id = m.conversation_id
    cross join (select websearch_to_tsquery('simple', coalesce(p_query, '')) as query) q
   where m.workspace_id = p_workspace_id
     and char_length(btrim(coalesce(p_query, ''))) between 1 and 200
     and to_tsvector('simple', m.body_text) @@ q.query
     and (p_contact_id is null or exists (
           select 1 from public.conversation_participants p
            where p.workspace_id = m.workspace_id and p.conversation_id = m.conversation_id and p.contact_id = p_contact_id))
   order by 9 desc, m.sent_at desc nulls last
   limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;
revoke execute on function public.search_messages(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.search_messages(uuid, text, uuid, int) to authenticated;
