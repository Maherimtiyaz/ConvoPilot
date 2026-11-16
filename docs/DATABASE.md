# ConvoPilot — Database Design

Version: 0.3 · Status: Specification for review (no migrations exist; hardening pass applied) · Engine: Supabase PostgreSQL (+ pgvector later) · Last revised: 2026-11-16

This document specifies the intended schema. No SQL migrations exist yet. Column lists are specifications, not final DDL; exact types are fixed in the first migration and reviewed then.

## 1. Principles

1. Every workspace-owned table has `workspace_id uuid not null` and Row Level Security that allows access only to members of that workspace (§4).
2. Raw imported content (conversations, messages) and AI-derived records (analyses, drafts, proposals, memories) are separate rows with explicit `status`, `origin` and provenance.
3. AI-derived facts never become confirmed without a user action (§5).
4. Evidence is stored as citations to sources in the same workspace (§6).
5. Every table has `created_at timestamptz not null default now()`; mutable tables have `updated_at` maintained by a trigger.
6. User content supports soft deletion followed by permanent deletion (§8).
7. The LLM never issues SQL. All access goes through repositories (`ARCHITECTURE.md` §2).

## 2. Tables (v0.1)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `workspaces` | Tenant boundary | id, name, created_by, created_at, updated_at, deleted_at |
| `profiles` | App profile for an `auth.users` row (not tenant-owned) | user_id (pk, fk auth.users), display_name, created_at, updated_at |
| `workspace_members` | Membership + role | workspace_id, user_id, role (`owner`/`member`), created_at; unique (workspace_id, user_id) |
| `workspace_settings` | Per-workspace preferences | workspace_id (pk), writing_style_profile jsonb (confirmed preferences only), ai_hosted_processing_opt_in boolean (see ARCHITECTURE §11 P5) |
| `companies` | Organisations | workspace_id, name, domain |
| `contacts` | People | workspace_id, full_name, company_id (nullable fk), role_title, relationship_context, last_interaction_at, deleted_at |
| `contact_identifiers` | Emails/handles for a contact | workspace_id, contact_id, kind (`email`/…), value_normalized; unique (workspace_id, kind, value_normalized) |
| `conversations` | Threads | workspace_id, subject, source_type (`paste`/`file`/`gmail` later), import_hash, last_message_at, deleted_at |
| `conversation_participants` | Contacts in a thread | workspace_id, conversation_id, contact_id, role (`from`/`to`/`cc`) |
| `messages` | Individual messages | workspace_id, conversation_id, direction (`inbound`/`outbound`/`unknown`), sender_name, sender_email, body_text, sent_at (nullable), position, content_hash, source_file_name (nullable), deleted_at |
| `thread_analyses` | AI analysis of a conversation | workspace_id, conversation_id, analysis jsonb (Zod-validated), model metadata (§7) |
| `drafts` | Generated/edited replies | workspace_id, conversation_id, content, tone, status (`draft`/`approved`/`discarded`), revision_of, model metadata, deleted_at |
| `commitments` | Promises in either direction | workspace_id, contact_id, conversation_id, description, owner (`me`/`them`), due_date (nullable), due_text_raw, status, origin, confidence, decided_by, decided_at, model metadata |
| `tasks` | Follow-ups & actions | workspace_id, title, status (`proposed`/`open`/`done`/`dismissed`/`rejected`), priority, due_date, contact_id, conversation_id, commitment_id, origin (`user_stated`/`extracted`/`inferred`), decided_by, decided_at, model metadata, deleted_at (see §5.4) |
| `relationship_notes` | User-written notes | workspace_id, contact_id, body, deleted_at |
| `memories` | Contextual facts about people/relationships | workspace_id, contact_id, kind (`fact`/`preference`/`context`), content, status, origin, confidence, decided_by, decided_at, supersedes_id, model metadata, deleted_at |
| `citations` | Evidence links (§6) | see §6 |
| `embeddings` | Vectors (added with pgvector, §9) | see §9 |
| `audit_events` | Append-only security/approval log (§10) | id, workspace_id (nullable only for account-scope events), scope (`workspace`/`account`), actor_user_id (nullable for system), actor_kind (`user`/`system`), action, target_type, target_id, metadata jsonb (no content), created_at |

Changes from v0.1 draft (justified):

- `users.workspace_id` replaced by `profiles` + `workspace_members`: a single column cannot express membership, roles or a user in more than one workspace, and the PRD requires invited users.
- `contacts.company` text replaced by `company_id` fk to the existing `companies` table (the draft had both without a relationship).
- `message_sources` table removed; its fields (`source_type` on conversation, `source_file_name` on message) duplicated `messages.provenance`. One place for provenance.
- `classifications` (per message) replaced by `thread_analyses` (per conversation), matching the Studio workflow that analyses whole threads.
- `contact_identifiers` added so a contact can have several addresses and email matching is unique per workspace.
- `audit_logs` renamed `audit_events` and made append-only with trusted writers only (§10).
- Task `origin` values `manual`/`proposed` replaced by the shared `user_stated`/`extracted`/`inferred` model; `proposed` is a task status (§5.4).
- `writing_style_profile` moved to `workspace_settings` so style data is workspace-scoped like all other user content.

Deferred (designed for, not created in v0.1): meetings, calendar_events, calendar_connections, connected_accounts, sync_cursors, reminders, notifications, projects, action_approvals, execution_logs, networking tables.

## 3. Workspaces, membership and roles

### 3.1 Model

- A **workspace** is the tenant boundary. Every user-owned record belongs to exactly one workspace.
- A user may access a workspace only through a `workspace_members` row.
- Roles defined in the schema: `owner` and `member`. Under the recommended Option A (§3.3) every workspace has exactly one member, its `owner`; `member` exists so Option C remains possible without a schema change.
- On sign-up, one workspace and one `owner` membership are created atomically by a database function triggered by the new `auth.users` row (`security definer`, fixed `search_path`). Users never insert their own membership.

### 3.1a Membership change rules (Required)

- `authenticated` users have **no INSERT, UPDATE or DELETE** privilege or policy on `workspace_members` in v0.1. Membership rows are created only by the sign-up function (and, if shared workspaces are approved later, by dedicated `security definer` functions).
- No user can change their own role. A workspace can never be left without an owner. `workspace_id` and `user_id` on a membership row are immutable.
- Membership changes are audited by trigger (§10).
- If shared workspaces are approved (P1 Option C), the following rules must be specified and tested before release: only owners invite or remove members; invitations are single-use, expiring, bound to an email address and accepted by the invitee while signed in; owners cannot be removed by members; the last owner cannot leave.

### 3.2 Request scoping

- The active workspace id comes from the server-side session context, never trusted from client input alone; the server verifies membership on every request.
- Repositories always filter by `workspace_id`; RLS enforces the same rule independently.

### 3.3 Friend invitations — **Pending user approval**

| Option | Description | Advantages | Disadvantages | Security implications |
| --- | --- | --- | --- | --- |
| A. Separate private workspaces | Each invited friend gets their own workspace; invitations only grant an account | Strongest privacy; no sharing rules; simplest RLS | No collaboration | No cross-user data paths at all |
| B. Shared workspace by explicit invitation | Owner invites a friend into the owner's workspace as `member` | Collaboration | Friend sees all of owner's private communication; needs role/visibility design | High: entire mailbox shared; per-record visibility would be needed for safety |
| C. Both (private by default, optional shared workspaces) | Every user has a private workspace; shared workspaces are separate, explicit | Flexible; private data never shared implicitly | More UI and testing (workspace switcher) | Safe if sharing is always a separate workspace |

**Recommendation (pending approval):** Option A for v0.1. The schema (`workspace_members` with roles) keeps Option C possible later without migration of ownership. Option B is not recommended because it exposes all private communication to every member.

**Invitations under Option A (recommendation, pending P6):** an invitation only lets a person create an **account**. It grants the inviter no access to the invitee's workspace and the invitee no access to the inviter's. Recommended mechanism: public sign-up disabled; the owner issues invites through an allow-listed server-side admin action (Supabase Auth admin invite, service-role) that is audited as an account-scope event. On first sign-in, the sign-up function creates the invitee's private workspace. Exact Supabase settings must be verified against Supabase documentation at implementation time.

## 4. Row Level Security

- RLS is enabled on every table in §2 except `profiles` (which has its own self-only policy).
- Helper: `is_workspace_member(ws uuid) returns boolean`, `security definer`, `stable`, fixed `search_path`, checks `workspace_members` for `auth.uid()`. It is security definer only to avoid recursive RLS on `workspace_members`; it returns a boolean and exposes no rows.
- Content tables: `select using (is_workspace_member(workspace_id) and deleted_at is null)`; `insert/update with check (is_workspace_member(workspace_id))`. Soft deletion and restore do not go through plain UPDATE (§8.1).
- `workspace_id` is immutable after insert (trigger rejects changes), so rows cannot be moved between workspaces even by a user who is a member of both.
- `audit_events`: **no insert, update or delete** privilege or policy for `authenticated`; select only (§10).
- `workspace_members`: select own workspace's rows; no write policies (§3.1a).
- RLS is tested from the first migration with two users in two workspaces (`EVALUATION.md` §3).
- Request paths use the user-session client, so these policies are always evaluated. The service-role client (bypasses RLS) is restricted per `SECURITY.md` §4.

**Threat assumption (Required):** the browser holds the Supabase URL, publishable/anon key and the user's JWT, so a user can call the database API directly, bypassing Next.js and the policy layer. Every invariant that matters for security or auditability (membership, workspace immutability, AI-proposal status rules, `decided_by`, audit writes, soft-delete exclusion) must therefore be enforced **in the database** (RLS, constraints, triggers), not only in application code.

**Accepted limitation:** within their own workspace, a user can insert rows labelled `origin=extracted` directly through the API. The database cannot prove a row came from the server's AI pipeline. This only lets users mislabel their own data, which is acceptable for single-member workspaces; it must be revisited before shared workspaces (P1 Option C).

## 5. Memory and proposal model

### 5.1 `status`

| Value | Meaning |
| --- | --- |
| `proposed` | Created by AI (or import) and not yet reviewed. Shown as unverified suggestion, never as fact. |
| `confirmed` | A user explicitly approved it, or it was directly authored by the user (`origin=user_stated`). |
| `rejected` | User declined it. Kept (for audit and to avoid re-proposing) until deleted. |
| `superseded` | Replaced by a newer record (`supersedes_id` on the newer row). Not used in answers. |

### 5.2 `origin`

| Value | Meaning | Initial status |
| --- | --- | --- |
| `user_stated` | Typed or edited directly by the user (e.g. a note, a manual memory, a manually created commitment) | `confirmed` |
| `extracted` | AI extracted it from a cited source where the source states it explicitly | `proposed` |
| `inferred` | AI concluded it from context but the source does not state it directly | `proposed` |

### 5.3 Rules

1. `extracted` and `inferred` records are created only with `status=proposed` (enforced by an insert trigger). Moving to `confirmed` requires a user action through a Server Action. There is **no automatic confirmation** in v0.1 (this removes the earlier draft's "low-risk auto-confirm" rule).
2. On any status change, a trigger sets `decided_by = auth.uid()` and `decided_at = now()`; client-supplied values are ignored, so a user cannot attribute a decision to someone else. A check constraint enforces: `origin <> 'user_stated' and status <> 'proposed'` implies `decided_by is not null`. The same trigger writes the audit event (§10). Background/system code (service-role) never changes proposal status.
3. Editing an AI proposal before approving it keeps `origin` as originally created; the edit is audited.
4. Ambiguous dates ("next week") are stored in `due_text_raw` with `due_date` null until the user confirms a date.
5. `extracted`/`inferred` records require at least one valid citation (§6); `user_stated` records may have none.
6. Answers use `confirmed` records as facts; `proposed` records may be shown only labelled as unverified.
7. Commitments use the same `status`/`origin` semantics as memories. Tasks use the same `origin` values but their own lifecycle (§5.4).

### 5.4 Tasks (Required)

- `origin`: `user_stated` (created by the user, status starts `open`) or `extracted`/`inferred` (AI-proposed, status starts `proposed`). The earlier `manual`/`proposed` origin values are replaced; "proposed" is a status, not an origin.
- `status`: `proposed` → `open` (user approved) or `rejected`; `open` → `done` or `dismissed`.
- **Evidence path:** AI-proposed tasks carry no citations of their own. `commitment_id` is required when `origin <> 'user_stated'` (check constraint), and the task's evidence is the commitment's citations.
- **Approval:** an AI-proposed task moves from `proposed` to `open` only by explicit user action. That action requires the linked commitment to be `confirmed`; if it is still `proposed`, the UI asks the user to confirm both, and both changes happen in one transaction with two audit events. `decided_by`/`decided_at` and audit are set by the same trigger as §5.3 rule 2.
- If the linked commitment is later rejected or loses all valid citations, open AI-origin tasks are flagged for review, not deleted.

## 6. Evidence and citations

### 6.1 Requirements

A memory, commitment or factual answer may be supported by several sources. Each citation stores:

- `workspace_id` — must equal the subject's workspace.
- Subject: what the citation supports (memory, commitment, thread analysis, draft).
- Source: the cited record (message or relationship note).
- `source_type` — `message` or `note`.
- `quote` (nullable) and `span_start`/`span_end` (nullable) — exact text supporting the claim, where practical.
- `created_at`, model metadata of the producing call.

Factual answers in Q&A are not stored as rows in v0.1; their citations are validated in memory with the same rules before display (ARCHITECTURE §6).

### 6.2 Integrity approach and trade-offs

A single polymorphic table (`subject_type, subject_id, source_type, source_id`) **cannot** have real foreign keys: Postgres cannot reference "one of several tables" from one column, so dangling ids and cross-workspace ids would be possible.

| Approach | Integrity | Cost |
| --- | --- | --- |
| Polymorphic ids + application validation | None at DB level | Simple; relies entirely on code |
| Polymorphic ids + triggers checking existence and workspace | Good, but triggers must cover deletes on every source table | Trigger complexity |
| **Exclusive-arc columns with real FKs** (chosen) | Full FK integrity + same-workspace guarantee via composite FKs | More nullable columns; a CHECK enforces exactly one non-null per arc |
| Separate citation table per subject | Full integrity | Many small tables |

**Specified design (exclusive arcs):**

- Subject columns: `memory_id`, `commitment_id`, `thread_analysis_id`, `draft_id` (nullable); `CHECK (num_nonnulls(memory_id, commitment_id, thread_analysis_id, draft_id) = 1)`. Tasks are not citation subjects; their evidence comes from their commitment (§5.4).
- Composite FKs use the default `MATCH SIMPLE`, so a null arc column is simply not checked. Use `ON DELETE CASCADE`, never `SET NULL` (which would also null `workspace_id`).
- Source columns: `message_id`, `note_id` (nullable); `CHECK (num_nonnulls(message_id, note_id) = 1)`.
- Every FK is composite `(workspace_id, x_id) references x(workspace_id, id)`, so a citation cannot point to a source or subject in another workspace. This requires `unique (workspace_id, id)` on referenced tables (§7).
- Application validation still runs before insert (source in current workspace, source was in the model's context, quote occurs in source text) because FKs cannot verify relevance or quotes.
- On permanent deletion of a source, citations cascade-delete; subjects whose last citation disappears are flagged for review (§8).

## 7. Constraints and indexes

- **Workspace-scoped FKs:** every table referenced by another workspace table has `unique (workspace_id, id)`; child tables reference `(workspace_id, parent_id)`. This prevents linking a record to a parent in another workspace even if application code has a bug.
- **Message deduplication:** `messages.content_hash` = SHA-256 of normalized (sender email lowercase, `sent_at` when known, trimmed body text). `unique (workspace_id, conversation_id, content_hash)`. `conversations.import_hash` hashes the normalized full import to detect re-imports; a re-import is reported to the user, not silently merged.
- **Model metadata columns** on derived tables: `ai_provider`, `ai_model`, `prompt_version`, `input_tokens`, `output_tokens`.
- **Indexes:** `contact_identifiers(workspace_id, kind, value_normalized)`, `messages(workspace_id, conversation_id, position)`, `tasks(workspace_id, status, due_date)`, `commitments(workspace_id, status)`, `memories(workspace_id, contact_id, status)`, full-text GIN index on `messages.body_text` (tsvector).
- `updated_at` triggers on mutable tables.

## 8. Deletion and retention

1. **Soft delete — one approach (Required):** soft-deleted rows are hidden by the **RLS SELECT policy** (`deleted_at is null`, §4). No separate views are used.
   - Soft delete and restore are performed only through `security definer` functions (`soft_delete_<entity>(id)`, `restore_<entity>(id)`) that check membership via `auth.uid()`, set or clear `deleted_at`, and write the audit event. Plain UPDATE of `deleted_at` by `authenticated` is revoked. (Reason: an UPDATE that makes a row invisible under its own SELECT policy behaves inconsistently with RLS; the exact PostgreSQL behaviour must be verified in the first migration's tests.)
   - Because retrieval and search functions run as `security invoker`, RLS removes soft-deleted rows before ranking; soft-deleted content therefore cannot enter retrieval or AI context. Repositories do not add their own `deleted_at` filter as the primary mechanism (they may for clarity; RLS is authoritative).
   - Soft-deleting a conversation soft-deletes its messages in the same function. Citations whose source is soft-deleted are treated as invalid by citation validation; a non-`user_stated` memory or commitment with no remaining valid citation is not presented as fact while its sources are deleted.
   - Restore is possible until permanent deletion.
2. **Permanent deletion:** a maintenance job (service-role, allow-listed) hard-deletes rows soft-deleted longer than a retention window (proposed 30 days; **pending approval**). Users can request immediate permanent deletion, which the same job performs.
3. **Cascade of derived data:** permanently deleting a message deletes its embeddings and citations; deleting a conversation deletes its messages, analyses and drafts; memories/commitments that lose all citations are set to `proposed` with a flag for review (not silently kept as confirmed facts derived from deleted evidence) unless `user_stated`.
4. **Workspace deletion:** deletes all workspace content rows. Workspace-scope audit events are retained as minimal records (action, ids, timestamps; no content) for the audit retention period (§10, pending approval) and then deleted by the retention job. To allow this, `audit_events.workspace_id` has **no foreign key** to `workspaces` (otherwise deletion would cascade or be blocked); it is validated on insert by the writing function instead.
5. **Export:** per-workspace JSON export of user content before production deployment (SECURITY.md).
6. Data sent to external AI providers is outside this database's deletion; see SECURITY.md §11.

## 9. Embeddings (deferred until pgvector is enabled)

The schema is intentionally **not finalized**: providers use different dimensions (e.g. 768, 1024, 1536, 3072) and pgvector indexes require a fixed dimension per column.

Required regardless of final layout:

- Metadata per row: `workspace_id`, owner reference (message or note, via exclusive-arc FKs as in §6), `provider`, `model`, `dimensions`, `content_hash` of embedded text, `created_at`.
- Similarity search always filters `workspace_id` inside the SQL function, which runs as `security invoker` so RLS applies.
- Changing embedding model → re-embed; vectors from different models are never compared.
- Embeddings are deleted with their source (§8).

Candidate layouts (decide when pgvector is introduced): one table per active dimension (e.g. `embeddings_768`), or an untyped `vector` column with per-model partial expression indexes. Recommendation: one table per dimension in use — simplest to index — **pending approval**.

## 10. Audit events

### 10.1 Integrity (Required)

The v0.2 draft let workspace members insert audit rows. That allowed a user to forge events, including approvals attributed to another user. Corrected design:

- `authenticated` has **no INSERT, UPDATE or DELETE** privilege on `audit_events`. Users cannot write audit rows directly.
- **Trusted write path 1 — database triggers** (for every event caused by a data change): proposal status changes, soft delete/restore, membership changes, draft approval. The trigger runs in the same transaction as the change and takes `actor_user_id` from `auth.uid()`, never from client input. The event exists if and only if the change committed.
- **Trusted write path 2 — server-only audit writer** (for events with no data change: AI policy denials, export requests, invitations, permanent-deletion job runs). Implemented as a `security definer` function executable only by the service role, called from the allow-listed server module `src/lib/audit` (`SECURITY.md` §4). `actor_user_id` comes from the server-verified `RequestContext`; `actor_kind='system'` for jobs.
- Append-only: no role used by the application can update rows; deletion only by the retention job.
- Optional hardening (recommended, not required for v0.1): hash chain (`prev_hash`) to detect tampering by database administrators.

### 10.2 Scope and schema

- `scope='workspace'`: `workspace_id not null`. Visible (SELECT) to that workspace's **owner** only.
- `scope='account'`: `workspace_id null` (e.g. invitation issued, account deleted). Not visible through RLS to any user; read only by operators via service role. Check constraint: `(scope='workspace') = (workspace_id is not null)`.
- **Sign-in failures** are not duplicated into `audit_events` in v0.1; Supabase Auth's own logs are the record. Revisit if a requirement appears.
- `metadata` holds ids, counts and codes only — never message bodies, draft text, memory content, email addresses of third parties, or secrets.

### 10.3 Retention (pending approval)

- Workspace-scope events: retained for the audit retention period after creation, and after workspace deletion as minimal records (§8.4); proposed 1 year.
- Account-scope events: proposed 1 year.
- Deletion only by the retention job. Periods are **pending owner approval** and do not block M1.2.

## 11. Migrations policy

Supabase CLI migrations in `supabase/migrations/`, numbered, forward-only. Destructive changes require explicit approval. `supabase/seed.sql` contains synthetic data only. Whether development uses local or hosted Supabase is pending (ARCHITECTURE §11 P2).
