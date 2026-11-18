# ConvoPilot — Database Design

Version: 0.6 · Status: Specification for review (M1.3 migrations implemented locally; security remediation applied 2026-11-16) · Engine: Supabase PostgreSQL (+ pgvector later) · Last revised: 2026-11-16

This document specifies the intended schema. No SQL migrations exist yet. Column lists are specifications, not final DDL; exact types are fixed in the first migration and reviewed then. Statements marked **[Validate locally]** describe Supabase/PostgreSQL behaviour that must be proven by tests on the local Supabase stack before M1.3 is accepted.

Approved owner decisions reflected here (2026-11-16): private workspaces only (no shared workspaces in the MVP); invite-only sign-up; only a platform operator may invite; email magic link / OTP login; hosted Supabase project for manual development, local Supabase (Docker) for automated tests, separate production environment.

## 1. Principles

1. Every workspace-owned table has `workspace_id uuid not null` and Row Level Security that allows access only to members of a non-deleted workspace (§4).
2. Raw imported content (conversations, messages) and AI-derived records (analyses, drafts, proposals, memories) are separate rows with explicit `status`, `origin`, `evidence_state` and provenance.
3. AI-derived facts never become confirmed without an explicit user decision through `public.decide_proposal` (§5).
4. Evidence is stored as citations to sources in the same workspace (§6).
5. Every table has `created_at timestamptz not null default now()`; mutable tables have `updated_at` maintained by a trigger.
6. User content supports soft deletion followed by permanent deletion (§8).
7. The LLM never issues SQL. All access goes through repositories (`ARCHITECTURE.md` §2).
8. Users can call the database API directly with their own JWT. Every security and audit invariant is enforced in the database, not only in Next.js (§4.4).

## 2. Tables

### 2.1 M1.3 foundation tables

| Table | Schema | Purpose | Key columns |
| --- | --- | --- | --- |
| `profiles` | public | App profile for an `auth.users` row (not tenant-owned) | user_id (pk, fk `auth.users` on delete cascade), display_name, deletion_requested_at, created_at, updated_at |
| `workspaces` | public | Tenant boundary | id, name, created_by, created_at, updated_at, deleted_at |
| `workspace_members` | public | Membership + workspace role | workspace_id, user_id, role (`owner`/`member`), created_at; pk (workspace_id, user_id) |
| `workspace_settings` | public | Per-workspace preferences | workspace_id (pk), writing_style_profile jsonb (confirmed preferences only), ai_hosted_processing_opt_in boolean default false |
| `audit_events` | public | Append-only security/approval log (§10) | id, workspace_id (nullable only for account scope), scope, actor_user_id, actor_kind, action, target_type, target_id, metadata jsonb (no content), created_at |
| `platform_operators` | app_private | Platform-level operator grant (§3.4) | user_id (pk, fk `auth.users` on delete cascade), granted_at, granted_by_note |
| `invitations` | app_private | Operator-issued, single-use invitations (§3.5) | id, email_normalized, token_hash, created_by, created_at, expires_at, verified_at, consumed_at, consumed_by, revoked_at |

### 2.2 Content tables (created in M3–M5, specified now)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `companies` | Organisations | workspace_id, name, domain, deleted_at |
| `contacts` | People | workspace_id, full_name, company_id (nullable fk), role_title, relationship_context, last_interaction_at, deleted_at |
| `contact_identifiers` | Emails/handles for a contact | workspace_id, contact_id, kind (`email`/…), value_normalized; unique (workspace_id, kind, value_normalized) |
| `conversations` | Threads | workspace_id, subject, source_type (`paste`/`file`/`gmail` later), import_hash, last_message_at, deleted_at |
| `conversation_participants` | Contacts in a thread | workspace_id, conversation_id, contact_id, role (`from`/`to`/`cc`) |
| `messages` | Individual messages | workspace_id, conversation_id, direction, sender_name, sender_email, body_text, sent_at (nullable), position, content_hash, source_file_name (nullable), deleted_at |
| `thread_analyses` | AI analysis of a conversation | workspace_id, conversation_id, analysis jsonb (Zod-validated), model metadata, deleted_at |
| `drafts` | Generated/edited replies | workspace_id, conversation_id, content, tone, status (`draft`/`approved`/`discarded`), revision_of, model metadata, deleted_at |
| `commitments` | Promises in either direction | workspace_id, contact_id, conversation_id, description, owner (`me`/`them`), due_date, due_text_raw, status, origin, evidence_state, confidence, decided_by, decided_at, supersedes_id, model metadata, deleted_at |
| `tasks` | Follow-ups & actions | workspace_id, title, status, priority, due_date, contact_id, conversation_id, commitment_id, origin, decided_by, decided_at, model metadata, deleted_at |
| `relationship_notes` | User-written notes | workspace_id, contact_id, body, deleted_at |
| `memories` | Contextual facts | workspace_id, contact_id, kind (`fact`/`preference`/`context`), content, status, origin, evidence_state, confidence, decided_by, decided_at, supersedes_id, model metadata, deleted_at |
| `citations` | Evidence links (§6) | see §6 |
| `embeddings` | Vectors (added with pgvector, §9) | see §9 |

### 2.3 Implemented in M4 (migration `20261118001200_contacts.sql`)

- Tables `companies` (unique lower(name) per workspace), `contacts`, `contact_identifiers` (kind `email`,
  unique per workspace), `conversation_participants` (pk workspace, conversation, contact, role). RLS:
  members only; children are visible only while their parent contact/conversation is visible.
  Column-level UPDATE grants only (`companies.name/domain`; `contacts.full_name, company_id,
  role_title, relationship_context, last_interaction_at`); `workspace_id` never updatable.
- `public.save_contact(...)` (invoker, RLS applies): typed `created` / `existing` / `invalid`; links
  every existing message from that email and sets `last_interaction_at`. Trigger
  `app_private.link_message_to_contact` links later imports automatically.
- `public.soft_delete_contact(id)` (definer, member check, audited, removes identifiers so the email
  can be saved again; conversations are kept).
- `public.search_messages(workspace, query, contact?, limit ≤ 25)` (invoker): `websearch_to_tsquery
  ('simple')` over non-deleted messages of non-deleted conversations; returns at most 4,000
  characters of each body. Full-text only; embeddings remain deferred (§9).

### 2.4 Implemented in M5 (migration `20261118001300_commitments_tasks.sql`)

- Tables `commitments` and `tasks` as specified in §2.2/§5; `citations` gains the `commitment_id`
  arc (check renamed `citations_one_subject`). The API can only SELECT these two tables (no INSERT,
  UPDATE or DELETE grants), so status, origin, evidence and decision columns are unreachable directly.
- `public.store_commitment_proposals(workspace, conversation, items, meta)` (definer, member check):
  the only write path for AI proposals. Every stored item is `proposed` with `origin`
  `extracted`/`inferred` and at least one citation to a non-deleted message **of that conversation
  whose normalised text contains the quote** (defence in depth behind the app's validation); items
  without one are counted as `unsupported` and dropped; an item whose normalised description already
  exists in the conversation (any status) is not proposed again. Optional linked task (`proposed`).
- `public.decide_proposal(kind, id, decision)`, `public.approve_task(task_id, confirm_commitment)`,
  `public.create_task(...)`, `public.set_task_status(task_id, status)`: definer, membership checked,
  one audit event per change, no content in audit metadata.
- Trigger `app_private.refresh_commitment_evidence` (after a message's `deleted_at` changes) sets
  `evidence_state` to `sources_hidden`/`supported`; it never touches `status`. A task whose commitment
  is rejected or unsupported is shown as "needs review" (computed at read time).

Deviations from §5, decided as engineering defaults (owner may override):

- Decision functions return typed statuses (`ok`, `not_found`, `invalid_transition`, `unsupported`,
  `commitment_not_confirmed`) instead of raising, like the M1.5 operator functions. All checks run
  before any write, so a refusal changes nothing (the "no partial changes" requirement holds).
- Confirming a commitment also requires `evidence_state = 'supported'`.
- Rejecting a commitment rejects its still-`proposed` tasks in the same transaction (audited).
- Added `done`/`dismissed` → `open` ("Reopen") for the user's own undo; §5.6 listed only
  `open → done/dismissed`.
- Not yet built (tracked in WORKLOG): editing a proposal's text before deciding, `revise_record` for
  confirmed records, user-authored (`user_stated`) commitments, deleting tasks/commitments.

Changes from earlier drafts (justified):

- `users.workspace_id` replaced by `profiles` + `workspace_members` (membership, roles, invited users).
- `contacts.company` text replaced by `company_id` fk.
- `message_sources` removed (duplicated provenance).
- `classifications` replaced by per-conversation `thread_analyses`.
- `contact_identifiers` added.
- `audit_logs` renamed `audit_events`; trusted writers only (§10).
- Task `origin` values `manual`/`proposed` replaced by `user_stated`/`extracted`/`inferred`; `proposed` is a status (§5.6).
- `writing_style_profile` moved to `workspace_settings`.
- v0.4: `deleted_at` added to `commitments`, `thread_analyses`, `companies`; `evidence_state` added to `memories`/`commitments` (§5.5); `platform_operators` and `invitations` added (§3.4–§3.5); `profiles.deletion_requested_at` added (§8.6).

Deferred (designed for, not created in v0.1): meetings, calendar tables, connected_accounts, sync_cursors, reminders, notifications, projects, action_approvals, execution_logs, networking tables, shared-workspace invitations.

## 3. Workspaces, membership, operators and invitations

### 3.1 Workspace model (approved: private workspaces only)

- A **workspace** is the tenant boundary. Every user-owned record belongs to exactly one workspace.
- Each user has exactly one private workspace, of which they are the only member and the `owner`. Shared workspaces are not part of the MVP.
- The `member` role exists in the schema only so shared workspaces can be added later without a data migration. No v0.1 code path creates a `member` row.
- A user may access a workspace only through a `workspace_members` row, and only while the workspace is not soft-deleted.

### 3.2 Membership rules (Required)

- `authenticated` and `anon` have **no INSERT, UPDATE or DELETE** privilege on `workspace_members`.
- Membership rows are created only by the sign-up function (§3.6).
- `workspace_id`, `user_id` and `role` are immutable after insert (trigger).
- A workspace can never be left without an owner; membership rows are removed only by permanent deletion (§8.6).
- Membership changes are audited by trigger (§10).

### 3.3 Request scoping

- The active workspace id is derived server-side from the user's membership, never trusted from client input alone.
- Repositories always filter by `workspace_id`; RLS enforces the same rule independently.

### 3.4 Platform operator (approved: operator-only invitations)

Platform operator is a **platform-level** permission, completely separate from workspace roles. Being a workspace `owner` grants nothing at platform level.

- Stored in `app_private.platform_operators(user_id)`. The `app_private` schema is not exposed through the API (§4.1) and has no grants to `anon` or `authenticated`.
- Granted only by a database administrator running a reviewed SQL statement against the target environment (hosted dev or production) — never through the application, never through a migration that hard-codes a user id, never via JWT claims or `user_metadata` (which users can edit).
- Checked only inside security-definer functions with `app_private.is_platform_operator()` (reads `auth.uid()`).
- Granting and revoking operators is recorded as an account-scope audit event by trigger.

### 3.5 Invitations (Required; remediated after the M1.3 security review)

`app_private.invitations` holds operator-issued invitations (RLS enabled, no policies, no grants). Rules:

| Property | Mechanism |
| --- | --- |
| Only operators create or revoke | `public.create_invitation(email, ttl)` / `public.revoke_invitation(id)` are `security definer`, EXECUTE granted to `authenticated` only, and check `app_private.is_platform_operator()` (which is false once the operator has requested account deletion) |
| Typed results, committed denials | Both functions return `jsonb` with a `status` (`created`, `already_invited`, `not_authorized`, `invalid_email`, `invalid_ttl`, `not_authenticated`; `revoked`, `not_found`) instead of raising, so denial audit events (`invitation.create_denied`, `invitation.revoke_denied`) are committed. The application maps statuses to responses (M1.4). `create_invitation` returns `invitation_id` and the plaintext `token` once. |
| Bound to an email | `email_normalized` = lower-cased, trimmed email; account creation requires the token **and** the matching email |
| Token stored only as a hash | 32 random bytes from `extensions.gen_random_bytes`; base64url token returned once; only `token_hash = sha256(token)` stored |
| Expiring | `expires_at` required (default TTL 7 days, maximum 30 days; default **pending owner confirmation**) |
| Re-invitation after expiry | Under a per-email advisory lock, `create_invitation` retires expired open invitations (`revoked_reason = 'expired_replaced'`, audited) before inserting the replacement. An unexpired open invitation yields `already_invited`. The partial unique index has no time predicate. |
| Single-use / no replay | Consumed atomically inside the `auth.users` insert (§3.6); a consumed, revoked or expired token never creates an account |
| Revocable | `revoked_at` + `revoked_reason = 'operator'` |
| Verification | `public.verify_invitation(token, email)` (EXECUTE: `anon`, `authenticated`) is a UX pre-check only. It returns a boolean with the same shape for unknown email and wrong token, **never authorises sign-up**, writes nothing for unknown or invalid tokens, and records/audits only the first successful verification (actor = `auth.uid()` when signed in) |

Delivery: the operator copies the invitation link (containing the token) out-of-band. v0.1 has no email-sending capability for invitations beyond Supabase Auth's own messages.

### 3.6 Invite-only, token-bound, passwordless sign-up (Required; validated on the local stack)

Observed with Supabase CLI 2.122.1 / GoTrue v2.197.0 (M1.3 remediation): the `before_user_created` hook payload contains `user.user_metadata` but **no password information**; `/otp` and password `/signup` produce **identical** `auth.users` INSERTs (GoTrue gives OTP users a random password); GoTrue **rewrites `raw_user_meta_data` from memory** in follow-up UPDATEs. GoTrue configuration cannot disable password authentication: an unsatisfiable `minimum_password_length` also breaks OTP sign-up because GoTrue validates its own random password.

Flow and enforcement:

1. The client requests a magic link with the invitation token in sign-up metadata: `signInWithOtp({ email, options: { shouldCreateUser: true, data: { invitation_token } } })`.
2. **Hook** `app_private.before_user_created_hook` (EXECUTE: `supabase_auth_admin` only) returns HTTP 403 unless `sha256(user_metadata.invitation_token)` matches an open, unexpired invitation for the normalized email.
3. **`BEFORE INSERT` trigger** `app_private.bind_invitation_on_user_insert` (authoritative; runs for every insert however it is made) consumes the invitation by token hash + email with a row-locking `UPDATE … RETURNING` (a concurrent second attempt re-evaluates after the first commits and fails), strips `invitation_token` from `raw_user_meta_data`, and sets `encrypted_password` to NULL. Missing, wrong, mismatched, expired, revoked or consumed token → exception (`42501`, message without the token).
4. **`BEFORE UPDATE` trigger** `app_private.enforce_passwordless_on_user_update` strips `invitation_token` on every write (GoTrue rewrites metadata) and rejects any change to `encrypted_password` (password set/change via `PUT /user`, recovery or Admin API fails; GoTrue reports HTTP 500).
4a. **`BEFORE INSERT OR UPDATE` trigger on `auth.identities`** `app_private.strip_invitation_token_from_identity` (`security invoker`, empty `search_path`, no EXECUTE grants; it only modifies `NEW`) removes `invitation_token` from `identity_data` when it is a JSON object, preserving all other keys. Observed: GoTrue inserts the identity with the sign-up metadata (including the token) and rewrites `identity_data` from memory at email confirmation; returning logins and `PUT /user` do not write identities. Regression: pgTAP (insert, update, non-object JSON, legitimate keys preserved) and an integration test that scans every text/JSON column of every base table in `auth`, `public` and `app_private` after sign-up, confirmation, returning login and an attempted re-introduction of the token.
5. **`AFTER INSERT` trigger** `app_private.handle_new_user` provisions profile, workspace, settings and owner membership for the invitation consumed by this user and writes an account-scope audit event, in the same transaction. Any failure aborts the user creation: no partial records and no consumed invitation.
6. `verified_at` is informational only and is never sufficient for account creation.
7. **Login:** magic link (email link with `token_hash`). With `enable_confirmations = true`, a new user's first email is "Confirm your email address" (`type=signup` link); verify with `type: 'email'`. Returning users receive a magic link. 6-digit codes need a custom email template.
8. **Known limitation:** a token holder who calls password `/signup` with a valid token gets an account created (HTTP 200) but **without a password hash and without a session** (confirmation required); password login always fails. Outright rejection of the request is not possible with GoTrue v2.197 because password sign-up is indistinguishable at creation. Secure alternative if outright rejection is required: create accounts only from a Next.js Server Action that adds a server-side HMAC proof to the metadata, verified by the hook (adds a server secret; owner decision).

## 4. Database security model

### 4.1 Roles and schema exposure (Supabase role model)

| Role | Source | Use in ConvoPilot |
| --- | --- | --- |
| `anon` | Supabase (API, no JWT user) | May call only `public.verify_invitation`; no table access |
| `authenticated` | Supabase (API, valid user JWT) | All normal request paths; subject to RLS |
| `service_role` | Supabase (bypasses RLS) | Only the isolated privileged runner (§4.5); never Next.js request paths |
| `postgres` | Supabase (migration/owner role; not a true superuser on hosted Supabase) | Owns tables and security-definer functions |
| `supabase_auth_admin` | Supabase Auth | Executes the sign-up hook and `auth.users` triggers |
| `supabase_admin` | Platform-managed | Not used by us |

- **Custom function-owner role: not adopted.** A dedicated owner role would not own the tables, so it would be subject to RLS and need broad grants, and on hosted Supabase `postgres` cannot be assumed to have every capability needed to manage such a role cleanly. Security-definer functions are therefore owned by `postgres`, which is Supabase's documented pattern (validated in Stage 0).
- **API schema allow-list (Required):** the Data API exposes **only** `public`. `config.toml`: `[api] schemas = ["public"]` (the CLI default also includes `graphql_public`, which is removed) and `auto_expose_new_tables = false`, so new `public` objects are unreachable without explicit GRANTs. `app_private`, `graphql_public`, `extensions`, `auth` and `storage` are never exposed. **Validated (Stage 0):** PostgREST runs with `PGRST_DB_SCHEMAS=public`; requests with `Accept-Profile`/`Content-Profile: app_private` fail with `PGRST106`; `/graphql/v1` is not served (HTTP 406). `pg_graphql` is not installed in the local image (Postgres 17.11.0.006).
- **Hosted environments (manual, must be verified per project):** set the exposed schemas to `public` only in the project's API settings and disable or uninstall `pg_graphql` if it is enabled. Stage 0 did not touch any hosted project.
- **Private schema:** `app_private` holds internal tables and functions. `revoke all on schema app_private from public, anon, authenticated`. It is never added to the API's exposed schemas.

### 4.2 Function security rules (Required)

For every function created by migrations:

1. Declare `security definer` or `security invoker` explicitly.
2. `set search_path = ''`; reference every object schema-qualified (`public.workspaces`, `pg_catalog.now()`).
3. Owner: `postgres`.
4. Immediately after creation: `revoke execute on function … from public, anon, authenticated;` then grant only what §4.3 lists.
5. Fail-closed defaults (migration 0001). **Both** statements are required:
   - `alter default privileges for role postgres revoke execute on functions from public;` — **global**. PostgreSQL's built-in default grants EXECUTE on new functions to `PUBLIC`, and per-schema default privileges can only *add* to the global default, never remove it. **Stage 0 finding:** with only the per-schema revoke, a new `public` function was still executable by `anon` and `authenticated`; with the global revoke it was not.
   - `alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;` (and the same for `app_private`) — removes Supabase's schema-level grants to the API roles.
6. Security-definer functions must check `auth.uid() is not null` (except hook/trigger/system functions), verify membership or operator status themselves, and never take a workspace id or user id from the caller without verifying it.
7. Internal helpers and trigger functions live in `app_private`.

### 4.3 Schema and function grant matrix

Schema `app_private`: `revoke all … from public, anon, authenticated`, then `grant usage on schema app_private to authenticated` (required so RLS policies, which run as the caller, can call the helpers; USAGE grants no table access and does not expose the schema through the API) and `grant usage on schema app_private to supabase_auth_admin` (required for the hook). `anon` has no USAGE. **Validated (Stage 0, pgTAP).**


| Function | Schema | Definer/invoker | EXECUTE granted to | Milestone |
| --- | --- | --- | --- | --- |
| `is_workspace_member(ws)`, `is_workspace_owner(ws)` | app_private | definer, stable | `authenticated` (EXECUTE, plus schema USAGE above) — required for RLS evaluation; validated | M1.3 |
| `is_platform_operator()` | app_private | definer, stable | none (called only from definer functions) | M1.3 |
| `write_audit(...)` | app_private | definer | none (called only from triggers/definer functions) | M1.3 |
| `bind_invitation_on_user_insert()`, `enforce_passwordless_on_user_update()`, `handle_new_user()` (triggers on `auth.users`) | app_private | definer | **none** — trigger functions need no EXECUTE grant to fire (validated) | M1.3 |
| `before_user_created_hook(event)` | app_private | definer | `supabase_auth_admin` only (plus schema USAGE); validated | M1.3 |
| `is_safe_audit_identifier(text)`, `is_safe_audit_metadata(jsonb)` | app_private | invoker, immutable | none (used inside `log_event`) | M1.3 |
| `set_updated_at()`, immutability triggers | app_private | invoker | none | M1.3 |
| `create_invitation(email, ttl) → jsonb` | public | definer | `authenticated` (operator check inside; typed result) | M1.3 |
| `revoke_invitation(id) → jsonb` | public | definer | `authenticated` (operator check inside; typed result) | M1.3 |
| `verify_invitation(token, email)` | public | definer | `anon`, `authenticated` | M1.3 |
| `log_event(action, target_type, target_id, metadata)` | public | definer | `authenticated` (fixed action allow-list; actor forced to `auth.uid()`; target type allow-list, identifier-shaped values, allow-listed metadata keys — no free text) | M1.3 |
| `request_account_deletion()` | public | definer | `authenticated` | M1.3 |
| `decide_proposal(kind, id, decision)` | public | definer | `authenticated` | M4/M5 |
| `approve_task(task_id, confirm_commitment)` | public | definer | `authenticated` | M5 |
| `soft_delete_<entity>(id)`, `restore_<entity>(id)` | public | definer | `authenticated` | with each entity |
| `revise_record(kind, id, new_content)` | public | definer | `authenticated` | M4/M5 |

Any function not in this matrix must have no EXECUTE grant for `anon` or `authenticated`. A database test enumerates `pg_proc` and asserts this (§EVALUATION S23).

### 4.4 Row Level Security policy matrix (Required)

RLS is enabled on every table in `public`. `app_private` tables are unreachable through the API. Policies use `(select app_private.is_workspace_member(workspace_id))` so the check is evaluated once per statement. Behaviour validated in Stage 0; performance at realistic data volume is not yet measured.

| Table | SELECT | INSERT | UPDATE (USING / WITH CHECK) | DELETE |
| --- | --- | --- | --- | --- |
| `profiles` | own row (`user_id = auth.uid()`) | none (sign-up function) | own row / own row; columns limited to `display_name` | none |
| `workspaces` | member and `deleted_at is null` | none (sign-up function) | owner / owner; columns limited to `name` | none |
| `workspace_members` | rows of own non-deleted workspaces | none | none | none |
| `workspace_settings` | member | none (sign-up function) | owner / owner | none |
| `audit_events` | owner of the event's workspace (scope `workspace`) | none | none | none |
| Content tables (§2.2) | member and `deleted_at is null` | member (`with check`) | member and `deleted_at is null` / member; column grants exclude `workspace_id`, `deleted_at`, `status`, `origin`, `evidence_state`, `decided_by`, `decided_at` | none |

Additional rules:

- **Hard DELETE is revoked** from `anon` and `authenticated` on every table. Deletion is soft delete via functions (§8) and permanent deletion via the privileged runner (§4.5).
- **Column-level UPDATE grants** enforce which columns users may change; protected columns change only through definer functions.
- `workspace_id` is immutable (trigger) on every table that has it.
- Child-table visibility follows §8.2.

**Threat assumption (Required):** the browser holds the Supabase URL, publishable/anon key and the user's JWT. Membership, workspace immutability, proposal decisions, `decided_by`, audit writes, soft-delete visibility, invitation rules and operator checks are therefore enforced in the database.

**Accepted limitation:** within their own workspace, a user can insert content rows labelled `origin=extracted` through the API, because the server's AI pipeline and the user share one JWT. This lets users mislabel only their own data. Revisit before any shared workspaces.

### 4.5 Isolated privileged runner (Required)

The service-role key is used **only** by a privileged runner that is not part of the Next.js application's request handling:

- Responsibilities: permanent deletion after retention, deleting Auth users via the supported Supabase Auth Admin API (`auth.admin.deleteUser`), audit retention cleanup.
- Hosting: **pending owner decision** (options: scheduled GitHub Actions workflow with an environment-protected secret; Supabase scheduled Edge Function; a manually run operator script). Until decided, no code path uses the service-role key.
- Never reachable from browser-initiated requests; its secret is not present in the Next.js runtime environment.

## 5. Memory and proposal model

### 5.1 `status`

| Value | Meaning |
| --- | --- |
| `proposed` | Created by AI and not yet decided. Shown only as an unverified suggestion. |
| `confirmed` | A user explicitly approved it via `decide_proposal`, or it was authored by the user (`origin=user_stated`). |
| `rejected` | User declined it. Kept for audit and to avoid re-proposing until deleted. |
| `superseded` | Replaced by a newer record (`supersedes_id` on the newer row). Not used in answers. |

### 5.2 `origin`

| Value | Meaning | Initial status |
| --- | --- | --- |
| `user_stated` | Typed or edited directly by the user | `confirmed` |
| `extracted` | AI extracted it from a cited source that states it explicitly | `proposed` |
| `inferred` | AI concluded it from context; the source does not state it directly | `proposed` |

`origin` is **immutable** after insert (trigger).

### 5.3 Decisions (Required; resolves H3, M1)

- Users cannot UPDATE `status`, `origin`, `evidence_state`, `decided_by` or `decided_at` directly (column grants, §4.4). A direct API update of these columns is denied by privilege.
- The only way to change `status` is `public.decide_proposal(kind, id, decision)`:
  - requires `auth.uid()`, workspace membership of the record, and a valid transition (§5.4);
  - sets `decided_by = auth.uid()`, `decided_at = now()`;
  - writes the audit event in the same transaction.
- Inserts with `origin in ('extracted','inferred')` must have `status='proposed'` (trigger). Inserts with `origin='user_stated'` start `confirmed`.
- **AI code paths never call `decide_proposal` or `approve_task`.** Enforced in the application: only `src/lib/services/proposals/decide.ts` may reference these RPCs (CI grep check), AI tool registry has no decision tools, and an agent test asserts no decision RPC is reachable from any workflow.
- **Residual limitation (documented):** the server's AI pipeline uses the user's JWT, so the database cannot distinguish a decision made by AI code from one made by the user. The database guarantees every decision is attributed to the authenticated caller and audited; the application guarantees AI code paths cannot invoke decisions.

### 5.4 Allowed status transitions (Required; resolves M2)

| From | To | Via |
| --- | --- | --- |
| `proposed` | `confirmed`, `rejected` | `decide_proposal` |
| `confirmed` | `superseded` | `revise_record` (creates the replacement) |
| `rejected` | — | terminal (delete if unwanted) |
| `superseded` | — | terminal |

Any other transition raises. Editing the content of a `confirmed` record whose origin is `extracted`/`inferred` goes through `revise_record`, which inserts a new `user_stated`, `confirmed` record with `supersedes_id` and marks the old one `superseded`. Editing a `proposed` record's content before deciding is allowed via column grants and audited by trigger; its origin is unchanged.

### 5.5 Evidence state (Required; resolves M4)

`evidence_state` is separate from `status` and is the only field system jobs may change:

| Value | Meaning |
| --- | --- |
| `supported` | At least one valid citation to a non-deleted source |
| `sources_hidden` | All cited sources are soft-deleted (restorable) |
| `sources_deleted` | All cited sources were permanently deleted |

- Maintained by triggers on citation/source changes and by the permanent-deletion runner.
- Records not `supported` are never presented as facts, regardless of `status`, and are flagged for user review. `status` is never changed by system code.
- `user_stated` records with no citations are `supported` by definition.

### 5.6 Tasks (Required; resolves M3)

- `origin`: `user_stated` (status starts `open`) or `extracted`/`inferred` (status starts `proposed`).
- `status`: `proposed` → `open` or `rejected`; `open` → `done` or `dismissed`.
- AI-proposed tasks carry no citations; `commitment_id` is required when `origin <> 'user_stated'` (check constraint); evidence comes from the commitment.
- **Atomic approval:** `public.approve_task(task_id, confirm_commitment boolean)` in one transaction: verifies membership; if the commitment is `proposed` and `confirm_commitment` is true, confirms it via the same rules as `decide_proposal`; requires the commitment to be `confirmed` and `supported`; sets the task `open`; writes one audit event per change. Otherwise raises without partial changes.
- If the linked commitment later becomes `rejected` or not `supported`, open AI-origin tasks are flagged for review, not deleted.

### 5.7 Other rules

- Ambiguous dates are stored in `due_text_raw` with `due_date` null until the user sets a date.
- `extracted`/`inferred` records require at least one valid citation at creation (§6).
- Answers use `confirmed` and `supported` records as facts; `proposed` records only labelled as unverified.

## 6. Evidence and citations

### 6.1 Requirements

Each citation stores: `workspace_id` (equal to subject's), subject (memory, commitment, thread analysis, draft), source (message or relationship note), `source_type`, optional `quote` and `span_start`/`span_end`, `created_at`, model metadata.

Factual answers in Q&A are not stored in v0.1; their citations are validated in memory with the same rules before display (ARCHITECTURE §6).

### 6.2 Integrity approach and trade-offs

A single polymorphic table cannot have real foreign keys. Options considered: polymorphic + application validation (no DB integrity); polymorphic + triggers (complex); separate tables per subject (many tables); **exclusive-arc columns with real FKs (chosen)**.

- Subject columns: `memory_id`, `commitment_id`, `thread_analysis_id`, `draft_id`; `CHECK (num_nonnulls(...) = 1)`. Tasks are not citation subjects (§5.6).
- Source columns: `message_id`, `note_id`; `CHECK (num_nonnulls(message_id, note_id) = 1)`.
- Every FK is composite `(workspace_id, x_id) references x(workspace_id, id)`; requires `unique (workspace_id, id)` on referenced tables (§7). `MATCH SIMPLE` skips null arc columns. `ON DELETE CASCADE`, never `SET NULL`.
- FK checks do not apply RLS, so a citation can reference a soft-deleted source; application citation validation rejects this (EVALUATION A20).
- Application validation also checks the source was in the model's context and the quote occurs in the source text.

## 7. Constraints and indexes

- **Workspace-scoped FKs:** referenced tables have `unique (workspace_id, id)`; children reference `(workspace_id, parent_id)`.
- **Message deduplication:** `messages.content_hash` = SHA-256 of normalized (lower-cased sender email, `sent_at` when known, trimmed body). `unique (workspace_id, conversation_id, content_hash)`. `conversations.import_hash` detects re-imports; re-imports are reported, not silently merged.
- **Invitations:** `unique (token_hash)`; partial unique index on `email_normalized` where `consumed_at is null and revoked_at is null`.
- **Model metadata** on derived tables: `ai_provider`, `ai_model`, `prompt_version`, `input_tokens`, `output_tokens`.
- **Indexes:** `contact_identifiers(workspace_id, kind, value_normalized)`, `messages(workspace_id, conversation_id, position)`, `tasks(workspace_id, status, due_date)`, `commitments(workspace_id, status)`, `memories(workspace_id, contact_id, status)`, `workspace_members(user_id)`, GIN full-text on `messages.body_text`.
- `updated_at` triggers on mutable tables.

## 8. Deletion, visibility and retention

### 8.1 Soft delete mechanism (Required)

- Soft-deleted rows are hidden by the RLS SELECT policy (`deleted_at is null`). No separate views.
- Soft delete and restore only through `public.soft_delete_<entity>(id)` / `public.restore_<entity>(id)` (definer; membership checked via `auth.uid()`; audited). `deleted_at` is excluded from column UPDATE grants; hard DELETE is revoked (§4.4).
- Retrieval and search functions run as `security invoker`, so RLS removes soft-deleted rows before ranking.

### 8.2 Visibility of derived and child records (Required; resolves H4)

| Table | Hidden when |
| --- | --- |
| `messages` | own `deleted_at` (set by conversation soft delete in the same transaction) |
| `thread_analyses`, `drafts` | own `deleted_at`, set together with their conversation |
| `conversation_participants` | parent conversation is soft-deleted (policy joins the parent) |
| `contact_identifiers` | parent contact is soft-deleted (policy joins the parent) |
| `commitments`, `memories`, `tasks` | own `deleted_at`; additionally not presented as fact unless `evidence_state='supported'` (§5.5) |
| `citations` | subject or source soft-deleted (policy joins both) |
| `relationship_notes`, `contacts`, `companies`, `conversations` | own `deleted_at` |
| Any row | its workspace is soft-deleted (`is_workspace_member` returns false) |

`get_contact_history` and all AI context loading read only through these policies, so soft-deleted content and analyses of deleted conversations never enter retrieval or AI context.

### 8.3 Permanent deletion

Performed only by the isolated privileged runner (§4.5) for rows soft-deleted longer than the retention window. Retention window: **pending owner decision** (no value assumed). Users can request immediate permanent deletion, which the runner performs on its next run.

### 8.4 Cascade of derived data

Permanently deleting a message deletes its embeddings and citations; deleting a conversation deletes its messages, analyses and drafts. Memories/commitments that lose all citations get `evidence_state='sources_deleted'` (status unchanged) and are flagged for review. Optionally the user may choose "also delete derived items" (M4 UI).

### 8.5 Workspace deletion

Soft deletion of a workspace immediately revokes access to all of its content (§8.2). Permanent deletion removes all content rows and membership. Workspace-scope audit events are retained as minimal records for the audit retention period (**pending owner decision**) and then deleted; `audit_events.workspace_id` has no FK to `workspaces` for this reason.

### 8.6 Account deletion lifecycle (Required; resolves M7)

| Stage | When | Mechanism | Privilege |
| --- | --- | --- | --- |
| 1. Request | User asks to delete their account | `public.request_account_deletion()` sets `profiles.deletion_requested_at`, soft-deletes the user's workspace, writes an audit event | User JWT (definer function) |
| 2. Immediate access revocation | Same request | Data access ends at once because `is_workspace_member` returns false for the soft-deleted workspace. The application then calls Supabase Auth `signOut({ scope: 'global' })` **with the user's own session** to revoke their refresh tokens. Already-issued access tokens remain valid until expiry but grant no data access. A PostgreSQL function does not and cannot revoke Auth sessions. | User session |
| 3. Retention | Between request and permanent deletion | Data retained, inaccessible to the user; restore policy (whether users can cancel) is **pending owner decision** | — |
| 4. Permanent deletion | After the retention period (**pending owner decision**) | Privileged runner deletes workspace content, then calls `auth.admin.deleteUser(user_id)` via the supported Auth Admin API; `profiles`, `workspace_members` and `platform_operators` rows cascade from `auth.users` | Service role, runner only (§4.5) |
| 5. Record | After deletion | Minimal account-scope audit event (ids, timestamps, no content) kept for the audit retention period | Runner |

Sign-in during retention: the Auth user still exists, so OTP sign-in can succeed, but the user has no accessible workspace. The application shows an "account scheduled for deletion" state (M1.4). The sign-up trigger does not run again because no new `auth.users` row is created.

### 8.7 Export

Per-workspace JSON export of user content before production deployment (SECURITY §14).

### 8.8 External AI providers

Data sent to external AI providers is outside this database's deletion; see SECURITY §11.

## 9. Embeddings (deferred until pgvector is enabled)

Schema intentionally not finalized: providers use different dimensions and pgvector indexes need a fixed dimension per column.

- Metadata per row: `workspace_id`, owner reference (message or note, exclusive-arc FKs as in §6), `provider`, `model`, `dimensions`, `content_hash`, `created_at`.
- Similarity search filters `workspace_id` inside a `security invoker` SQL function, so RLS applies.
- Changing model → re-embed; never compare vectors across models.
- Deleted with their source (§8).

Candidate layouts: one table per active dimension (recommended, **pending approval**) or an untyped `vector` column with per-model partial indexes.

## 10. Audit events

### 10.1 Integrity (Required; resolves H1 for auditing)

- `anon` and `authenticated` have **no INSERT, UPDATE or DELETE** privilege on `audit_events`.
- All writes go through `app_private.write_audit(...)` (definer, no external EXECUTE grant), called from:
  1. **Triggers** in the same transaction as a data change (membership, invitations, operator grants, proposal decisions, soft delete/restore, draft approval). `actor_user_id = auth.uid()` (or `actor_kind='system'` when `auth.uid()` is null, e.g. sign-up provisioning).
  2. **Definer functions** listed in §4.3 (decisions, invitations, account deletion).
  3. **`public.log_event(...)`** for events with no data change (AI policy denials, export requested). Granted to `authenticated`; the actor is forced to `auth.uid()`; the workspace is derived from the caller's membership; only a fixed allow-list of non-approval actions is accepted. A user can therefore only record events about themselves, never approvals or another user's actions. Target and metadata fields are restricted to identifier-shaped values so private content cannot be logged.
- Denials inside definer functions are recorded with typed results, not exceptions, so the audit row commits (review M1). Unknown-token verification attempts are not audited (review M3); only first successful verifications are.
- `public.audit_events_id_seq` has no privileges for API roles; default privileges also revoke sequence access (review L1).
  4. **The privileged runner** for permanent deletion and retention events (`actor_kind='system'`).
- No service-role key is used to write audit events from Next.js request paths.
- Optional hardening (recommended, not required for v0.1): hash chain to detect tampering by database administrators.

### 10.2 Scope and schema

- `scope='workspace'`: `workspace_id not null`; readable by that workspace's owner only.
- `scope='account'`: `workspace_id null` (invitations, operator grants, account deletion, sign-up). Not readable through the API; operators/DBAs read via SQL.
- Check constraint: `(scope='workspace') = (workspace_id is not null)`.
- Sign-in failures are left to Supabase Auth logs in v0.1.
- `metadata` holds ids, counts and codes only; never message bodies, drafts, memory content, third-party emails, invitation tokens or secrets.

### 10.3 Retention

Audit retention periods for workspace-scope and account-scope events are **pending owner decision**. Deletion only by the privileged runner.

## 11. Migrations policy

Supabase CLI migrations in `supabase/migrations/`, numbered, forward-only. Destructive changes require explicit approval. `supabase/seed.sql` contains synthetic data only and never grants operator status. Automated tests run against the local Supabase stack (Docker); the hosted development project is for manual development; production is a separate project.

## Operator console functions (M1.5, migration 0010)

All `security definer`, empty `search_path`, EXECUTE for `authenticated` only, and each re-checks
`app_private.is_platform_operator()`; denials return `not_authorized` and are audited
(`*_denied`). `current_user_is_operator()` · `list_waitlist(status, limit, offset)` (audited as
`waitlist.viewed`) · `invite_waitlist_entries(ids[], ttl)` (≤ 50; reuses `create_invitation`;
per-entry `created` with the one-time token, `already_invited`, `already_member`, `declined`,
`not_found`) · `set_waitlist_entry_status(id, pending|declined)` · `list_invitations(limit,
offset)` (state only, never tokens or hashes). Tests: `supabase/tests/30_operator_console.test.sql`.

## Communication Studio tables (M3, migration 0011)

Created: `conversations`, `messages`, `thread_analyses`, `drafts`, `citations` (subjects in M3:
`thread_analysis_id`, `draft_id`; source: `message_id`; composite workspace FKs), `ai_usage_daily`.
RLS as in §4.4 (member + `deleted_at is null`); hard DELETE revoked; UPDATE only `conversations.subject`
and `drafts.content/tone/length/edited_by_user`; drafts can only be inserted as `draft`; citations
are hidden when their subject or source is deleted. Functions: `import_conversation` (security
invoker, atomic, duplicate detection by import hash), `soft_delete_conversation` /
`soft_delete_draft` (definer, audited, cascade `deleted_at` to messages, analyses and drafts),
`record_ai_usage` (definer, member-only, append to today's UTC total). Tests:
`supabase/tests/40_studio.test.sql`.

