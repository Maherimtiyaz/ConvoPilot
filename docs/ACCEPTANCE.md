# ConvoPilot v0.1 — Acceptance report

Date: 2026-11-18 · Branch `claude/bold-bardeen-apecf5` · Status: **feature-complete and verified
locally with a mock AI; three gates remain before early access (§6).**

This report is the evidence for the v0.1 acceptance criteria (`PRD.md` §5), the security checklist
(`SECURITY.md` §15) and the test scenarios (`EVALUATION.md` §3–§5). Every check listed as passing was
actually run; nothing here was verified against the real Anthropic API, because no key exists in the
development environment.

## 1. Product acceptance criteria (`PRD.md` §5)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Paste a thread or import `.txt`/`.md`/`.eml` | ✅ | `tests/e2e/studio.spec.ts` (paste; `.eml` upload; unsupported file), `tests/unit/conversations/parse.test.ts` |
| 2 | Intent, main points, expected response, citing messages | ✅ mock AI | `studio.spec.ts` (cited analysis; unsupported statement removed), `tests/unit/ai/workflows.test.ts` |
| 3 | Reply draft in my confirmed style | ✅ mock AI | `studio.spec.ts` (style from Settings, draft), `workflows.test.ts` (style in prompt). Style comes only from what the user types in Settings |
| 4 | Edit, save and copy drafts | ✅ | `studio.spec.ts` (edit, save; copy button) |
| 5 | Save the sender as a contact | ✅ | `tests/e2e/contacts.spec.ts` ("Save as contact" in the Studio) |
| 6 | Retrieve the conversation later | ✅ | `contacts.spec.ts` (Conversations list, keyword search), `supabase/tests/50_contacts.test.sql` |
| 7 | "What did I discuss with X?" with citations, or "no record" | ✅ mock AI | `contacts.spec.ts` (cited answer; "No record of that"), `tests/unit/ai/ask-history.test.ts` |
| 8 | Commitments and tasks proposed; nothing confirmed without approval | ✅ | `tests/e2e/tasks.spec.ts`, `supabase/tests/60_commitments_tasks.test.sql`, `70_acceptance.test.sql` (A16, A18) |
| 9 | Never invents commitments; ambiguous dates stay raw text | ✅ mock AI · ⏳ real AI | Citation required in the app and again in SQL (`60_…`: invented quote refused); no hard date for "Friday" (`tasks.spec.ts`); real-model rate measured by `npm run eval` (§4) |
| 10 | Cannot send any message | ✅ | No sending code or library; CI guard `scripts/ci/app-guards.mjs` rule 4 fails the build on any outbound call outside the AI adapter or any mail/messaging dependency |
| 11 | Another user cannot see or change my data | ✅ | pgTAP files 10–70 (cross-workspace reads, writes, deletes, functions), `tests/integration/auth-signup.test.ts`, e2e second-user checks in `studio.spec.ts` and `contacts.spec.ts` |

## 2. Security review (independent, 2026-11-18)

A separate reviewer read every migration, Server Action, service, the auth, AI and proxy code, the
headers and the CI guards, assuming an attacker with a valid account calling the database API
directly. **No critical or high findings.** Findings and outcomes:

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| M1 | Medium | Concurrent AI requests could all pass the $1/day check and overshoot it | **Fixed**: migration 0014 reserves each run's worst-case cost under a row lock before the model call (`reserve_ai_usage`) and settles it afterwards; overshoot is now bounded by one request. Tests: `70_acceptance` (5 checks), all AI e2e flows |
| L1 | Low | Headers inside *quoted* history can claim to be from the user or a saved contact (affects "sent by you", contact linking, proposed `owner: me`) | **Accepted for v0.1, documented** (`SECURITY.md` §7a): proposals still need the user's approval and show their source message. Planned fix: mark quoted-history senders as "claimed" and don't auto-link them (with M7's authoritative Gmail headers) |
| L2 | Low | CSP lacked `default-src`, `img-src`, `connect-src` | **Fixed**: CSP now allows content only from this site (no remote scripts, images, fonts or connections). `'unsafe-inline'` scripts remain because nonces are incompatible with Partial Prerendering (installed Next.js docs). Tests: `auth.spec.ts` (header and no violations on public pages) |
| L3 | Low | Two Server Actions called `.trim()` before validating their arguments | **Fixed** (type checks before use) |
| L4 | Low | A user calling the API can mark items in *their own* workspace as AI-made | **Accepted, documented**: affects only the caller's own data; AI provenance is treated as untrusted for any future cross-user use |
| L5 | Low | Stored analysis JSON was cast without validation | **Fixed**: validated with `storedAnalysisSchema` on read; invalid rows are treated as absent |
| §10.1 | — | NUL bytes in imports produced a generic database error | **Fixed**: typed `invalid_text` error with a clear message (unit test) |
| §14 | — | No account deletion or export in the app | **Built**: Settings → "Download my data" (full JSON export, audited) and "Delete my account" (typed confirmation; workspace hidden at once; all sessions revoked). Test: `tests/e2e/account.spec.ts` |

## 2a. Security and production review (two independent reviewers, 2026-11-22)

One reviewer read the app layer (`src/`, headers, proxy), the other the database (all migrations,
config). Both assumed an attacker with a valid account calling the API directly, plus outside
senders crafting the content users paste. Each finding was re-checked before fixing.

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| R1 | High | A crafted pasted/uploaded email (huge fake address in a `From:` header) made the parser's regex backtrack for seconds to minutes, blocking the server | **Fixed**: header lines over 500 characters are never pattern-matched, address values are capped, `@` excluded from the bare-address pattern. Reproduced first (4,000 chars → 5 s); now < 0.5 s. Tests: 4 timing tests in `parse.test.ts` |
| R2 | Medium | `record_ai_usage` released any amount the caller named, so a direct API caller could clear reservations and let parallel requests pass the $1/day cap | **Fixed**: migration `20261122000200` — each reservation is a private row; settling names its id and releases exactly that amount once. Tests: `70_acceptance` (+4) |
| R3 | Medium | Data export silently stopped at 1,000 rows per table (API page limit) | **Fixed**: the export pages through every table. Test: `account.spec.ts` exports 1,205 contacts |
| R4 | Low | The test-only `ANTHROPIC_BASE_URL` was accepted in production (could send conversations to another host) | **Fixed**: production allows only `https://api.anthropic.com` or the local test mock. Unit tests |
| R5 | Low | A forgotten `NEXT_PUBLIC_APP_URL` in production would give invitation links to `localhost` | **Fixed**: production requires an https address (or 127.0.0.1 for local tests). Unit tests |
| R6 | Low | User-writable JSON (`writing_style_profile`, `thread_analyses.analysis`) had no size limit | **Fixed**: size checks (20 KB / 200 KB). Row-count quotas per workspace: tracked for before ~1,000 users |
| R7 | Low | Login CSRF: someone with an account could send a victim *their own* sign-in link, so the victim works inside the attacker's workspace | **Accepted for now, tracked**: the Dashboard shows the signed-in email. Planned fix: bind the link to the browser that requested it |
| R8 | Low | The public waitlist's global flood limit can be jammed by a script | **Known**: bot check (Turnstile) and per-IP limits needed before sharing the link widely (owner account) |
| R9 | Info | Search terms are in the URL (`?q=`), so they reach hosting logs and history; AI timeouts retried may be under-counted; conversations erased after 30 days take their confirmed commitments with them (documented decision) | **Tracked** |
| — | — | Production basics missing | **Added**: branded 404 page, last-resort error page, `robots.txt` (app and auth pages not indexed), link-preview image and share metadata; the in-app error page now re-fetches from the server |

Areas both reviewers found sound: auth checks on every page and action, no cross-workspace access,
RLS on all 17 tables with narrow column grants, fail-closed function privileges, invitations and
sign-up, audit log, soft delete and restore, operator console, no XSS sinks, no secrets or content
in logs, AI tool loop limits and citation checks. Production dependencies: 0 known vulnerabilities
(`npm audit`); 7 moderate ones in development-only lint tooling were updated away.

## 3. Security checklist (`SECURITY.md` §15)

See the updated checklist in `SECURITY.md` §15: **all 19 items are met** (since 2026-11-18, when
retention, restore and permanent erasure were built after the owner chose a 30-day retention).

## 4. Test scenarios and model evaluation (`EVALUATION.md`)

**Automated suites (all passing locally on 2026-11-18):** unit 113, database (pgTAP) 232,
Auth integration 22, browser end-to-end 22, plus CI guards (`ai-guards.sh`, `app-guards.mjs`,
service-role check, Gitleaks).

**Scenario coverage** (S1–S44, A1–A24; mapped by an independent pass, then gaps closed):

- Closed in this phase: S2 (cross-tenant updates), S5/S6/A7 (every Server Action must call
  `requireRequestContext()` first; CI guard), S11 (no logging calls anywhere in `src/`; CI guard),
  S12 (no caching APIs in `src/`; CI guard), S16, S18, S21, S36 (domain tables after account
  deletion), A15, A16, A17, A18 (one audit event per change), A22, A24.
- Not applicable yet (feature not built): S7, S8 (no Route Handlers), A14 (permanent deletion
  runner, embeddings), A19 (no inferred style preferences or memories).
- Remaining partial coverage (accepted for v0.1; the database rules are enforced, only the extra
  test variant is missing): S13 (client errors are generic strings by construction; no test sweeps
  every error path), S14 (MIME sniffing and attachment parts beyond the extension check), S19/A13
  (restore and single-message deletion are not features yet), S28/S31 (two extra invitation
  variants), S34 (sign-out on deletion is verified end to end, not in pgTAP), A12 ("nothing
  persisted" holds by construction: services store only after a workflow succeeds), A21 (deferred
  tools by name).

**Model evaluation (`npm run eval`):** a synthetic dataset of seven threads (feedback with an
implied commitment, partnership offer, scheduling, unanswered questions, "let's talk next week",
an adversarial email, an HTML email with a tracking image) and five history questions. The run
covers the parser, analysis, commitment finding, drafting and "ask your history", then scores them
against the v0.1 targets: intent and key points ≥ 90%, owner accuracy 100%, no invented dates, no
invented or injected content, injection resistance 100%, retrieval ≥ 90%. Drafts are saved for the
1–5 writing rubric. The harness is proven in CI (a perfect fake model passes every target; a
careless one fails exactly the right metrics). **Real-model results are pending an API key**
(cost ≈ $1–2 per run, capped by `EVAL_MAX_USD`).

## 5. Accepted residual risks (v0.1)

1. Quoted-history sender claims (L1 above).
2. Self-forged AI provenance in one's own workspace (L4).
3. `'unsafe-inline'` in `script-src` (no injection sink exists; content is rendered as plain text).
4. The public Auth API reveals whether an email has an account (accepted in M1.4).
5. A revoked session's access token works against the database API for up to 15 minutes.
6. Dates such as "imported on" are shown in UTC; "today", "overdue" and "due this week" follow the
   user's time zone (Settings).
7. Services rely on authentication, database rules and definer functions rather than a separate
   policy function per service (`SECURITY.md` §5 updated to say so); AI tool calls do use the
   deterministic policy layer.

## 6. Gates before inviting early-access users

| Gate | Who | Status |
| --- | --- | --- |
| Real-model evaluation passes the targets (`npm run eval` with an Anthropic key) | Owner provides the key in a safe place; Claude runs and reviews | ⏳ needs key |
| Hosted setup (Supabase production, Vercel, email domain) per `docs/operations/GO_LIVE.md` | Owner accounts, then Claude | ⏳ needs owner |
| Privacy notice and user countries reviewed (retention decided: 30 days, now stated in the notice) | Owner (and legal) | ⏳ needs owner |
| Manual walkthrough on the hosted dev site with the real AI (5 screens, phone and desktop) | Claude, then owner | ⏳ after hosting |
