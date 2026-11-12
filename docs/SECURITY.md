# ConvoPilot — Security

Version: 0.1 · Status: Draft for review

## 1. Threat model (summary)

Single-tenant-per-workspace app storing sensitive professional communication. Main risks: cross-user data leakage, prompt injection via imported messages, excessive agent capability, secret leakage, log exposure of private content.

## 2. Requirements (v0.1 checklist)

- [ ] Supabase Auth for all access; no anonymous data access.
- [ ] Row Level Security on every user-owned table (`workspace_id` scoped); policies tested.
- [ ] Server-side API key storage only; provider keys never reach the browser.
- [ ] Zod validation on every API route and tool call.
- [ ] `audit_logs` for approval-worthy actions (draft approved, task approved, memory confirmed/deleted).
- [ ] No raw email/message content in application logs — redaction layer for any logged payload.
- [ ] Imported emails treated as untrusted input, never as instructions (see AGENT_DESIGN §5).
- [ ] Prompt-injection regression tests in CI.
- [ ] LLM has no arbitrary database access — only the tool registry.
- [ ] Integration tokens (future Gmail) encrypted at rest, minimum scopes, revocable.
- [ ] Data export and deletion endpoints documented and implemented before any real deployment.
- [ ] No email/message is ever sent without explicit user approval (no send capability exists in v0.1).

## 3. Tenant isolation

- Every query path goes through repositories that always filter by `workspace_id`; RLS is the second line of defense, not the only one.
- Tests include a cross-tenant access attempt fixture (user B requesting user A's contact must 404, not 403, to avoid existence leaks).

## 4. Prompt injection defense

- System prompt declares message content as untrusted data with explicit delimiters.
- Tool registry rejects any tool call not matching the planned, permission-allowed set.
- Adversarial fixtures maintained in `tests/agent/fixtures/injection/`.

## 5. Secrets & configuration

- `.env` is gitignored; `.env.example` documents every variable with no real values.
- CI must fail if a commit introduces likely secrets (manual review + grep checklist).

## 6. Data lifecycle

- Export: per-workspace JSON dump of user content.
- Deletion: soft-delete then hard-delete job; audit entry records the erasure.
- Seed/demo data is synthetic only.
