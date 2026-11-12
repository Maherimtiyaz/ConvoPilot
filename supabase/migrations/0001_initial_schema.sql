-- ConvoPilot initial schema (MVP v0.1)
-- See docs/DATABASE.md. All user-owned tables are workspace-scoped with RLS.

create extension if not exists pgvector;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.users where id = auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  display_name text,
  writing_style_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index idx_users_workspace on public.users (workspace_id);

-- Auto-provision workspace + user row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspaces (name)
  values (coalesce(new.raw_user_meta_data ->> 'workspace_name', 'Personal workspace'))
  returning id into new_workspace_id;

  insert into public.users (id, workspace_id, email, display_name)
  values (
    new.id,
    new_workspace_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  domain text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  full_name text not null,
  email text,
  role text,
  relationship_context text,
  last_interaction_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_contacts_workspace_email on public.contacts (workspace_id, email);
create index idx_contacts_workspace_active on public.contacts (workspace_id) where deleted_at is null;

create table public.relationship_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_relationship_notes_contact on public.relationship_notes (contact_id);

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  subject text,
  source_type text not null default 'paste'
    check (source_type in ('paste', 'file', 'gmail', 'manual')),
  source_metadata jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_conversations_workspace on public.conversations (workspace_id, last_message_at desc);
create index idx_conversations_contact on public.conversations (contact_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_name text,
  sender_email text,
  body text not null,
  sent_at timestamptz,
  provenance text not null default 'paste' check (provenance in ('paste', 'file', 'api')),
  created_at timestamptz not null default now()
);
create index idx_messages_conversation on public.messages (conversation_id, sent_at);
create index idx_messages_workspace on public.messages (workspace_id);

create table public.message_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  origin text not null,
  file_name text,
  imported_at timestamptz not null default now()
);
create index idx_message_sources_message on public.message_sources (message_id);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  content text not null,
  tone text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  revision_of uuid references public.drafts (id) on delete set null,
  model_metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_drafts_workspace on public.drafts (workspace_id, status);

create table public.classifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  intent text,
  urgency text check (urgency in ('low', 'medium', 'high', 'urgent')),
  summary text,
  expected_response text,
  confidence numeric(3, 2) check (confidence >= 0 and confidence <= 1),
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_classifications_message on public.classifications (message_id);

-- ---------------------------------------------------------------------------
-- Productivity
-- ---------------------------------------------------------------------------

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  description text not null,
  owner text not null check (owner in ('me', 'them')),
  due_date date,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'completed', 'dismissed')),
  confidence numeric(3, 2) check (confidence >= 0 and confidence <= 1),
  is_confirmed boolean not null default false,
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_commitments_workspace_status on public.commitments (workspace_id, status);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  commitment_id uuid references public.commitments (id) on delete set null,
  origin text not null default 'manual' check (origin in ('manual', 'proposed')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tasks_workspace_status_due on public.tasks (workspace_id, status, due_date);

-- ---------------------------------------------------------------------------
-- Intelligence
-- ---------------------------------------------------------------------------

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  content text not null,
  kind text not null check (kind in ('fact', 'preference', 'context')),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'dismissed')),
  confidence numeric(3, 2) check (confidence >= 0 and confidence <= 1),
  is_confirmed boolean not null default false,
  source_message_id uuid references public.messages (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_memories_workspace_contact on public.memories (workspace_id, contact_id);

create table public.embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_type text not null check (owner_type in ('message', 'note', 'memory')),
  owner_id uuid not null,
  embedding vector(1536) not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique (owner_type, owner_id, model)
);
create index idx_embeddings_hnsw on public.embeddings using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_workspace on public.audit_logs (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'companies', 'contacts', 'relationship_notes', 'conversations',
    'drafts', 'commitments', 'tasks', 'memories'
  ]
  loop
    execute format(
      'create trigger set_updated_at_%s before update on public.%I
       for each row execute function public.set_updated_at()', t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.relationship_notes enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_sources enable row level security;
alter table public.drafts enable row level security;
alter table public.classifications enable row level security;
alter table public.commitments enable row level security;
alter table public.tasks enable row level security;
alter table public.memories enable row level security;
alter table public.embeddings enable row level security;
alter table public.audit_logs enable row level security;

-- Workspaces: a member can see/update only their own workspace.
create policy workspace_select on public.workspaces
  for select using (id = public.current_workspace_id());
create policy workspace_update on public.workspaces
  for update using (id = public.current_workspace_id());

-- Users: full access within own workspace; moving to another workspace fails
-- the WITH CHECK because current_workspace_id() is derived from the existing row.
create policy user_all on public.users
  for all using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

-- Generic workspace-scoped policies for all domain tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'relationship_notes', 'conversations', 'messages',
    'message_sources', 'drafts', 'classifications', 'commitments', 'tasks',
    'memories', 'embeddings', 'audit_logs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all
         using (workspace_id = public.current_workspace_id())
         with check (workspace_id = public.current_workspace_id())',
      'ws_all_' || t, t
    );
  end loop;
end;
$$;
