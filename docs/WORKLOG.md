# ConvoPilot — Worklog

Session-by-session report of what was worked on. Newest first.

---

## Session 26 — Security and production-readiness review (2026-11-22)

- Owner asked to check security and whether the code is production level. Two independent
  reviewers (app layer, database) plus automated checks. Findings and outcomes: `ACCEPTANCE.md` §2a.
- Fixed: parser ReDoS (high), AI reservation release (medium), export cut at 1,000 rows (medium),
  production URL checks for the app address and the AI address, JSON size limits. Added 404,
  global error page, robots.txt, link-preview image. Dev-only lint dependencies updated (`npm audit`
  now 0).
- Tracked: login CSRF binding (R7), per-workspace row quotas, Turnstile + per-IP limits, search
  terms out of URLs, AI timeout retry accounting, brand-bible artifact.
- Tests: unit 143, pgTAP 273 (CI minimum raised), e2e export of 1,205 rows.

---

## Session 25 — Brand tokens, sign-in emails, eval key name (2026-11-22)

- Owner: "continue next left thing". The remaining launch gates need the owner (real-AI eval key,
  hosted accounts, privacy review), so this session cleared tracked items that need nothing from
  the owner.
- Real-AI eval: an `ANTHROPIC_API_KEY` saved in the cloud environment settings was not visible to
  commands in this session; the eval now also reads `CONVOPILOT_ANTHROPIC_API_KEY` (a new session
  picks up environment variables). Not run: no key available.
- Sign-in emails (confirmation, magic link, recovery) restyled to v2.1: email-safe tables, inline
  styles, no images or remote content, same scanner-safe fragment link.
- `docs/brand/tokens.json` / `tokens.css` updated to v2.1 (light + dark). Brand-bible artifact
  still v1 (tracked).

---

## Session 24 — "Your names in chats" (2026-11-22)

- Owner merged PR #9 (main CI green) and said continue: built the follow-up from session 23.
- Settings → "Your names in chats" (up to 5, comma-separated; migration
  `20261122000100_chat_names.sql`, column grant, database bounds). Messages without an email whose
  sender name matches are shown as "you" and given to the AI as sent by the user (applies to
  earlier imports too); prompts tell the AI the names (analyze-email, extract-commitments and
  draft-reply prompts → version 2).
- Caught in testing: a CHECK that calls a private helper function needs EXECUTE for every
  user who updates the table, so all Settings saves failed. Rewrote it as a plain expression and
  added a pgTAP regression test (other settings still save).
- Tests: unit 135, pgTAP 269 (CI minimum raised), e2e WhatsApp test extended.

---

## Session 23 — WhatsApp chat import; WhatsApp assistant planned (2026-11-21)

- Owner asked for WhatsApp; agreed plan: (1) import WhatsApp "Export chat" text now, (2) a
  WhatsApp assistant on ConvoPilot's own number after early access (design: docs/WHATSAPP.md).
- Built (1): `src/lib/conversations/whatsapp.ts` recognises iPhone and Android exports (pasted or
  `.txt`), joins multi-line messages, drops system notices, media placeholders and deletions,
  infers day/month order, reads times in the workspace time zone, keeps the newest 50 messages and
  tells the user how many were left out. Studio explains how to export a chat. No migration, no
  new dependency. Sender names have no email, so messages are stored with direction "unknown".
- Tracked: let the user say which WhatsApp name is theirs (so their own messages count as
  outbound). Done in session 24.
- Tests: unit +13 (129), new e2e for a WhatsApp upload (time zone, truncation, media dropped).

---

## Session 22 — Light "Orbit" / dark "Signal" themes and Showcase sections (2026-11-21)

- Owner reviewed round-2 ideas (design canvas) and chose Orbit for light mode, Signal for dark
  mode, Showcase sections inside the landing page (docs/BRAND.md §18).
- Dark mode for the whole product: token overrides under `.dark`, no-flash theme script in the root
  layout, theme switch in the landing header and app sidebar (choice kept in this browser only).
- Landing rebuilt: two heroes (one per theme), commitments carousel, moving conversation wall,
  closing "Join the waitlist" display beside the form, bento footer. No new dependency.
- Found and fixed during testing: a theme switch inside the shared sign-in card stopped the
  sign-in pages from becoming interactive after an in-tab navigation (root cause not fully
  isolated; the switch was removed from that card; sign-in pages still follow the saved theme).
- Checks: see the session report (lint, typegen, typecheck, unit, build, guards, Playwright).

---

## Session 21 — v2.0 "Aurora" redesign with micro-animations (2026-11-21)

- Owner rejected the existing UI and three static directions (design canvas), then chose "Aurora
  glow" and "keep the logo shape, recolor it", asking for small animated details on every step.
- Theme: new palette on the existing token names (whole app follows), aurora light background,
  glass surfaces, Instrument Sans display, pill buttons; logo SVGs recolored to a lilac→peach
  gradient. Landing rebuilt (glass pill nav, gradient "slips.", floating preview, restyled demo,
  glass trust cards, glass waitlist, animated FAQ).
- Animations (CSS only, no new dependency, all disabled under reduced motion): sign-up progress
  steps + envelope + thinking dots + first-visit welcome with three getting-started cards;
  waitlist success burst; page rise-in; shimmer loading; approve pop with drawn check; task strike;
  toasts; hover lift.
- Phone: compact menu with a short "Studio" label; no horizontal overflow on any checked screen.
- Tests: one e2e (time zone) made robust to the page becoming interactive after it animates in.
  unit 116, pgTAP 264, integration 22, Playwright 23. Screenshots + a 26 s recording shared.
- Tracked: update `docs/brand/tokens.*` and the brand-bible artifact to v2.

---

## Session 20 — Visual walkthrough and phone fixes (2026-11-20)

- Walked every screen with synthetic data (local mock AI) at desktop (1440×900) and phone (iPhone
  13) sizes; screenshots shared with the owner; no horizontal overflow on any screen at phone width.
- Fixed: phone menu hid Conversations/Tasks/Settings off-screen (now wraps); Dashboard "Next up"
  card overflowed on phones with a long task (grid items `min-w-0`); "Unknown sender" for the
  header-less top message of a paste now reads "Sender not shown in the pasted text".
- Eval: ignores the environment's generic ANTHROPIC_BASE_URL (cloud sessions set it); the
  owner's key was not yet visible to this session, so the real-model run is still pending.
- Checks: unit 116, Playwright 23, guards.

---

## Session 19 — P1 pre-launch: retention, restore, erasure, time zone (2026-11-18)

- Owner merged PR #3 (at M4) and PR #4 (M5 + acceptance); `main` CI green. Fixed a flaky e2e
  selector first (Next.js route announcer also has role=alert).
- Owner decisions: 30-day retention; users restore conversations/contacts; accounts restored only
  by the operator on request.
- Migration 0015: `list_recently_deleted`, `restore_conversation`, `restore_contact` (emails kept on
  delete), `purge_expired` scheduled daily with pg_cron (no service-role key anywhere), account
  erasure deletes workspaces then the Auth user, `workspace_settings.time_zone`.
- App: Settings → Time zone (server-rendered list with current zone names, device suggestion) and
  Recently deleted (restore); Dashboard/Tasks "today/overdue/this week" in the user's zone; wording
  on privacy, account-deletion and deleted-account pages states 30 days;
  `docs/operations/restore-account.sql` (tested in a rolled-back transaction).
- Found while testing: the server's zone list used the outdated `Asia/Calcutta`; now modern names.
- Tests: unit 116 (+3), pgTAP 264 (+32), integration 22, Playwright 23 (+1). CI gates raised.
- Still open: real-model evaluation (key), hosted setup (accounts), privacy/legal review,
  audit-log retention period.

---

## Session 18 — v0.1 acceptance (2026-11-18)

- Independent security review (read-only subagent): no critical/high. Fixed M1 (AI cost-cap race:
  `reserve_ai_usage` + settle, migration 0014), L2 (CSP: self-only content), L3 (argument checks),
  L5 (stored analysis validated on read), NUL bytes rejected in imports. Accepted and documented:
  L1 (claimed senders in quoted history, `SECURITY.md` §7a), L4 (self-forged provenance).
- Independent scenario mapping (S1–S44, A1–A24), then gaps closed: new pgTAP file 70 (31 tests),
  new CI guard `scripts/ci/app-guards.mjs` (Server Actions start with `requireRequestContext()`; no
  logging; no caching; no send capability).
- Settings: "Download my data" (JSON export, audited) and "Delete my account" (typed confirmation,
  workspace hidden at once, global sign-out, `/account-deleted`).
- Model evaluation harness: synthetic dataset (7 threads, 5 questions), scorer, runner,
  `npm run eval` (needs a key; cost-capped); proven in CI with fake models.
- `docs/ACCEPTANCE.md` written; `SECURITY.md` §5/§7a/§15, `EVALUATION.md`, `DATABASE.md` §2.5 updated.
- Tests: unit 113, pgTAP 232, integration 22, Playwright 22. CI gates raised (pgTAP 232, E2E 22).
- Tracked (not built): permanent erasure runner and `restore_*` functions (retention decision);
  "claimed sender" labelling (L1); per-user time zone.
- Not verified: real Anthropic calls (no key here) — the real-model evaluation is the first gate.

---

## Session 17 — M5 Commitments, Tasks and Dashboard (2026-11-18)

- Migration 0013: `commitments`, `tasks` (read-only to the API), commitment citations,
  `store_commitment_proposals` (cited, same-conversation, quote re-checked in SQL, no duplicates),
  `decide_proposal`, `approve_task` (atomic confirm + open), `create_task`, `set_task_status`
  (done/dismiss/reopen), evidence trigger on message deletion. Deviations recorded in DATABASE.md §2.4.
- AI: `extractCommitments` workflow (`extract-commitments@1`): structured output, citation validation,
  no invented dates, tasks only for the user's own promises. Decision RPCs only in
  `src/lib/services/proposals/decide.ts` (CI guard passes).
- UI: Studio "Commitments" panel (Find commitments, clickable sources, Confirm and add task / Confirm
  only / Not a commitment / Add task / No task needed); Tasks screen (waiting for approval, open with
  overdue marking, done and dismissed with reopen, add a task); Dashboard with counts, next tasks and
  recent conversations.
- Tests: unit 107 (+2), pgTAP 201 (+34), integration 22, Playwright 20 (+1 full flow incl. evidence
  dropping, no duplicates, approval from Tasks, audit count). CI gates raised (pgTAP 201, E2E 20).
- Tracked (not built): edit a proposal before deciding; `revise_record`; user-authored commitments;
  deleting tasks/commitments; per-user time zone (dates are UTC).
- Not verified: real Anthropic calls (no key here).

---

## Session 16 — M4 Contacts, Conversations and "ask your history" (2026-11-17)

- Migration 0012: companies, contacts, contact_identifiers, conversation_participants; `save_contact`
  (links past messages), auto-linking trigger for later imports, audited `soft_delete_contact`,
  full-text `search_messages`.
- AI: `askHistory` workflow (bounded read-only tool loop ≤ 4 rounds; citations validated against
  messages the tools returned; otherwise "no record"); tool loop now reports usage and model.
  Shared AI runtime (`src/lib/services/ai-runtime.ts`: consent, daily cap, usage ledger).
- UI: Contacts (list, search by name, add), contact page (details, edit, delete, conversations,
  "Ask about …"), Conversations (all conversations, keyword search with snippets, "Ask your
  history"), Studio "Save as contact" / "View contact" per sender.
- Fix: the menu highlight now sits behind Suspense (Next.js 16 cannot know the URL of
  `/app/contacts/[id]` while prerendering; the build failed without it).
- Tests: unit 105 (+5 askHistory), pgTAP 167 (+22), integration 22, Playwright 19 (+1 full contacts
  flow incl. cited answer, no-record, another user sees nothing, delete). Mock Anthropic server now
  speaks the tool-use protocol. CI gates raised (pgTAP 167, E2E 19).
- Not verified: a real Anthropic call (no API key here). Search is keyword-only (no embeddings yet,
  per DATABASE.md §9).

---

## Session 15 — M3 Communication Studio (2026-11-17)

- Owner decisions: Anthropic, official SDK, hosted processing with consent, $1/day cap.
- `@anthropic-ai/sdk` pinned to 1.4.0 (newest release ≥ 2 weeks old). Adapter uses the beta Messages endpoint with `fallbacks: "default"`, effort medium, SDK retries off; maps typed SDK errors to ProviderError; refusals → `refused`. Discovered: SDK 1.x sends the API key as `Authorization: Bearer` (the e2e mock accepts both).
- Migration 0011 (conversations, messages, thread_analyses, drafts, citations, ai_usage_daily + import/soft-delete/usage functions).
- Dependency-free parser (`src/lib/conversations/parse.ts`): Gmail/Outlook reply chains, .eml headers, multipart, quoted-printable, base64, RFC 2047, HTML → text (never rendered).
- Workflows `analyze-email@1`, `draft-reply@1`; service `src/lib/services/studio.ts` (consent, daily cap, budget, usage recording incl. failed runs).
- UI: Studio (list, import paste/file, messages, analysis with clickable citations, consent card, draft options, editable drafts with save/copy/delete, delete conversation), Settings (AI processing switch, writing style). Privacy notice names Anthropic.
- Tests: unit 100 (parser 9, workflows 4 new), pgTAP 145 (+26), integration 22, Playwright 18 (+3) against a local Anthropic mock (`tests/e2e/mock-anthropic.mjs`). Fixed a data-dependent pgTAP assertion.
- Not verified: a real Anthropic call (no API key in this environment).

---

## Session 14 — M2 AI core (2026-11-17)

- Built SDK-free behind the internal `AiProvider` interface, so no new dependency and P4 only affects the M3 adapter.
- `src/lib/ai/`: provider interface; `callModel` (timeout, one retry for transient errors, typed errors, no provider bodies surfaced); per-request `TokenBudget`; versioned `definePrompt`; `generateStructured` (JSON Schema from Zod in the system prompt, Zod validation, one repair retry that describes only paths/codes, typed `invalid_output`, model metadata); nonce-delimited `wrapUntrusted` + standing preamble; `validateCitations` / `keepCited`; tool `ToolRegistry` (rejects execute tools), `WORKFLOW_TOOLS` allow-list, deterministic `decide`, `executeToolCall` (lookup → Zod → policy → handler → quoted result; denials audited via `log_event('ai.policy_denied')`; handler errors hidden); `runToolLoop` (askHistory only, ≤ 4 rounds, typed incomplete on rounds/budget).
- Tests: 27 new unit tests incl. the prompt-injection harness (hostile email; fully persuaded model cannot send, approve, write memories, draft or cross workspaces). Scripted provider lives in `tests/` only.
- CI: `scripts/ci/ai-guards.sh` (decision RPCs, vendor SDK location, test provider never in src).
- Checks: lint, typegen, tsc, unit 87/87, build. Database and e2e unchanged.
- Tracked for M3: per-workspace daily AI cost cap (DB ledger) after owner sets the cap; P3/P4/P5 decisions.

---

## Session 13 — M1.5 operator console (2026-11-17)

- H1 still waits on the owner (Supabase project + token; PR #3 not yet merged), so M1.5 was built.
- Migration 0010: operator-only `list_waitlist`, `invite_waitlist_entries` (batch ≤ 50, reuses `create_invitation`, links waitlist entry to invitation), `set_waitlist_entry_status`, `list_invitations`, `current_user_is_operator`; denials audited; no tokens in listings.
- App: `/app/operator` (waitlist with status filters and counts, select and invite, one-time links with copy buttons, decline/restore, invitations tab with revoke); Operator menu item only for operators (session read inside Suspense); service `src/lib/services/operator.ts` with Zod-validated results; server actions re-check auth and use `refresh()`.
- `docs/operations/bootstrap-operator.sql` (owner becomes the first operator); GO_LIVE step 3b; DATABASE.md section.
- Checks: lint, typegen, tsc, unit 60/60, build, pgTAP 119/119 (new file 30: 24 tests), integration 22/22, Playwright 15/15 (new: member denied, full waitlist → invite → account creation, revoke). CI gates raised (pgTAP 119, E2E 15).

---

## Session 12 — Brand approved; animated brand bible; app restyled (2026-11-17)

- Owner approved identity v1.0 and the name ConvoPilot; asked for a more alive brand bible and UI.
- New animated brand bible page (claude.ai artifact; source in `docs/brand/brand-bible/`, logos inlined from `public/brand` by `build.py`): logo build animation, live product demo with pause, strategy, voice, logo system, colour (click to copy), type, motion principles, applications, tokens, prompts, rules; light and dark; checked at desktop and phone width (no overflow, no console errors).
- App restyled: brand fonts (`next/font`), Tailwind v4 theme tokens, brand favicon, new landing page with the Highlight and animated product demo, auth pages, app shell, empty states, privacy page. One e2e assertion updated for the new headline; another tightened.
- Checks: lint, typegen, tsc, unit 60/60, build, Playwright 12/12 (CI mode, fresh server).
- Tracked: brand the Supabase email templates (stage B); product dark theme.

---

## Session 11 — Brand identity system v1.0 proposal (2026-11-17)

- Audited the v0.1 brand bible (kept the positioning and voice; replaced the template indigo, placeholder "C" mark and Geist).
- Creative direction "The Highlighted Quote": combination mark (chisel-cut highlighter stroke holding two geometric closing quotes; shared 20° lean) + lowercase Instrument Sans wordmark.
- Real vector logos generated from exact geometry (`scripts/brand/build_logo.py`, needs Python fonttools + the OFL font; not part of the app build) into `public/brand/` (14 SVGs: primary, secondary, mono, dark, symbol, wordmark, app icon, favicon, avatar, pattern). Visually checked at sizes down to 16 px; a slanted tittle was rejected (read as an accent).
- Palette with measured WCAG contrast; type system; graphic language; tokens (`docs/brand/tokens.json`, `tokens.css`); applications; AI logo and mockup prompts; usage rules; QA audit. `docs/BRAND.md` rewritten as v1.0; visual canvas rebuilt (17 boards).
- Not applied to the app yet (pending owner approval). Tracked: adopt v1.0 in the UI (§15), trademark search on name and symbol.

---

## Session 10 — Brand bible draft and domain check (2026-11-17)

- `docs/BRAND.md` drafted (v0.1, awaiting owner approval) from the plan and the existing UI.
- Domain check via registry RDAP: `convopilot.com` (registered 2024-09-16) and `convopilot.ai` are taken;
  `convopilot.app`, `convopilot.dev`, `getconvopilot.com`, `convopilothq.com` returned "not found" (likely
  available; confirm at a registrar). Name/trademark decision added to CLAUDE.md §13.

---

## Session 9 — M1.4 login + protected shell, W1 landing page + waitlist (2026-11-17)

**Scope:** `CLAUDE.md` consolidated master plan; M1.4 (login UI, `proxy.ts`, protected shell) and W1 (public landing page + waitlist). Local Supabase only; no hosted systems touched.

### What was built

- **Login (M1.4).** Passwordless email links only. Custom Auth email templates (confirmation, magic link, recovery) link to `/auth/confirm#th=<token hash>`; the token stays in the URL fragment and is used only by a POST when the person presses **Continue** (scanners that GET the page use nothing). `/invite#t=<token>` removes the token from the address bar immediately. `/login` shows the same "check your email" page for known and unknown addresses. HttpOnly / SameSite=Lax / Secure-in-production session cookies with a 30-day lifetime (`src/lib/supabase/cookies.ts`). `getRequestContext()` = `connection()` + one `auth.getUser()` + membership via RLS, called by every protected page (`ProtectedPage`) and by the account-unavailable page. `src/proxy.ts` only refreshes cookies and redirects signed-out visitors away from `/app`. Sign out (this device / everywhere). Security headers (`X-Frame-Options`, CSP `frame-ancestors`/`form-action`/`base-uri`/`object-src`, `nosniff`, `no-referrer`, Permissions-Policy, COOP, HSTS in production; `X-Powered-By` removed).
- **App shell.** `/app` Dashboard and Communication Studio, Contacts, Conversations, Tasks, Settings with loading, error and empty states (no fake data). `/app/account-unavailable` for accounts without a workspace.
- **Waitlist (W1).** Landing page `/` (story, how it works, trust principles, waitlist form, FAQ), draft `/privacy`. Form → Server Action → `public.join_waitlist` (migration 0009): Zod validation, hidden bot-trap field, consent required, `?ref=` source tracking, same answer for new and repeated emails, global flood limit.
- **Database.** Provisioning failures now raise a generic `P0001 account provisioning failed` (no table/constraint/row details). Auth config: access tokens 15 min, email links 30 min, redirect allow-list.
- **Operator SQL** until the M1.5 console: `docs/operations/review-waitlist.sql`, `docs/operations/invite-from-waitlist.sql` (tested locally: creates hashed invitations, marks entries invited, writes audit events, idempotent on re-run).

### Bugs found and fixed by the new tests

- Supabase's default **recovery** email still used a GET-consumable link → custom recovery template.
- After **sign out everywhere**, another device bounced between `/login` and `/app` because `proxy.ts` trusted a stale cookie → removed the "signed in → skip /login" redirect.
- Protected pages hit Next.js "unstable `Date.now()` while prerendering" (the Auth client reads the clock during runtime prefetch) → `await connection()` before the identity check.
- The Supabase client read env before `cookies()`, so the build tried to prerender a protected page → `cookies()` first.

### Checks run (all local)

- `npm run lint` ✅ · `npx next typegen` ✅ · `npx tsc --noEmit` ✅ · `npm test` ✅ 60/60 (8 files) · `npm run build` ✅
- `npx supabase test db supabase/tests` ✅ Files=3, Tests=95, PASS
- `npm run test:integration` ✅ 22/22 (email-link parser updated to `#th=`)
- `npm run test:e2e` ✅ 12/12 (Playwright 1.63.0, Chromium; also validated in `CI=1` mode with the JSON gate)
- CI: `MIN_PGTAP_TESTS` 95; database job now builds the app and runs Playwright with `MIN_E2E_TESTS` 12. Not yet run on GitHub.

### Tracked follow-ups (TODO register)

- **Email change template** (`email_change`) still uses the Supabase default link; the app offers no email change. Customise before any email-change feature.
- **Rate limiting of public endpoints** (`verify_invitation`, Auth email sending) relies on hosted Supabase limits; must be checked on the hosted dev project (H1). The app no longer calls `verify_invitation`.
- **Bot challenge** (e.g. Turnstile) and **waitlist confirmation email**: need owner accounts (W1 later).
- **L5 ESLint import restriction** for admin clients: still deferred (CI grep guard remains); revisit in M1.5.
- **Privacy notice and FAQ pricing line** are drafts: owner/legal review before going live.
- **Stale session cookies** after a revoked session stay in the browser until the next sign-in (harmless: every request is re-verified).

---

## Session 8 — M1.3 final security corrections (2026-11-16)

**Scope:** the remaining acceptance blocker from the independent re-review, plus the brittle pgTAP assertion. Nothing committed.

- **Token in `auth.identities.identity_data` (re-review MEDIUM).** Traced GoTrue v2.197.0 writes (key names only): the identity is INSERTed with the token at the sign-up request and `identity_data` is UPDATEd (token included) at email confirmation; returning logins and `PUT /user` do not write identities. Added `app_private.strip_invitation_token_from_identity()` (`security invoker`, empty `search_path`, no grants) with a `BEFORE INSERT OR UPDATE` trigger on `auth.identities` (migration `20261116000600_signup.sql`).
- **Regression coverage.** The integration token test now scans every text/varchar/json/jsonb column of every base table in `auth`, `public` and `app_private` (114 columns locally) after sign-up request, email confirmation, returning login and a `PUT /user` that re-adds the token; it also checks Auth/REST/Kong/DB logs and that legitimate fields (`email_verified`, other metadata) survive. pgTAP adds identity-trigger tests (insert, update, non-object JSON, preserved keys) and a catalog check.
- **Brittle pgTAP test #38** now scoped to the fixture user; suite re-run with unrelated committed denial/verification audit rows present: still PASS (rows removed afterwards).
- CI minimum pgTAP count raised to 83.

Remaining documented limitations: HTTP 500 on rejected password writes (transaction rolls back; hash stays NULL); password `/signup` with a valid token creates a passwordless, unconfirmed account (no password, no session without inbox verification).

---

## Session 7 — M1.3 security remediation (2026-11-16)

**Scope:** fixes for the independent M1.3 security review (B1, M1–M4, LOW L1–L8). Local Supabase only. Nothing committed.

### Fixes

- **B1 (account takeover via password sign-up).** Root cause: sign-up was admitted by email + previously set `verified_at`, and password sign-up was enabled with autoconfirm. Fix: the raw invitation token travels in sign-up metadata; the hook and a `BEFORE INSERT` trigger on `auth.users` require `sha256(token)` + matching email and consume the invitation atomically; the token is stripped on insert and on every update; password hashes are removed at creation and any later password write is rejected. `enable_confirmations` and `secure_password_change` are now on. Investigation evidence: the hook payload has `user_metadata` but no password data; `/otp` and `/signup` INSERTs are identical; GoTrue rewrites metadata in later UPDATEs; an unsatisfiable `minimum_password_length` breaks OTP sign-up (GoTrue validates its internal random password), so configuration cannot disable passwords.
- **M1.** `create_invitation` / `revoke_invitation` return typed `jsonb` statuses instead of raising; denial audit events commit.
- **M2.** Per-email advisory lock; expired open invitations are retired (`revoked_reason = 'expired_replaced'`, audited) before the replacement is inserted; `create_invitation` returns `invitation_id` so operators can revoke.
- **M3.** `verify_invitation` performs no writes for unknown/invalid tokens; only the first successful verification is recorded and audited.
- **M4.** CI runs `supabase test db supabase/tests`, parses `Tests=N`, requires `Result: PASS` and ≥ 78 tests; integration tests use the Vitest JSON report and require ≥ 22 passing tests with 0 failures.

### LOW findings — disposition

| ID | Finding | Disposition |
| --- | --- | --- |
| L1 | `audit_events_id_seq` UPDATE for API roles | **Fixed**: sequence privileges revoked; default privileges revoke sequences for API roles; pgTAP checks |
| L2 | Free text accepted by `log_event` | **Fixed**: target-type allow-list, identifier-shaped values, allow-listed metadata keys |
| L3 | Operator rights after deletion request | **Fixed**: `is_platform_operator()` requires no pending deletion |
| L4 | Verification audit actor recorded as system | **Fixed**: actor is `auth.uid()` when signed in |
| L5 | Service-role guard heuristic | **Improved** (secret-key names, camelCase, Admin API methods). Residual risk: a grep cannot catch every obfuscation. **Deferred**: ESLint import/identifier restriction — M1.4 (when application code that could import Supabase admin clients first appears). |
| L6 | `app_private` tables without RLS | **Fixed**: RLS enabled (no policies) |
| L7 | `service_role` lacks SELECT/INSERT/UPDATE on public tables | **Deferred (intentional)**: the privileged runner does not exist yet; grant minimal privileges when it is built (post-M1.3, with runner hosting decision). Risk: none today (nothing uses service_role). |
| L8 | `supabase/.temp/status.env` holds local stack keys | **Accepted / documented**: gitignored, local demo values only, created by `test:integration`; never used against hosted projects. Revisit only if local keys ever become non-default. |

### Known limitation (owner decision)

Password `/signup` **with a valid token** cannot be rejected outright with GoTrue v2.197 (indistinguishable from OTP sign-up at creation). It creates the invitee's account **without a password and without a session**; password login always fails. Alternative for outright rejection: accounts created only through a Next.js Server Action adding an HMAC proof that the hook verifies (requires a new server secret).

### Checks run

See the session report: `supabase db reset`; pgTAP 25 + 53 = 78 (also via the real `supabase test db`); integration 22/22; unit, lint, typegen, typecheck, build; adversarial probes; catalog snapshot; Gitleaks.

---

## Session 6 — M1.3 Stage 0 validation and Stage 1 implementation (2026-11-16)

**Scope:** M1.3 only. Local Supabase stack (Docker); no hosted project touched; no secrets used outside the local stack. Nothing committed.

### Stage 0 — local compatibility and security validation (disposable PoC in the session scratchpad)

- Pinned **Supabase CLI 2.122.1** (`v2.stable`; `latest` 3.1.0 is a one-week-old new major and was not used). Local images: Postgres 17.11.0.006, GoTrue v2.197.0, PostgREST v16.5, Kong 2.8.1, Mailpit v1.31.3.
- `before_user_created` hook: accepted by the CLI config, loaded by GoTrue (`GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=true`), invoked from the non-public `app_private` schema; rejects missing / unverified / expired / consumed invitations (403); valid invitation accepted.
- Provisioning trigger fires as `supabase_auth_admin` with **no** EXECUTE grant; forced failure rolls back user creation completely (GoTrue returns 500).
- `supabase_auth_admin` needs only `usage on schema app_private` + `execute` on the hook.
- API exposes only `public`; `app_private` → PGRST106; `/graphql/v1` not served; `pg_graphql` not installed locally.
- **Finding (spec corrected):** per-schema `alter default privileges … revoke execute` does not remove PostgreSQL's global EXECUTE-to-PUBLIC default; a global `alter default privileges for role postgres revoke execute on functions from public` is required (DATABASE §4.2).
- Global sign-out revokes refresh tokens; already-issued access tokens remain valid until expiry (data access for deleted accounts is still cut immediately by RLS).
- Default local email template sends magic links (token_hash), not 6-digit codes; OTP codes need a custom template.
- `@supabase/supabase-js` 2.119.0 + `@supabase/ssr` 0.12.7: clean install with Next 16.4.6 / React 19.3.0, typecheck/lint/build pass, runtime smoke test against local stack passes.
- Environment limitation: `supabase test db` could not pull its `pg_prove` runner image in this sandbox (ECR/GHCR blobs blocked by proxy, Docker Hub 429); pgTAP files were executed with `psql` instead. The GitHub `database` job will use `supabase test db`.

### Stage 1 — implemented

- `supabase/config.toml` (API schemas `public` only, `auto_expose_new_tables = false`, hook enabled, unused services disabled).
- Migrations 0001–0008 as specified in DATABASE §3–§4, §8.6, §10.
- pgTAP: `supabase/tests/00_catalog.test.sql` (20), `10_tenancy_and_lifecycle.test.sql` (30).
- Integration (real Auth/PostgREST/Mailpit): `tests/integration/auth-signup.test.ts` (12) via `npm run test:integration`.
- App: `src/lib/env/supabase.ts` (lazy), `src/lib/supabase/server.ts` (session-bound `@supabase/ssr` client), unit tests (5).
- Dependencies (exact): `@supabase/supabase-js@2.119.0`, `@supabase/ssr@0.12.7`, dev `supabase@2.122.1`; lockfile additive only (30 packages).
- CI: `database` job; service-role / Auth Admin guard on `src/`. `.env.example` no longer lists the service-role key.

### Checks run (local)

`supabase db reset` (8 migrations) ✓; pgTAP 20/20 + 30/30 ✓ (via psql); integration 12/12 ✓; lint ✓; typegen ✓; tsc ✓; unit 27/27 ✓; build without Supabase env ✓; Gitleaks (non-ignored files) no leaks ✓; `git diff --check` ✓; production audit 0.

### Not verified

GitHub `database` job (needs a push); `supabase test db` runner image; hosted dev project configuration (exposed schemas, `pg_graphql`, hook); privileged runner (not built; hosting pending).

---

## Session 5 — M1.3 documentation correction pass (2026-11-16)

**Scope:** Documentation only. M1.2 accepted (commit `2bfb522`, GitHub CI run 43844657413 green). No code, migrations, Supabase project, secrets or dependencies. Nothing committed.

### Owner decisions recorded (approved 2026-11-16)

Private workspaces only; hosted Supabase dev project for manual development, local Supabase (Docker) for automated tests/CI, separate production; database-enforced authorization; invite-only sign-up; operator-only invitations (platform permission separate from workspace roles); magic link / OTP; M1.3 = database foundation + Supabase Auth integration + session-bound server client + account lifecycle design, M1.4 = login UI, `proxy.ts`, protected shell; Supabase CLI, `@supabase/supabase-js`, `@supabase/ssr` approved subject to compatibility checks.

### Review findings addressed (DATABASE v0.4 unless noted)

- H1: service-role key only in an isolated privileged runner, absent from the Next.js runtime; audit writes via `app_private.write_audit` / `public.log_event` with the user's JWT (§4.5, §10.1; SECURITY §4).
- H2: role model, exposed schemas (`public` only; GraphQL to be disabled or proven harmless), `app_private` schema, `postgres` ownership (custom owner role rejected with reasons), `search_path = ''`, default-privilege revokes, explicit grant matrix (§4.1–§4.3).
- H3: `decide_proposal` only; column grants block direct status/decision edits; AI code barred by CI grep + agent test; residual shared-JWT limitation documented (§5.3).
- H4: per-table visibility matrix incl. derived/child records; `deleted_at` added to commitments, thread analyses, companies (§8.2).
- H5: platform operator table separate from workspace roles; invitation model with hashed tokens, expiry, single use, email binding, revocation; invite-only sign-up gate (§3.4–§3.6).
- M1: EVALUATION A6/S16 redefined. M2: immutable origin, transition table, `revise_record` (§5.4). M3: `approve_task` (§5.6). M4: `evidence_state` separate from status (§5.5). M5: full RLS policy matrix, column grants, DELETE revoked (§4.4). M7: account deletion lifecycle (§8.6).

### Not changed

`docs/OPENCODE_PROMPTS.md` (not in this pass's authorised file list) still shows M1.3/M1.4 as "Blocked on P2/P6" — stale; to be updated with the next authorised docs change.

### Open owner decisions

Retention periods (soft-deleted content, account deletion, audit); whether users can cancel a deletion request; privileged-runner hosting; invitation default TTL (7 days proposed).

### Validation still required (local Supabase stack)

Before-user-created hook availability; `supabase_auth_admin` grants for the provisioning trigger; default-privilege revokes; `app_private` helper usable from RLS policies; GraphQL exposure; `pgcrypto` availability; policy performance.

---

## Session 4 — M1.2 Engineering foundation (2026-11-16)

**Scope:** M1.2 only, as approved (Vitest, Zod, Gitleaks, `.gitignore` exception, lazy env validation). No Supabase, auth, schema, migrations, routes, UI or AI code. Nothing committed.

### Implemented

- Dependencies: `zod@4.6.7` (runtime validation), `vitest@4.1.12` (dev, tests). Vitest 5.1.0 was not used because it requires `@types/node` ≥ 22 (project has ^20).
- `overrides.vite = 7.3.8` in `package.json`: avoids a crash during **fresh dependency resolution** with npm 10.9.x (`Cannot read properties of null (reading 'edgesOut')`), triggered by Vite 8's optional `@vitejs/devtools` peer chain. It is not needed for `npm ci`, which installs from the existing lockfile (already pinned to Vite 7.3.8) and succeeded without the override. npm 11.21.2 resolved the same dependencies without the override (Vite 8.3.8), and the tests passed on that tree. The override only affects Vite (consumed solely by `vitest` and `@vitest/mocker`); Vite 7.3.8 is within Vitest 4's supported range. Remove it when the toolchain uses npm ≥ 11 or when Vitest is upgraded. Lockfile change is additive only (84 packages added, 0 existing changed/removed).
- `src/lib/env/lazy-env.ts`: `createLazyEnv`, `parseEnv`, `EnvValidationError` (variable names + issue codes only, never values), empty strings treated as unset, refuses to run in a browser context.
- `src/lib/env/server.ts` (`server-only`): `getAppEnv()` for `NODE_ENV`, `NEXT_PUBLIC_APP_URL`, `LOG_LEVEL`, validated on first call. Supabase/AI sections deferred to M1.3/M2; service-role key intentionally not read here.
- `vitest.config.ts`, tests in `tests/unit/env/` (22 tests).
- npm scripts: `typegen`, `typecheck`, `test`, `test:watch`.
- `.github/workflows/ci.yml`: `npm ci` → lint → `next typegen` → `tsc` → tests → build; parallel Gitleaks job over full history. No secrets provided to CI.
- `.gitleaks.toml` (default rules). `.gitignore`: `!.env.example`.

### Checks run (local)

- `npm ci` exit 0; `npm test` 22/22 passed; `npm run lint` exit 0; `tsc` before typegen exit 2 (pre-existing, expected), `next typegen` exit 0, `tsc` exit 0; `npm run build` exit 0 with no env files/secrets.
- Gitleaks 8.30.0: git history — no leaks; all 34 non-ignored files — no leaks; planted fake token detected (exit 1). Scanning the raw working directory also reports 8 `generic-api-key` hits, all in gitignored `.next/` build output (Next.js-generated per-build keys) — not repository content.
- `npm audit`: 8 moderate (pre-existing dev-only chain, unchanged); `npm audit --omit=dev`: 0.

### Not verified

- The CI workflow has not run on GitHub yet.
- `getAppEnv()` is not yet imported by any app code, so it is exercised only by tests.

### Next step

Owner review of M1.2. Documentation fixes from the independent review (H1–H5, M1–M9) are required before M1.3.

---

## Session 3 — Documentation hardening and consistency pass (2026-11-16)

**Scope:** Documentation only. Edited AGENTS.md, PRD.md, AGENT_DESIGN.md, OPENCODE_PROMPTS.md, ARCHITECTURE.md, DATABASE.md, SECURITY.md, EVALUATION.md, WORKLOG.md. No code, config, package, migration, test or CI changes. Nothing committed.

### Corrections

- **Audit integrity:** removed member INSERT on `audit_events` (allowed forged events). Writes only via DB triggers (actor = `auth.uid()`) or a service-role-only server writer; `decided_by` set by trigger. Owner-only read; account-scope events with null `workspace_id`; sign-in failures left to Supabase Auth logs; no FK from audit to workspaces so retention survives workspace deletion.
- **Soft deletion:** one mechanism — RLS SELECT hides `deleted_at` rows; soft delete/restore only via `security definer` functions; retrieval runs as `security invoker`; citations to deleted sources are invalid.
- **Tasks:** origin unified to `user_stated`/`extracted`/`inferred`; AI tasks require `commitment_id` and inherit its citations; approval requires a confirmed commitment and an explicit user action.
- **Membership:** no user write access to `workspace_members`; sign-up function creates the private workspace; invitation under Option A grants an account only; workspace_id immutable.
- **Direct-API threat:** documented that users can call the Supabase API with their JWT, so invariants live in the database.
- **File import:** mandatory controls separated from proposed numeric limits.
- **AGENT_DESIGN.md v0.2:** workflows, bounded Q&A loop (4 rounds), tool → policy → service → repository, allow-lists, `prepare_meeting`/`update_contact` deferred, multiple citations, inferred style stays proposed.
- **AGENTS.md:** made authoritative with a precedence table and M1.2–M1.4 milestones; Next.js tooling block preserved unchanged.
- **PRD.md:** audience and problem marked as hypotheses; briefing moved post-v0.1; acceptance criteria aligned.
- **OPENCODE_PROMPTS.md:** legacy prompts marked non-authoritative; scaffold command flagged never-run; legacy P2/P3 template text removed (in Git history at `fbadcfc`); M1.2 draft prompt added, requiring approval.
- **Evaluation:** scenarios S15–S22 and A16–A21 added.

### Checks run

- `git diff --check HEAD` (result in session report).
- Cross-reference and obsolete-term search across the nine files.
- M1.1 baseline facts unchanged; no checks re-run in this session.

### Next step

Owner review. M1.2 not started.

---

## Session 2 — Baseline verification (M1.1) and specification revision (2026-11-16)

**Scope:** Verify the baseline; revise planning docs into an implementation-ready specification. No application code, configuration, package or migration changes.

### M1.1 baseline verification (commands actually run)

- `npm ci` — succeeded with locked versions (Next.js 16.4.6, React 19.3.0, Tailwind 4.3.3, TypeScript 5.9.3).
- `npm run lint` — exit 0.
- `npx tsc --noEmit` on a fresh tree — **exit 2** (`LayoutProps` not found; generated types missing).
- `npm run build` — exit 0 (Cache Components and Partial Prefetching enabled).
- `npx tsc --noEmit` after build — exit 0.
- In a scratch clone: `npx next typegen` then `npx tsc --noEmit` — exit 0. CI order documented in ARCHITECTURE §10.
- `npm audit --omit=dev` — 0 vulnerabilities. `npm audit` — 8 moderate, dev-only (`@typescript-eslint/typescript-estree` → `minimatch`). Not fixed.
- Session 1's "tsc passes" was only true after types were generated.

### Documentation revised

- `ARCHITECTURE.md` — module responsibilities, Next.js 16 proxy/Server Action/Cache Components rules (from installed docs), three-layer security model, AI controls, AGENT_DESIGN.md contradiction review, CI pipeline, pending decisions P1–P6.
- `DATABASE.md` — `workspace_members`, status/origin model, citations with composite-FK exclusive arcs, constraints, dedup hashes, deletion cascade, provider-independent embedding metadata, append-only audit.
- `SECURITY.md` — full requirements for auth, RLS, service-role isolation, AI controls, rendering, file import, logs/caches, external providers.
- `EVALUATION.md` — test layers and security/AI scenarios with acceptance criteria; synthetic-only data policy.

### Not changed

`AGENT_DESIGN.md`, `PRD.md`, `OPENCODE_PROMPTS.md`, `README.md`, `.gitignore` (proposed `!.env.example` documented only), all code and config.

### Open decisions (owner approval required)

Workspace sharing model, local vs hosted Supabase, first AI provider, AI SDK choice, hosted-provider data policy, auth/invitation policy, M1/M2 split, retention periods.

### Next step

Await owner approval of the specification before M1.2.

---

## Session 1 — Project bootstrap & architecture planning

**Scope:** Bootstrap the repository and complete Prompt P1 (architecture & planning). No application feature code.

### What we worked on

1. **Environment verified** — Node 22, npm 10, git available.
2. **Project scaffolded** with `create-next-app` (Next 16, TypeScript, Tailwind v4, ESLint, App Router, `src/` dir, `@/*` alias). Git repo initialized by the scaffold.
3. **`AGENTS.md` written** — the master engineering instruction: locked architecture decisions (local-first, provider-agnostic AI, manual import first, workspace-aware multi-user-ready, internal calendar/tasks first, human-in-the-loop, MVP = 5 screens), stack, engineering principles, agent rules, memory rules, workflow, and phase order. The Next.js agent-rules block was preserved at the top.
4. **Prompt P1 deliverables created** (planning only, no feature code):
   - `docs/PRD.md` — problem, positioning ("AI Chief of Staff"), locked decisions, MVP v0.1 five-screen scope, 10 acceptance criteria, functional + non-functional requirements.
   - `docs/ARCHITECTURE.md` — system diagram, 7 key decisions (D1–D7), provider abstraction interface, orchestrator flow, folder structure, error handling, testing strategy, milestones.
   - `docs/DATABASE.md` — workspace-scoped schema for v0.1 (15 tables), deferred tables list, relationships, memory-integrity rules, indexes/pgvector, migration policy.
   - `docs/AGENT_DESIGN.md` — orchestrator model, 11 tool contracts with permission levels, memory write/read strategy, untrusted-input & prompt-injection policy, structured outputs.
   - `docs/SECURITY.md` — threat model, v0.1 security checklist, tenant isolation, injection defense, secrets policy, data lifecycle.
   - `docs/EVALUATION.md` — 8 evaluation criteria, dataset plan (incl. adversarial fixtures), scoring, v0.1 targets.
5. **Process artifacts created:**
   - `docs/OPENCODE_PROMPTS.md` — the prompt checklist/queue (P0–P8) with status, standing rules, and ready-to-use templates for P2 and P3.
   - `.env.example` — every planned variable documented, no real values.
   - `README.md` — project overview and quickstart.

### Checks run

- `npm run lint` — passes.
- `npx tsc --noEmit` — passes.
- `npm run build` — passes (scaffold baseline).

### Decisions made

- Kept the scaffold-generated Next.js agent-rules block in `AGENTS.md` (it is maintained by tooling).
- Deferred all feature implementation until the owner reviews the planning docs (per the master instruction: present the plan before Phase 1).

### Next steps

1. Owner reviews `docs/PRD.md` + `docs/ARCHITECTURE.md` + `docs/DATABASE.md`.
2. On approval, run prompt **P2** (foundation) from `docs/OPENCODE_PROMPTS.md`.
3. Before P2: create the Supabase project (dev) and fill `.env` from `.env.example`.

### Open questions for the owner

- Supabase project created yet, or should P2 start with local Supabase CLI?
- Preferred first AI provider for the abstraction (any OpenAI-compatible key, Gemini, or Ollama)?
