# CLAUDE.md — ConvoPilot master plan

@AGENTS.md

This file is the **single consolidated plan** for building ConvoPilot with Claude Code. It
combines the product, architecture, database, security, AI, testing, roadmap and launch plans
agreed with the owner. `AGENTS.md` (imported above) remains the authoritative engineering
rulebook; the detailed specifications live in `docs/` and this file links to them. If anything
here conflicts with `AGENTS.md` or a `docs/` specification, report it and fix the documents.

---

## 1. How we work (owner agreement)

- The owner is **not a software engineer**. Claude acts as senior engineer, AI product architect
  and security lead, makes routine technical decisions with sensible defaults, and explains them
  in plain language.
- Work proceeds **phase by phase**. After every phase, report in this format and stop:
  1. **What I did** (plain language first, technical detail second).
  2. **What I verified** (checks actually run, with results — never claim unrun checks).
  3. **What I will do next**.
  4. **What I need from you** (questions/decisions, each with a recommended default).
- Ask the owner about **product, business, legal, accounts, money, brand**. Never ask the owner to
  make low-level engineering choices without a recommendation.
- Commits and pushes: allowed when the owner has approved the phase. Only to the working branch
  `claude/bold-bardeen-apecf5`; never to `main`; never force-push.
- Never stage `convopilot-docs-hardening.diff` or `convopilot-m1-2-review.txt` (owner's exports).
- Never ask the owner to paste secrets into chat. Secrets live only in hosting dashboards
  (Vercel/Supabase) or local `.env.local` files (gitignored).

## 2. Product (detail: `docs/PRD.md`)

**ConvoPilot is an AI chief of staff** that turns professional conversations into decisions,
commitments and completed work. Initial audience (hypothesis, not yet validated): solo founders and
small-startup operators.

**v0.1 scope — five screens + Settings shell:** Dashboard · Communication Studio (paste/import a
thread, analysis, reply in the user's style, drafts) · Contacts · Conversations · Tasks.

**v0.1 acceptance criteria:** paste/import a thread (`.txt`/`.md`/`.eml`); intent, main points and
expected response with cited messages; reply drafts in the user's confirmed style; edit/save/copy
drafts; save sender as contact; retrieve conversations; ask “what did I discuss with X?” with cited
answers or “no record”; propose commitments/tasks that need approval; never invent commitments;
no send capability; other users cannot see or change my data.

**Not in v0.1:** daily briefing (M6), Gmail/Calendar (M7), meetings, Slack/Discord, voice, desktop,
networking, billing, any sending of messages.

**Product decisions (locked/approved):** local-first development; provider-agnostic AI; manual
import first; private workspace per user (no shared workspaces in MVP); invite-only sign-up issued
only by a platform operator; passwordless email login (magic link); the AI drafts and proposes,
the user approves everything that becomes a fact or leaves the system.

**Brand:** identity system v1.0 **approved by the owner** (name ConvoPilot) — "The Highlighted Quote" — `docs/BRAND.md`, tokens in
`docs/brand/`, vector logos in `public/brand/` (built by `scripts/brand/build_logo.py`), visual
animated brand bible page (claude.ai artifact, owner-private; source `docs/brand/brand-bible/`).
Ink `#0E1B2C`, Marker `#FFD23F`, Paper `#F3F5F7`; Newsreader / Instrument Sans / IBM Plex Mono.
Applied to the app (theme in `src/app/globals.css`, fonts via `next/font`, animated product demo
`src/app/product-demo.tsx`; motion respects reduced-motion and can be paused).

## 3. Architecture (detail: `docs/ARCHITECTURE.md`)

- **Modular monolith:** one Next.js 16 App Router app (React 19, TypeScript strict, Tailwind v4),
  one Supabase Postgres database, one AI orchestrator. No microservices, no multi-agent system.
- **Layers:** UI (no business logic) → Server Actions / Route Handlers (Zod-validated) →
  application services (`src/lib/services`) → deterministic policy layer → repositories using the
  **user-session Supabase client** (RLS always applies).
- **Next.js 16 rules (from installed docs):** `proxy.ts` (not middleware) only refreshes cookies
  and redirects — never an authorization boundary; every Server Action and protected render checks
  auth itself; session reads only inside `<Suspense>` (Cache Components); no caching of private
  data; `next typegen` before `tsc`.
- **Service-role key:** never in the Next.js app or `src/`; only a future isolated privileged
  runner (permanent deletion, Auth Admin). CI fails if `src/` references it.
- **Environments:** local Supabase (Docker) for development and CI; hosted Supabase **dev** project
  for manual testing; separate hosted **production** project; Next.js on Vercel.

## 4. Database (detail: `docs/DATABASE.md`)

- Tenant boundary = **workspace**; every user-owned row has `workspace_id`; RLS on every `public`
  table; composite workspace-scoped foreign keys; `workspace_id` immutable.
- Private schema `app_private` (never exposed to the API): invitations, platform operators,
  waitlist entries, helper and trigger functions. API exposes only `public`.
- Fail-closed privileges: new functions/tables/sequences get no API access unless granted.
  Every function: owner `postgres`, `search_path = ''`, explicit EXECUTE grants only.
- **Invitations:** operator-only, 256-bit tokens stored only as SHA-256 hashes, email-bound,
  single-use, expiring, revocable, typed results (`created`, `already_invited`, `not_authorized`…).
- **Sign-up:** the raw invitation token must be sent in sign-up metadata; the Auth hook and a
  `BEFORE INSERT` trigger verify and consume it atomically; provisioning creates profile,
  workspace, settings and owner membership in the same transaction; token stripped from
  `auth.users` and `auth.identities`; password hashes removed and password writes blocked.
- **Memory model (for later milestones):** `status` (proposed/confirmed/rejected/superseded) vs
  `origin` (user_stated/extracted/inferred) vs `evidence_state`; AI proposals only become facts via
  explicit user decisions (`decide_proposal`); citations with real foreign keys.
- **Audit:** append-only `audit_events`; written only by triggers/definer functions; actor forced to
  `auth.uid()`; no content in audit metadata.
- **Deletion:** soft delete (immediately invisible) → permanent deletion after retention (pending
  decision) by the privileged runner; account-deletion request cuts data access immediately.

## 5. Security (detail: `docs/SECURITY.md`)

Three independent layers: (1) application auth checks in every Server Action/protected render,
(2) deterministic policy layer, (3) database RLS + grants. Assume users can call the Supabase API
directly, so every important rule is enforced in the database. Other rules: imported content is
untrusted data (never instructions), rendered as plain text, no remote images; no secrets or
message content in logs; Gitleaks + service-role guard in CI; HttpOnly session cookies; security
headers; links/tokens never in server-visible URLs where avoidable.

## 6. AI design (detail: `docs/AGENT_DESIGN.md`) — core built in M2 (`src/lib/ai/`)

One orchestrator. Deterministic workflows for predictable tasks (analyse thread, draft reply,
extract commitments, propose memories); a bounded read-only tool loop (max 4 rounds) only for
“ask history”. Tool call → Zod args → per-workflow allow-list + policy check → service →
repository. Read/Propose/Execute permissions; **no Execute tools in v0.1**. Structured outputs
validated with Zod; citations validated against stored sources; versioned prompts; token/cost
limits; model metadata on derived records. AI code can never call decision functions.
CI guard `scripts/ci/ai-guards.sh`: decision RPCs only in `src/lib/services/proposals/decide.ts`;
vendor AI SDKs only in `src/lib/ai/providers/`; the scripted test provider never in `src/`.
**Owner decisions (2026-11-17):** P3 = Anthropic; P4 = official SDK `@anthropic-ai/sdk` (pinned
1.4.0, only in `src/lib/ai/providers/anthropic.ts`); P5 = yes, hosted processing of conversations the
user chooses, behind a per-user opt-in (`workspace_settings.ai_hosted_processing_opt_in`); daily
AI cap $1 per workspace (`AI_DAILY_COST_CAP_USD`, ledger `ai_usage_daily`). Model `claude-opus-5-5`
(configurable via `AI_MODEL`), server-side refusal fallback on. Import limits: 200k characters,
50 messages, 50k per message, 750 KB files. E2E tests use a local mock of the Anthropic API.

## 7. Testing and CI (detail: `docs/EVALUATION.md`)

- Unit (Vitest), database (pgTAP via `supabase test db`), Auth integration against the real local
  stack, browser end-to-end (Playwright), model evaluation on synthetic data (later).
- CI jobs: **quality** (lint, service-role guard, typegen, typecheck, unit, build), **database**
  (local Supabase, pgTAP with minimum-count gate, integration with minimum-count gate, end-to-end),
  **secret scan** (Gitleaks, full history).
- Test data is synthetic only; never commit real emails or messages.

## 8. Scale plan (plain language)

| Stage | Users | What it needs |
| --- | --- | --- |
| Early access | ~1,000 invited | Current design on Vercel + Supabase paid starter tiers; custom email sending domain |
| Growth | up to ~100,000 (1 lakh) | Same architecture + larger Supabase compute, connection pooling, background job queue for AI work, per-user AI cost limits, monitoring/alerting, asymmetric JWT signing keys |

Already in place for growth: stateless web servers, per-workspace isolation with RLS, no
in-memory sessions, no private-data caching, provider-agnostic AI. Biggest risks at scale: **AI
cost** and **email deliverability**, not the database.

## 9. Roadmap and status

| Milestone | Scope | Status |
| --- | --- | --- |
| M1.1 | Baseline verification | ✅ |
| M1.2 | Tooling, tests, CI, secret scanning | ✅ `2bfb522` |
| M1.3 | Database foundation, invite-only passwordless sign-up, RLS, hardening | ✅ `f4168e2` (CI green) |
| **M1.4** | Login experience + protected app shell | ✅ built and tested locally (§10) |
| **W1** | Public landing page + waitlist | ✅ built and tested locally (§11); goes live in H1 |
| M1.5 | Operator console: review waitlist, invite in batches, revoke | ✅ built and tested locally (`/app/operator`) |
| H1 | Hosted setup: Supabase dev/prod, Vercel, email domain, go-live of landing page | 🟡 Started — checklist `docs/operations/GO_LIVE.md` (stage A: waitlist on `*.vercel.app`; stage B: domain + Resend) |
| M2 | AI core: provider interface, structured outputs, citations, budgets, tool registry + policy, bounded loop, injection harness | ✅ built and tested (`src/lib/ai/`; test provider only) |
| M3 | Communication Studio: import (paste/.txt/.md/.eml), cited analysis, drafts in your style, edit/save/copy/delete | ✅ built and tested (mock AI in tests; real key needed to use) |
| M4–M5 | Contacts/Conversations & "what did I discuss with X?", Commitments/Tasks | ⬜ |
| — | v0.1 acceptance → early access for ~1,000 users | ⬜ |
| M6–M8 | Briefing, Gmail/Calendar, production hardening & scale | ⬜ |

## 10. M1.4 — login experience and protected shell

**Design (verified in Stage 0a experiments):**

- No browser Supabase client; all auth in Server Actions/Server Components; **HttpOnly** session
  cookies enforced by our cookie wrapper (`sameSite=lax`, `path=/`, `secure` in production, 30-day
  lifetime).
- Email links are custom templates pointing to `{{ .SiteURL }}/auth/confirm#th={{ .TokenHash }}` —
  the token is in the URL fragment (never sent to servers). Link scanners that GET the page cannot
  use it; only pressing **Continue** (a POST) signs in. `verifyOtp({ type: 'email' })` works for new
  and returning users and across devices.
- Invitation links: `/invite#t=<token>`; the page removes the token from the address bar
  immediately and sends it only in the POST that requests the sign-up email.
- `getRequestContext()` = one authoritative `auth.getUser()` per request (detects revoked
  sessions) + membership via RLS; used by every protected page and Server Action.
- `proxy.ts` refreshes cookies (`getSession()`, never trusted for identity) and redirects.
- One generic message for used/expired/invalid links; identical response for known and unknown
  emails on the login page.

**Routes:** `/` (landing + waitlist) · `/privacy` · `/login` · `/invite` · `/auth/check-email` ·
`/auth/confirm` · `/app` (Dashboard) and `/app/{studio,contacts,conversations,tasks,settings}` ·
`/app/account-unavailable` · `/app/operator` (platform operators only).

**Engineering defaults (owner may override):** login links expire after 30 minutes; access tokens
15 minutes; signed-in for 30 days; Playwright 1.63.0 for browser tests; plain Tailwind UI until M3;
magic links only (no 6-digit codes yet).

**Verified facts (local GoTrue v2.197.0):** default Supabase email links are consumed by any GET
(hence custom templates); used/expired/unknown links all return `otp_expired`; revoked sessions
are rejected by `getUser()` but PostgREST accepts the old access token until it expires (hence 15
minute access tokens); the public Auth API reveals whether an email has an account (accepted
residual risk); provisioning failures used to leak raw database errors (fixed: generic error);
local stack does not enforce email rate limits (must be checked on hosted dev).

## 11. W1 — public landing page and waitlist (separate from product sign-up)

- **Waitlist = public interest list.** Anyone can request early access; it never creates an account.
- **Product sign-up = invite-only.** The operator picks people from the waitlist in the operator
  console (`/app/operator`, M1.5) and sends each person their invitation link.
- Landing page at `/`: what ConvoPilot does, how it works, trust/privacy principles, waitlist form,
  FAQ. `/privacy`: plain-language privacy notice (**draft — needs owner/legal review**).
- Form fields: name, work email, role, company size, biggest communication challenge (optional),
  consent checkbox. Stored in `app_private.waitlist_entries` through `public.join_waitlist`
  (validated, same response for new/duplicate emails, global flood limit, hidden bot-trap field).
- Later (needs owner accounts): bot challenge (e.g. Cloudflare Turnstile), confirmation email via
  a sending service, analytics with consent.

## 12. Operating the waitlist and distribution (owner playbook)

1. Go live: deploy the landing page (H1) on your domain; share the link.
2. Promote: founder communities, LinkedIn/X posts, your network, newsletters; one clear message:
   “AI chief of staff that turns your conversations into follow-ups — request early access”.
3. Review weekly: look at who joined and why (role, challenge); pick a batch (start with 20–50).
4. Invite: in the operator console (`/app/operator`) tick the people to invite and press
   **Invite selected**; copy each person's private link (shown once) and send it to them. Decline
   or restore entries and revoke unused invitations there too. One-time setup: the owner becomes
   the first operator with `docs/operations/bootstrap-operator.sql`. (The SQL scripts
   `review-waitlist.sql` / `invite-from-waitlist.sql` remain as a fallback.) Use `?ref=<channel>` links (e.g. `/?ref=linkedin`) to see
   which channel brings people.
5. Learn: short feedback form or call after one week of use; track activation (signed in, pasted a
   conversation, saved a draft).
6. Grow in waves: 50 → 200 → 1,000, fixing problems between waves; watch email limits and AI cost.

## 13. Open owner decisions

Domain for the name ConvoPilot (`convopilot.com` and `.ai` are already registered by others — check trademark) · Vercel and Supabase accounts (dev + prod) · email-sending service
and domain · privacy/legal review of `/privacy` · countries of users (privacy law) · brand
assets · retention periods for deleted data · invitation lifetime (default 7 days) · whether to
add 6-digit codes later.

## 14. Commands

```bash
npm ci
npm run lint && npx next typegen && npx tsc --noEmit && npm test && npm run build
npm run db:start                         # local Supabase (Docker)
npx supabase test db supabase/tests      # pgTAP
npm run test:integration                 # Auth integration (local stack)
npm run test:e2e                         # Playwright end-to-end (local stack + built app)
```
