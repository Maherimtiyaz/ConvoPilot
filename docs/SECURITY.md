# ConvoPilot — Security

Version: 0.3 · Status: Specification for review (nothing below is implemented yet; hardening pass applied) · Last revised: 2026-11-16

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
- Invitation and sign-up policy: **pending decision** (ARCHITECTURE §11 P6). Recommended default: invite-only, public sign-up disabled; under the recommended workspace model an invitation creates an account with its own private workspace and grants no access to the inviter's data (DATABASE §3.3).
- Membership and roles cannot be changed by users through the database API (DATABASE §3.1a); no self-promotion, no removal of the last owner.
- Assume users can call the Supabase API directly with their own JWT. Security and audit invariants are enforced in the database, not only in Next.js (DATABASE §4).

## 3. Workspace isolation and RLS (Required)

- RLS on every workspace-scoped table (DATABASE §4), tested with two users and two workspaces from the first migration.
- Composite `(workspace_id, id)` foreign keys prevent cross-workspace references (DATABASE §7).
- Repositories filter by `workspace_id` as an independent layer; RLS is the backstop, not the only check.

## 4. Database credentials (Required)

- Normal request paths use a Supabase client bound to the **user's session JWT**, so RLS is evaluated on every query.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is:
  - read only in one `server-only` module;
  - imported only by this allow-list, enforced by a CI grep/lint rule:
    1. `src/lib/audit` server-only writer (non-data audit events, DATABASE §10.1);
    2. permanent-deletion and retention job;
    3. invitation admin action (if approved under P6);
  - never exposed to the client, never prefixed `NEXT_PUBLIC_`, never logged.
- Env variables are validated at startup by a Zod schema; missing secrets fail fast with the variable **name** only.

## 5. Three independent layers

1. **Application auth** (§2) — who the user is and which workspace they belong to.
2. **Deterministic policy** — `decide(context, action, resource)` returns allow / deny / requires_approval. Implemented as plain code, never by an LLM. Applied in every service and before every AI tool execution.
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

## 8. Audit events (Required)

Append-only `audit_events` (DATABASE §10):

- Users have **no insert, update or delete** access. Events are written only by database triggers (data changes; actor from `auth.uid()`) or by the server-only audit writer (non-data events; actor from the verified `RequestContext`). Users therefore cannot forge events or attribute approvals to another user.
- `decided_by` on proposals is set by trigger, never by the client.
- Records actor, action, target ids and codes — never content. Covers proposal decisions, soft delete/restore, permanent deletion, exports, membership changes, invitations and AI policy denials.
- Workspace-scope events are readable by the workspace owner only; account-scope events (no workspace) are operator-only. Sign-in failures rely on Supabase Auth logs in v0.1.
- Retention periods pending approval (DATABASE §10.3).

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
- Deletion: soft delete → permanent deletion job, cascading to embeddings, citations and derived records (DATABASE §8).
- Audit retention: minimal records, retention period pending approval.

## 15. v0.1 security checklist (all open)

- [ ] Auth verified in every protected Server Action, Route Handler and data read.
- [ ] RLS on every workspace table, cross-workspace tests passing.
- [ ] User-JWT client on request paths; service-role key isolated and CI-enforced.
- [ ] Policy layer in every service and AI tool call.
- [ ] Zod validation on all inputs, tool args and model outputs.
- [ ] Prompt-injection regression tests in CI (with test provider).
- [ ] Citation validation enforced.
- [ ] No automatic confirmation of AI proposals.
- [ ] Append-only audit events.
- [ ] Plain-text rendering; no remote content loading.
- [ ] File size/type limits; HTML converted to text.
- [ ] Log redaction verified by test.
- [ ] No private-data caching.
- [ ] Secret scanning in CI.
- [ ] Export and deletion implemented before real deployment.
- [ ] No send capability exists in v0.1.
