# ConvoPilot — Security

Version: 0.4 · Status: Specification for review (M1.2 tooling implemented; everything below about auth and data is not yet implemented) · M1.3 correction pass applied · Last revised: 2026-11-16

## 1. Threat model (summary)

ConvoPilot stores sensitive professional communication, including content written by third parties. Main risks:

1. Cross-workspace data leakage (bugs, missing filters, misused service-role key, caching).
2. Prompt injection through imported messages and documents.
3. Excessive AI capability (tools that can do more than the workflow needs).
4. Approval bypass (AI proposals becoming facts or external actions without the user).
5. Private data exposure through logs, caches, analytics, errors and rendering.
6. Secret leakage.
7. Third-party AI provider handling of private content.
8. Malicious uploaded files and HTML email.

## 2. Authentication and authorization (Required)

- Supabase Auth for all access; no anonymous access to any workspace data.
- Every protected Server Action, Route Handler and server-rendered data read verifies: valid session → user → membership in the target workspace. Server Actions are reachable by direct POST (per the installed Next.js data-security guide), so page-level checks are never sufficient.
- `proxy.ts` performs only optimistic cookie-based redirects and is not an authorization boundary.
- Resources in another workspace return **404** (not 403) to avoid revealing existence.
- State-changing Route Handlers check the `Origin` header; Server Actions rely on Next.js's built-in Origin/Host comparison.
- **Sign-up is invite-only (approved).** Only a **platform operator** may issue invitations; operator status is a platform-level grant in `app_private.platform_operators`, separate from workspace roles, granted only by a database administrator, never via JWT claims or user metadata (DATABASE §3.4).
- Invitations are single-use, expiring, bound to one email, stored only as a SHA-256 token hash, revocable, and verified without revealing whether an email exists (DATABASE §3.5). An invitation creates an account with its own private workspace and grants no access to anyone else's data.
- **Account creation requires the raw invitation token** (DATABASE §3.6): the client sends it in sign-up metadata; the before-user-created hook and a `BEFORE INSERT` trigger on `auth.users` verify `sha256(token)` against an open, unexpired invitation for the same normalized email and consume it atomically. A previously verified invitation without the token is never sufficient (fix for review finding B1, a confirmed account-takeover path through password sign-up).
- **Passwordless only (approved: magic link / OTP).** GoTrue v2.197 cannot disable password authentication by configuration, so the database enforces it: password hashes are removed at account creation and any later password write is rejected. Password sign-up without a token is rejected (403); with a valid token it creates the invitee's account without a password or session; password login always fails. `enable_confirmations` and `secure_password_change` are on as defence in depth.
- The raw token is removed wherever Supabase Auth persists sign-up metadata: from `auth.users.raw_user_meta_data` (on insert and on every update, because GoTrue rewrites metadata) and from `auth.identities.identity_data` (on insert and update; GoTrue inserts the identity with the token and rewrites `identity_data` at email confirmation). It is not written to audit records. The integration suite proves the token is absent from every text and JSON column of every base table in `auth`, `public` and `app_private`, and from the Auth/REST/Kong/DB service logs, after sign-up, email confirmation, returning login and an attempted metadata update that re-adds it (verified on the local stack, GoTrue v2.197.0).
- Login: email magic link or OTP via Supabase Auth (approved).
- Membership and roles cannot be changed by users through the database API (DATABASE §3.2); no self-promotion, no removal of the last owner.
- Assume users can call the Supabase API directly with their own JWT. Security and audit invariants are enforced in the database, not only in Next.js (DATABASE §4).

## 3. Workspace isolation and RLS (Required)

- RLS on every workspace-scoped table (DATABASE §4), tested with two users and two workspaces from the first migration.
- Composite `(workspace_id, id)` foreign keys prevent cross-workspace references (DATABASE §7).
- Repositories filter by `workspace_id` as an independent layer; RLS is the backstop, not the only check.

## 4. Database credentials and privileged execution (Required)

- All Next.js request paths — including audit writes, invitations, operator actions and account-deletion requests — use a Supabase client bound to the **user's session JWT** (`@supabase/ssr` server client), so RLS and definer-function checks apply.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is used **only** by the isolated privileged runner (DATABASE §4.5): permanent deletion after retention, Auth user deletion via the Auth Admin API, audit retention. The runner is not part of Next.js request handling, and the key is **not present** in the Next.js runtime environment. A CI check fails if any file under `src/` references the service-role key or the Auth Admin API.
- Runner hosting is a **pending owner decision**; until decided, nothing uses the service-role key.
- The key is never exposed to the client, never prefixed `NEXT_PUBLIC_`, never logged.
- Env variables are validated lazily by Zod (`src/lib/env`); errors name variables, never values.

### 4.1 Database function security (Required)

See DATABASE §4.1–§4.3. Summary: only the `public` schema is exposed through the Data API; internal functions live in the unexposed `app_private` schema; every function sets `search_path = ''`, is owned by `postgres`, has EXECUTE revoked from `public`, `anon` and `authenticated`, and receives only the explicit grants in the DATABASE §4.3 matrix. Default privileges are altered **globally and per schema** so new functions fail closed (the global revoke is required; DATABASE §4.2). The API exposes only `public` (`[api] schemas = ["public"]`, `auto_expose_new_tables = false`); `graphql_public` is not exposed. Validated locally in M1.3 Stage 0; hosted projects must be configured and checked the same way.

## 5. Three independent layers

1. **Application auth** (§2) — who the user is and which workspace they belong to.
2. **Deterministic policy** — plain code, never an LLM. For AI tool calls it is `decide(context, action, resource)` (`src/lib/ai/tools/policy.ts`: allow-list per workflow, permission level, no execute tools). For user actions (v0.1 acceptance clarification) the deterministic rules live in Zod validation at the Server Action plus the SECURITY DEFINER database functions, which check membership, valid state transitions and evidence before any write (for example `decide_proposal`, `approve_task`, `reserve_ai_usage`); services add no separate policy function.
3. **Database RLS** (§3).

A failure in one layer must not expose data; tests target each layer separately (EVALUATION.md).

## 6. AI-specific controls (Required)

- **Untrusted content:** imported emails, messages, documents and attachments are always data, never instructions. They cannot authorize tool calls, change policy or alter system instructions.
- Prompts wrap untrusted content in clearly labelled delimiters and state that it may contain adversarial instructions. This is a mitigation, not the defence; the defence is capability limits.
- **Capability-limited tools:** each workflow has a fixed tool allow-list (ARCHITECTURE §5.4). Tool arguments are Zod-validated; the policy layer checks every call; out-of-list calls are denied and audit-logged.
- **No execute-level tools in v0.1.** No email sending, external writes or sharing. The registry rejects execute tools.
- **Approval:** AI-extracted/inferred memories and commitments stay `proposed` until a user confirms through a Server Action (DATABASE §5). Sensitive or external operations (future) require explicit per-action approval.
- **Grounding:** citations are validated (exists, same workspace, in supplied context, quote matches) before facts are shown or proposals stored.
- **Limits:** per-request token budget, max 4 tool rounds in Q&A, per-workspace daily token/cost cap.
- The LLM never receives database credentials, SQL access or the service-role client.

## 7. Rendering imported content (Required)

- Imported message bodies are rendered as **plain text** (React text nodes). No `dangerouslySetInnerHTML` for imported or model-generated content.
- HTML emails are converted to text server-side at import; the original HTML is not stored in v0.1.
- No automatic loading of remote images, tracking pixels, iframes or URLs from imported content or model output. Links are shown as text; if made clickable later, they open only on explicit click with `rel="noopener noreferrer"` and a visible full URL.
- Model output is rendered as plain text or a restricted markdown subset with images disabled.

### 7a. Accepted residual risk: claimed senders in quoted history (security review L1)

In pasted or `.eml` threads, the `From:` lines of *quoted* earlier messages are text written by
whoever sent the email. A forged quoted block can claim to be from the user (shown as "you", and
proposed as the user's own commitment) or from a saved contact (linked to that contact). Accepted
for v0.1 because nothing becomes a fact or a task without the user's approval and every proposal
shows the message it came from. Planned fix: label quoted-history senders as "claimed", don't
auto-link them, and use authoritative headers once Gmail import arrives (M7).

## 8. Audit events (Required)

Append-only `audit_events` (DATABASE §10):

- Users have **no insert, update or delete** access. All writes go through `app_private.write_audit`, called from triggers, from definer functions, from `public.log_event` (actor forced to `auth.uid()`, fixed non-approval action list) or from the privileged runner (DATABASE §10.1). Users cannot forge approvals or another user's actions.
- `decided_by`/`decided_at` are set only inside `public.decide_proposal` / `public.approve_task`; the columns are not user-updatable (DATABASE §5.3).
- Records actor, action, target ids and codes — never content. Covers proposal decisions, soft delete/restore, permanent deletion, exports, membership changes, invitations and AI policy denials.
- Workspace-scope events are readable by the workspace owner only; account-scope events (no workspace) are not readable through the API. Sign-in failures rely on Supabase Auth logs in v0.1.
- Retention periods are **pending owner decision** (DATABASE §10.3).

## 9. Private data exposure (Required)

- **Logs:** never log message bodies, drafts, memories, prompts, model outputs, provider error bodies (may echo prompts), cookies, tokens or env values. Log request id, user id, workspace id, error code, counts.
- **Caches:** no caching of private workspace data in v0.1 (ARCHITECTURE §3.3). Any future cache requires a documented key including workspace and user, invalidation rules, and cross-user tests.
- **Analytics:** no third-party analytics or session replay in v0.1.
- **Errors:** user-facing errors are generic codes/messages; stack traces and internal ids not needed by the user are not returned.
- **Seed and fixtures:** synthetic only.

## 10. File import

### 10.1 Mandatory controls (Required)

- Accepted formats: pasted text, `.txt`, `.md`, `.eml`. Everything else is rejected.
- Validation: the extension must be in the allow-list; the browser-supplied MIME type is untrusted and used only to reject obvious mismatches; content must decode as text (UTF-8 or the declared charset), contain no NUL bytes, and `.eml` must parse as an RFC 5322 message. Failures return a typed error.
- Size limits are enforced server-side before parsing (values in §10.2), for both uploads and pasted text.
- `.eml`: MIME parsed server-side; use the `text/plain` part, else convert `text/html` to plain text. Original HTML is not stored.
- Attachments are ignored and never stored in v0.1.
- Files are parsed in memory; not written to disk or object storage in v0.1.
- Imported content is stored and rendered as plain text (§7); remote images and URLs are never fetched.
- The MIME parser is a new dependency and needs a stated justification and approval in its milestone.

### 10.2 Proposed limits (pending approval; do not block M1.2)

| Limit | Proposed value |
| --- | --- |
| Maximum file size | 1 MB per file |
| Maximum pasted text | 200,000 characters |
| Files per import | 1 |

## 11. External AI providers (Required; policy pending)

- Whether private content may be sent to a hosted provider is a **pending decision** (ARCHITECTURE §11 P5). Recommended default: per-workspace opt-in, off by default.
- Before enabling any hosted provider, document in this file: provider name, data retention period, whether data is used for training, region, and the account/API settings used.
- Send only the minimum context needed for the workflow (the thread being analysed and retrieved snippets), not whole mailboxes.
- Provider API keys are server-only and never sent to the browser.
- Users are told which provider processes their content at the point of analysis.
- Deletion in ConvoPilot does not delete data already held by the provider; this is disclosed.

## 12. Secrets and configuration (Required)

- `.env*` files are gitignored; `.env.example` documents variable names with no values.
- `.gitignore` includes `!.env.example` (applied in M1.2) so the example file is not silently ignored.
- CI secret scanning with Gitleaks (pinned, checksum-verified) fails the build on findings (M1.2).
- Secrets are never printed in logs, documentation, test output or reports.

## 13. Dependencies

- Baseline 2026-11-16: production audit (`npm audit --omit=dev`) 0 findings; full audit 8 moderate in a dev-only chain (details in ARCHITECTURE §10). This is a dated observation.
- `npm audit fix --force` (breaking) is not applied without review.
- New dependencies require a stated requirement (AGENTS.md).

## 14. Data lifecycle

- Export: per-workspace JSON export before any real deployment.
- Deletion: soft delete (immediately invisible, including derived content, DATABASE §8.2) → permanent deletion by the privileged runner after retention, cascading to embeddings and citations; evidence loss is recorded in `evidence_state`, never by changing decision status (DATABASE §5.5, §8.4).
- Account deletion: request → immediate data-access revocation (workspace soft-deleted) and global sign-out with the user's own session → retention → permanent deletion including `auth.admin.deleteUser` by the privileged runner (DATABASE §8.6).
- Retention periods (soft-deleted content, account deletion, audit events) and whether users may cancel a deletion request are **pending owner decisions**.

## 14a. Environment separation (approved)

- Hosted Supabase **development** project for manual development; **separate production** project; local Supabase stack (Docker) for automated tests and CI. No production data in development or CI; seed data synthetic only.
- Each environment has its own keys; CI uses only local-stack keys generated at run time.

## 15. v0.1 security checklist (status at v0.1 acceptance, 2026-11-18 — see `ACCEPTANCE.md`)

- [x] Auth verified in every protected Server Action, Route Handler and data read (CI guard `scripts/ci/app-guards.mjs`; there are no Route Handlers).
- [x] Invite-only sign-up and operator-only invitations enforced in the database (hook + provisioning trigger).
- [x] No function callable by `anon`/`authenticated` outside the DATABASE §4.3 matrix (catalog test).
- [x] Account deletion lifecycle implemented; service-role key absent from the Next.js runtime (and from everywhere: erasure is a database job). Request → immediate loss of access → global sign-out → 30 days → permanent erasure, all tested.
- [x] RLS on every workspace table, cross-workspace tests passing.
- [x] User-JWT client on all request paths; service-role key only in the privileged runner, CI-enforced.
- [x] Policy layer in every service and AI tool call (as defined in §5).
- [x] Zod validation on all inputs, tool args and model outputs (stored analyses are validated on read too).
- [x] Prompt-injection regression tests in CI (with test provider).
- [x] Citation validation enforced (in the app, and again in SQL for commitments).
- [x] No automatic confirmation of AI proposals.
- [x] Append-only audit events.
- [x] Plain-text rendering; no remote content loading (CSP `default-src 'self'`, `img-src 'self' data: blob:`, `connect-src 'self'`).
- [x] File size/type limits; HTML converted to text; NUL bytes rejected with a typed error.
- [x] Log redaction verified by test (CI guard: no logging calls in `src/` at all; integration test: no invitation token in service logs).
- [x] No private-data caching (CI guard).
- [x] Secret scanning in CI.
- [x] Export and deletion implemented before real deployment (JSON export; deletion with 30-day restore window and permanent erasure).
- [x] No send capability exists in v0.1 (CI guard: no outbound calls outside the AI adapter, no mail/messaging dependencies).
