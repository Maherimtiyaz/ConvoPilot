# ConvoPilot — Database Design

Version: 0.1 · Status: Draft for review · Engine: Supabase PostgreSQL + pgvector

## 1. Principles

- Every user-owned table carries `workspace_id` (uuid, not null) with **Row Level Security** enforcing `workspace_id = auth workspace of caller`.
- Raw input (imported messages) and AI-derived records (classifications, proposals, drafts, memories) are **separate tables/rows** with explicit status and provenance.
- Every AI-derived record references its source (`source_message_id` or `source_note_id`) and stores `confidence`, `is_confirmed`, `created_at`, `updated_at`.
- Soft-delete (`deleted_at`) on user content to support export/erasure with an audit trail.

## 2. MVP v0.1 schema

| Table | Purpose | Key columns |
| --- | --- | --- |
| `workspaces` | Tenant boundary | id, name, created_at |
| `users` | App users (mirrors `auth.users`) | id, workspace_id, email, display_name, writing_style_profile (jsonb) |
| `contacts` | People | workspace_id, full_name, email, company, role, relationship_context, last_interaction_at |
| `companies` | Organizations | workspace_id, name, domain, notes |
| `conversations` | Threads (email/LinkedIn/manual) | workspace_id, contact_id, subject, source_type, source_metadata (jsonb), last_message_at |
| `messages` | Individual messages | workspace_id, conversation_id, direction (in/out), sender_name, sender_email, body, sent_at (nullable), provenance ('paste'/'file'/'api') |
| `message_sources` | Import provenance | workspace_id, message_id, origin, file_name, imported_at |
| `drafts` | Generated/edited replies | workspace_id, conversation_id, contact_id, content, tone, status (draft/approved/discarded), revision_of, model_metadata (jsonb) |
| `classifications` | AI analysis of a message | workspace_id, message_id, intent, urgency, summary, expected_response, confidence |
| `commitments` | Promises (two-way) | workspace_id, contact_id, conversation_id, description, owner ('me'/'them'), due_date, status (proposed/active/completed/dismissed), confidence, is_confirmed |
| `tasks` | Follow-ups & actions | workspace_id, title, status, priority, due_date, contact_id, conversation_id, commitment_id, origin (manual/proposed) |
| `relationship_notes` | Notes about people | workspace_id, contact_id, body |
| `memories` | Extracted contextual facts | workspace_id, contact_id, content, kind (fact/preference/context), is_confirmed, confidence, source_message_id |
| `embeddings` | Vectors for retrieval | workspace_id, owner_type/owner_id, content_ref, embedding vector(1536), model |
| `audit_logs` | Important actions | workspace_id, actor, action, target_type, target_id, metadata (jsonb), created_at |

Deferred to later phases (designed for, not created yet): `meetings`, `meeting_notes`, `meeting_agendas`, `action_items`, `calendar_events`, `calendar_connections`, `projects`, `subtasks`, `reminders`, `notifications`, `notification_preferences`, `connected_accounts`, `sync_cursors`, `automation_rules`, `action_approvals`, `execution_logs`, networking-domain tables (`networking_profiles`, `consent_records`, `introductions`, …).

## 3. Relationships

- `workspaces 1—N users, contacts, conversations, tasks, …` (tenant root)
- `contacts 1—N conversations, relationship_notes, commitments, memories`
- `conversations 1—N messages 1—1 message_sources`
- `messages 1—N classifications, drafts(source), memories(source), commitments(source)`
- `commitments 1—N tasks` (a confirmed commitment can generate a task)

## 4. Memory integrity rules (enforced in code + schema)

1. The LLM never writes to `memories`/`commitments` directly; it produces a **proposal** with confidence + source. Status starts `proposed` until the user confirms (or an explicit automation rule allows low-risk auto-confirm).
2. Ambiguous dates ("next week", "tomorrow") are stored without a hard `due_date` until confirmed; the proposal surfaces the ambiguity.
3. Answers to "what did I discuss with X?" must cite stored messages/notes; the UI links to the source.
4. Editing or deleting a memory keeps a `audit_logs` entry.

## 5. Indexes & retrieval

- B-tree: `contacts(workspace_id, email)`, `messages(conversation_id, sent_at)`, `tasks(workspace_id, status, due_date)`, `commitments(workspace_id, status)`.
- pgvector: HNSW index on `embeddings(embedding)`; rows always filtered by `workspace_id` before similarity search.
- Embeddings model recorded per row so models can be swapped/re-backed later.

## 6. Migrations policy

Supabase CLI migrations in `supabase/migrations/`, numbered, forward-only. Destructive changes require explicit approval. `supabase/seed.sql` contains only synthetic demo data, never real personal data.
