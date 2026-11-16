# ConvoPilot — Architecture

Version: 0.4 · Status: Specification for review (M1.2 accepted; M1.3 correction pass applied) · Last revised: 2026-11-16

Status labels used in this document:

- **Required** — part of the specification; implementation must follow it.
- **Recommended (pending approval)** — engineering recommendation; not final until the owner approves it.
- **Pending decision** — open; see §11.

Framework claims in this document are taken from the documentation bundled with the installed package (`node_modules/next/dist/docs/`, Next.js 16.4.6). When the installed version changes, those claims must be re-checked.

## 1. Overview

ConvoPilot v0.1 is a **modular monolith**: one Next.js application with modular server-side code in the same codebase, one Postgres database (Supabase) and one AI orchestrator with a controlled tool registry. No microservices, no multi-agent system, no background worker infrastructure until a feature needs it.

```
Browser (Dashboard / Communication Studio / Contacts / Conversations / Tasks / Settings shell)
   │
   ▼
proxy.ts ── optimistic cookie check → redirect to /login only (NOT an authorization boundary)
   │
   ▼
Next.js App Router (src/app)
   ├── Server Components (render; read via services)
   ├── Server Actions + Route Handlers (entry points; Zod-validate input; call services)
   │
   ▼
Application services / use cases (src/lib/services)
   │  every call carries an authenticated RequestContext {userId, workspaceId, role}
   ├── auth/       session → RequestContext; membership verification
   ├── policy/     deterministic allow / deny / requires_approval decisions
   ├── audit/      append-only audit event writer
   ├── ai/         orchestrator, tool registry, prompts, output schemas, provider adapters
   ├── retrieval/  keyword (+ later vector) search, workspace-filtered
   └── db/         repositories over a Supabase client bound to the user's session
   │
   ▼
Supabase Postgres (RLS on every workspace table) + pgvector (later)

Service-role key: used only by the isolated privileged runner (permanent deletion,
Auth user deletion, retention). Not present in the Next.js runtime; never on a request path.
```

## 2. Module responsibilities

| Layer | Location (planned) | Responsibility | Must not |
| --- | --- | --- | --- |
| App routes & UI | `src/app`, `src/components` | Render pages, collect input, show loading/error/empty/success states, call Server Actions | Contain business rules, call repositories or providers directly, import `process.env` secrets |
| Entry points | Server Actions, Route Handlers | Parse + Zod-validate input, resolve `RequestContext`, call one service, map typed errors to responses | Trust page-level auth checks; skip their own auth check |
| Application services | `src/lib/services` | Use cases (`importConversation`, `analyzeThread`, `saveDraft`, `approveProposal`, …); orchestrate policy → repository → audit | Accept a workspace id from the client without verifying membership |
| Auth | `src/lib/auth` | Read the Supabase session, verify the user, load workspace membership, build `RequestContext` | Treat a cookie's presence as proof of authorization |
| Policy | `src/lib/policy` | Pure deterministic function `decide(context, action, resource) → allow \| deny \| requires_approval`; no I/O beyond inputs supplied to it; no LLM | Delegate any decision to model output |
| Repositories | `src/lib/db` | Typed queries; always scope by `workspace_id`; use the request-scoped user-session client | Use the service-role client; build SQL from model output |
| AI orchestration | `src/lib/ai/orchestrator` | Run fixed workflows and the bounded Q&A loop; call tools through the registry | Hold a database client; call repositories directly |
| AI tools | `src/lib/ai/tools` | Thin adapters: Zod-validate args → policy check → call a service | Bypass services or policy |
| Provider adapters | `src/lib/ai/providers` | Translate the internal provider interface to a vendor SDK/API | Leak vendor types into services |
| Retrieval | `src/lib/retrieval` | Keyword search (Postgres full-text) in v0.1; vector search later; always workspace-filtered | Return records from other workspaces |
| Audit | DB triggers + definer functions; `src/lib/audit` wraps `public.log_event` | Data-change events by triggers; non-data events through `log_event` with the user's JWT (actor forced to `auth.uid()`) (`DATABASE.md` §10.1) | Use the service-role key; accept actor ids from the client; log content or secrets |

Rule: a new module is introduced only when it has a real responsibility. Business logic is never embedded in UI components.

## 3. Next.js 16 conventions (from installed docs)

### 3.1 Proxy (formerly Middleware)

- Next.js 16 deprecates the `middleware` file convention and renames it to **`proxy.ts`** with an exported `proxy` function (`upgrading/version-16.md`). Proxy runs on the Node.js runtime.
- The bundled authentication guide recommends Proxy only for **optimistic checks**: read the session cookie and redirect, avoiding database checks because Proxy runs on every route, including prefetches (`guides/authentication.md`).
- **Required:** `proxy.ts` only redirects unauthenticated visitors away from protected routes and authenticated users away from `/login`. It is **never** the authorization boundary. All real checks happen in the data access layer (§4).

### 3.2 Server Actions and Route Handlers

- The bundled data-security guide states Server Actions are reachable by direct POST requests, not only through the UI, and that a page-level auth check does not extend to actions defined in that page (`guides/data-security.md`).
- **Required:** every protected Server Action and Route Handler independently (1) resolves and verifies the session, (2) verifies workspace membership, (3) validates input with Zod, (4) passes a `RequestContext` to a service, which runs the policy check.
- Server Actions compare the `Origin` header with the host and reject mismatches (built-in CSRF mitigation per the same guide). Route Handlers do not get this automatically. **Required:** state-changing Route Handlers must check `Origin` or be replaced by Server Actions. Prefer Server Actions for UI mutations; reserve Route Handlers for streaming responses and file upload where needed.
- Modules containing secrets or data access import `server-only`.

### 3.3 Cache Components

The installed config enables `cacheComponents: true` and `partialPrefetching: true` (`next.config.ts`; confirmed in build output: "Cache Components enabled", "Partial Prefetching enabled").

Per `guides/authentication-with-cache-components.md`:

- Reading the session (cookies) is a request-time read and cannot be part of the prerendered static shell.
- With Cache Components, reading `cookies()` outside a `<Suspense>` boundary is a **build error**.
- Session reads must not happen at the top level of a layout, because that holds the whole segment (including `children`) behind the request. Push them into components inside a boundary.
- Routes can opt out of instant-navigation validation with `export const instant = false` while migrating.

**Required for v0.1:**

1. The app shell (navigation, layout chrome) is static. Every component that reads the session or user data sits inside a `<Suspense>` boundary with a real loading state.
2. **No caching of private user data in v0.1.** Do not use `'use cache'`, `'use cache: remote'` or `'use cache: private'` on any function that returns workspace data or reads the session. Per `directives/use-cache-private.md`, private caches are not stored on the server across requests in production, but in development they are stored in memory keyed by cookies/headers, and the client router may keep output in browser memory; these behaviours need an explicit isolation design before use.
3. A future caching design must document the cache key (must include `workspaceId` and `userId`), invalidation on membership change and deletion, and tests proving no cross-user reuse. Until then: no cache.
4. Plain `'use cache'` is allowed only for data that is identical for every user (e.g. static copy).

### 3.4 Generated types

`LayoutProps`, `PageProps` and route types are generated during `next dev`, `next build` or `next typegen` (`api-reference/03-file-conventions/layout.md`). A fresh clone fails `tsc --noEmit` until types are generated (verified 2026-11-16: `tsc` exit 2 before `npx next typegen`, exit 0 after). CI must run `next typegen` before `tsc` (§10).

## 4. Security architecture — three independent layers

Each layer must hold on its own; a bug in one must not expose data.

| # | Layer | Enforced by | Protects against |
| --- | --- | --- | --- |
| 1 | **Authentication & authorization** | `src/lib/auth` in every entry point: verified session → user → `workspace_members` row → `RequestContext` | Anonymous access; acting in a workspace the user is not a member of |
| 2 | **Deterministic policy** | `src/lib/policy` in every service and every AI tool call | Actions exceeding role or permission level; AI tool calls outside the workflow allow-list; approval bypass; execute-level actions (none exist in v0.1) |
| 3 | **Database RLS** | Postgres policies on every workspace-scoped table, evaluated against the user's JWT | Application bugs that omit a filter or use a wrong id |

How they combine on a request:

1. Proxy optionally redirects (not a security layer).
2. Entry point verifies the session and membership (layer 1); failure → 401/redirect, or 404 for resources in other workspaces (no existence leak).
3. Service asks policy (layer 2); `deny` → typed error + audit event where relevant; `requires_approval` → create a proposal, never perform the action.
4. Repository runs the query with the **user-session Supabase client**, so RLS (layer 3) applies even if steps 2–3 had a bug.

**Required:**

- Normal request-time queries use a Supabase client created from the user's session (anon/publishable key + user JWT). RLS is therefore always in force on request paths.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is used **only** by the isolated privileged runner (`DATABASE.md` §4.5) and is not present in the Next.js runtime. Audit writes, invitations, operator actions and account-deletion requests all run with the user's JWT through definer functions. A CI check rejects any reference to the service-role key or the Auth Admin API under `src/`.
- **Direct database API access:** the browser holds the publishable key and the user's JWT, so a user can call the Supabase API directly, skipping Next.js and the policy layer. Layer 2 therefore protects only server-mediated operations; every invariant that must hold against the user (membership, workspace immutability, proposal status rules, `decided_by`, audit, soft-delete visibility) is enforced in the database (`DATABASE.md` §4).
- The LLM never receives a database client, credentials, SQL, or table names to query. It can only request registered tools.

## 5. AI architecture

### 5.1 Provider abstraction

```ts
interface ChatProvider {
  id: string;
  generateObject<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>; // Zod-validated
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;
}
interface EmbeddingProvider {
  id: string;
  model: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
```

- Business logic imports only these interfaces. Vendor SDKs are imported only inside `src/lib/ai/providers/*`.
- Which SDK backs the adapters (Vercel AI SDK vs vendor SDK) is a **pending decision** (§11, D4).
- Provider configuration is server-side only (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_EMBEDDING_MODEL`) and validated by a Zod env loader at startup.
- Embeddings are a separate capability; a chat provider is not required to support them.

### 5.2 Orchestrator: workflows first

- **Required:** predictable tasks run as **deterministic application workflows** (fixed steps in code). The model fills structured outputs; it does not decide which steps happen.
  - `analyzeThread`: validate → store raw → retrieve contact context → model call (`EmailAnalysisSchema`) → store analysis.
  - `draftReply`: load thread + approved context → model call (`DraftReplySchema`) → store draft (`status=draft`).
  - `extractCommitments`: model call (`CommitmentProposalSchema[]`) → citation validation → store `status=proposed`.
- **Bounded tool loop** only for open-ended Q&A ("what did I discuss with X?"): read-level tools only, maximum **4 tool rounds** and a per-request token budget; exceeding either returns a typed "incomplete" result rather than continuing.
- No multi-agent orchestration.

### 5.3 Controls required on every model interaction

1. Versioned prompt id (e.g. `analyze-email@1`) stored in `src/lib/ai/prompts/`.
2. Zod schema for the output; invalid output → one repair retry → typed failure; never persisted unvalidated.
3. Deterministic policy check before each tool execution, using the **per-workflow tool allow-list** (§5.4).
4. Citation validation (§6) before any factual answer is shown or any proposal is stored.
5. Token and cost limits: per request (max input + output tokens per workflow) and per workspace per day; limit hit → typed error, no silent truncation of evidence.
6. Model metadata stored on every derived record: provider id, model id, prompt version, token counts, created_at.
7. Timeouts and one retry for transient provider errors; provider error text is not logged verbatim (it may echo prompt content).

### 5.4 Tool permissions and allow-lists

Permission levels: **Read** (retrieve workspace data), **Propose** (create records in `proposed` state), **Execute** (external/irreversible; **no execute tools exist in v0.1** and the registry rejects them).

| Workflow | Allowed tools |
| --- | --- |
| analyzeThread | `analyze_email`, `search_contacts`, `get_contact_history` |
| draftReply | `draft_reply`, `get_contact_history`, `summarize_thread` |
| extractCommitments | `extract_commitments`, `create_task` (task must reference a commitment) |
| proposeMemories | `save_memory` |
| askHistory (bounded loop) | `search_contacts`, `get_contact_history`, `search_messages`, `summarize_thread` |

Deferred tools (`prepare_meeting`, `update_contact`) and all execute-level tools are not registered in v0.1 (`AGENT_DESIGN.md` §4).

Any tool call outside the active workflow's list is denied by policy and audit-logged, regardless of model output. Confirmation of proposals is a **user action** through a Server Action that calls `public.decide_proposal` / `public.approve_task` (`DATABASE.md` §5.3, §5.6); no tool, workflow or AI service may call these RPCs (CI grep check + agent test).

### 5.5 Relationship to `docs/AGENT_DESIGN.md`

`AGENT_DESIGN.md` v0.2 was reconciled with this document in the hardening pass: deterministic workflows, bounded Q&A loop (max 4 rounds), tool → policy → service → repository, per-workflow allow-lists, multiple citations, inferred style preferences as proposals, `prepare_meeting` and `update_contact` deferred. It is the authoritative tool-contract reference; the allow-list table above must match its §4.

## 6. Evidence and grounding

- Every AI-derived fact, commitment, analysis, draft and factual answer references one or more **citations** to stored sources (message or note) in the same workspace (schema: `DATABASE.md` §6). AI-proposed tasks inherit evidence from their required commitment (`DATABASE.md` §5.6).
- Before presenting an answer or storing a proposal, the service verifies each cited source id (a) exists, (b) belongs to the current workspace, (c) is not soft-deleted, (d) was part of the context supplied to the model in this request, and (e) if a quote is given, the quote appears in the source text. Fabricated or failing citations are dropped; if no valid citation remains, the claim is not shown as fact ("I don't have a record of that").

## 7. Error handling & observability

- Entry points return typed error envelopes `{ error: { code, message } }`. Unexpected errors are logged server-side with a request id and return a generic 500.
- Logs never contain message bodies, draft content, memory content, prompts, model outputs, tokens or secrets. Log ids and counts instead.
- Errors are never swallowed silently: they are either handled with a typed result or rethrown.
- Audit events (append-only, trusted writers only) record security-relevant actions; see `SECURITY.md` §8 and `DATABASE.md` §10.
- No third-party analytics in v0.1.

## 8. Folder structure (planned)

```
src/
  proxy.ts
  app/            (dashboard, studio, contacts, conversations, tasks, settings, login)
  components/     (ui/, feature folders)
  lib/
    auth/  policy/  audit/  services/  db/  retrieval/  validation/  env/
    ai/   (providers/, orchestrator/, prompts/, tools/, schemas/)
    integrations/gmail/   (interface only; M7)
  types/
supabase/
  migrations/
  seed.sql        (synthetic data only)
tests/            (unit/, integration/, db/, agent/, evaluation/)
docs/
```

## 9. Key architectural decisions

| # | Decision | Status |
| --- | --- | --- |
| D1 | Modular monolith in one Next.js app | Required |
| D2 | Provider abstraction; vendor SDKs only inside adapters | Required (SDK choice pending, §11) |
| D3 | Deterministic workflows + bounded Q&A tool loop; one orchestrator | Required |
| D4 | Repositories over a user-session Supabase client; RLS always active on request paths | Required |
| D5 | Raw imported events stored separately from AI-derived records (status + provenance) | Required |
| D6 | Internal calendar/tasks first; external sync later as adapters | Required |
| D7 | No job queue in v0.1; Postgres-backed jobs only when background work exists | Required |
| D8 | Three independent security layers (§4) | Required |
| D9 | No private-data caching in v0.1 | Required |
| D10 | Full-text search first; pgvector added once retrieval quality is measured | Recommended (pending approval) |

## 10. CI pipeline (implemented in M1.2: `.github/workflows/ci.yml`; first GitHub run green on 2026-11-16)

Single reproducible order (GitHub Actions, Node 22). Steps 1–6 run in the `quality` job (which also fails if the service-role key or Auth Admin API appears under `src/`); step 7 runs in a parallel `secret-scan` job; the `database` job (M1.3) runs the local Supabase stack, pgTAP (`supabase test db supabase/tests`) and the Auth/RLS integration tests; it parses the executed test counts and fails on zero or fewer than the expected minimum (83 pgTAP, 22 integration) or on any failure:

1. `npm ci`
2. `npm run lint`
3. `npx next typegen` — generates `next-env.d.ts` and route types (verified locally 2026-11-16 to make `tsc` pass on a fresh clone)
4. `npx tsc --noEmit`
5. Unit tests (`npm test` → `vitest run`)
6. `npm run build`
7. Secret scanning: Gitleaks 8.30.0 (owner-approved), pinned binary with SHA-256 verification, scans full Git history with `.gitleaks.toml` (default rules); fails on findings

Later additions: `npm audit --omit=dev` as a gate on production dependencies. The `database` job has not yet run on GitHub (added in M1.3, uncommitted).

**Dependency audit baseline (observation dated 2026-11-16, not a permanent count):** `npm audit` reported 8 moderate findings, all in the development-only chain `eslint-config-next` → `@typescript-eslint/*` → `@typescript-eslint/typescript-estree` → `minimatch` (GHSA-g3hv-75wg-m249, ReDoS-class DoS). `npm audit --omit=dev` reported 0. The suggested `npm audit fix --force` applies breaking changes and must not be run without review. Re-check on each dependency change.

**Repository hygiene (applied in M1.2):** `.gitignore` now has `!.env.example` after `.env*`, so the example file is never silently ignored; real `.env*` files remain ignored.

## 11. Pending decisions

None of these are approved. Each needs owner approval before the dependent work starts.

| Decision | Blocks | Can be deferred until |
| --- | --- | --- |
| P1 Workspace sharing | — | **Approved 2026-11-16:** private workspaces only; no shared workspaces in the MVP |
| P2 Local vs hosted Supabase | — | **Approved 2026-11-16:** hosted dev project for manual development; local Supabase (Docker) for automated tests/CI; separate production project |
| P3 First AI provider | M3 | M2 uses only the test provider |
| P4 AI SDK | M2 | Before M2 |
| P5 Hosted processing of private content | M3 (first real model call on user content) | Before M3 |
| P6 Auth & invitation policy | — | **Approved 2026-11-16:** invite-only; only a platform operator (separate from workspace roles) may invite; email magic link / OTP |
| Retention periods (soft-deleted content, account deletion, audit) and deletion-cancel policy | Privileged runner implementation | Before the runner is built (not M1.3 schema) |
| Privileged runner hosting | Privileged runner implementation | Before the runner is built |
| Invitation default TTL / maximum | M1.3 `create_invitation` | Proposed 7 days default; confirm in M1.3 |
| File-size / paste limits | M3 | Before M3 |
| Secret-scanning tool | M1.2 CI step (tool choice can be made inside M1.2 with approval) | M1.2 |
| M1/M2 split | Milestone planning | Before M1.2 approval |

M1.2 was accepted on 2026-11-16 (commit `2bfb522`, CI green). Approved M1.3 dependencies (subject to compatibility checks at install time): Supabase CLI, `@supabase/supabase-js`, `@supabase/ssr`.

### P1. Friend invitations / workspace sharing
**Approved:** private workspaces only (`DATABASE.md` §3.1).

### P2. Local vs hosted development Supabase

| Option | Advantages | Disadvantages | Security implications |
| --- | --- | --- | --- |
| Local Supabase CLI (Docker) | Free, offline, disposable, migrations tested from scratch, RLS tests in CI with the same tooling | Needs Docker locally; differences from hosted config (auth email, SMTP) | No real data leaves the machine; no hosted keys to leak |
| Hosted dev project | No Docker; real auth emails; closer to production | Shared state drifts from migrations; network dependency; keys must be managed | Hosted keys exist and must be protected; risk of real data entering dev |

**Approved (2026-11-16):** hosted development project for manual development, local Supabase (Docker) for automated tests and CI, separate production project.

### P3. First production AI provider

| Option | Advantages | Disadvantages | Security implications |
| --- | --- | --- | --- |
| Hosted frontier model (e.g. Anthropic, OpenAI, Google) | Best quality on analysis, drafting, structured output | Cost; private content leaves the system | Depends on provider retention/training terms (see P5) |
| OpenAI-compatible endpoint (any vendor) | One adapter covers many vendors | Feature differences (structured output support varies) | Same as above, per vendor |
| Local model (Ollama) | Private content never leaves the machine; no per-call cost | Lower quality; weaker structured output; hardware-dependent; not viable for hosted deployment | Strongest privacy |

**Recommended default:** build the adapter interface plus a deterministic **test provider** (for tests only, never presented as a product integration) in M1/M2; choose the first real provider before Communication Studio work, after P5 is decided. Approval required.

### P4. Vercel AI SDK vs provider-specific SDK

| Option | Advantages | Disadvantages | Security implications |
| --- | --- | --- | --- |
| Vercel AI SDK (`ai` + provider packages) behind internal interface | Unified structured output (Zod), streaming and tool calling across providers; already allowed by AGENTS.md | Extra dependency layer; abstraction may lag vendor features | Larger dependency surface; still no keys client-side if used server-only |
| Provider-specific SDK behind internal interface | Full vendor feature access; fewer layers | Each new provider needs its own adapter (structured output, streaming) | Smaller surface per provider |
| Raw HTTP | No dependency | Most code to maintain and test | Highest risk of subtle bugs |

**Recommended default:** Vercel AI SDK used **only inside** `src/lib/ai/providers`, so it can be replaced. Approval required.

### P5. Sending private communication content to a hosted AI provider

| Option | Advantages | Disadvantages | Security implications |
| --- | --- | --- | --- |
| Allowed, with documented provider terms and user-visible disclosure | Best quality | Third-party processing of private email | Must confirm no-training / retention terms; content of third parties (email senders) is also shared |
| Allowed per workspace via explicit opt-in setting | User control | More UI/config | Default-off reduces accidental disclosure |
| Not allowed (local models only) | Maximum privacy | Quality and hosted deployment limits | Strongest |

**Recommended default:** per-workspace opt-in, off by default, with the provider name shown at the point of analysis; the owner's own workspace can opt in. Approval required.

### P6. Authentication and invitation policy

| Option | Advantages | Disadvantages | Security implications |
| --- | --- | --- | --- |
| Open email sign-up | Simple | Anyone can create accounts and consume AI budget | Abuse and cost risk |
| Invite-only: public sign-up disabled; owner issues invites | Matches "primary user + invited friends"; controls cost | Invite flow to build | Smallest attack surface |
| Magic link vs password vs OAuth (Google) | Magic link: no passwords stored by app; OAuth: convenient | Magic link depends on email delivery; OAuth adds provider config | Magic link/OAuth avoid password reuse risk |

**Approved (2026-11-16):** invite-only; only a platform operator may invite (platform permission separate from workspace roles); email magic link / OTP. Mechanism in `DATABASE.md` §3.4–§3.6; Supabase hook support must be validated on the local stack.

## 12. Testing strategy

See `EVALUATION.md`. Summary: unit (Vitest) for schemas, policy and citation validation; integration for services with the test provider; database/RLS tests against local Supabase; agent tests for allow-lists and injection; model evaluation on synthetic datasets outside CI; Playwright E2E once the UI stabilizes.

## 13. Milestones

| Milestone | Scope | Status |
| --- | --- | --- |
| M1.1 | Baseline verification | ✅ Verified 2026-11-16 |
| M1.2 | Tooling & quality gates: Vitest, Zod, env loader (server-only), `test`/`typecheck` scripts, CI pipeline (§10), `.gitignore` exception | ✅ Accepted 2026-11-16 (commit `2bfb522`, GitHub CI green) |
| M1.3 | Database foundation and Supabase Auth integration: local Supabase stack + CI database tests, migrations for foundation tables, `app_private` schema, function grants, RLS, operator + invitation model, invite-only sign-up gate and provisioning, `log_event`, account-deletion request function and lifecycle design, Supabase env section, session-bound server client (`@supabase/ssr`) | 🟡 Stage 0 passed; Stage 1 implemented and verified locally 2026-11-16 (uncommitted; GitHub `database` job not yet run) |
| M1.4 | Login UI (magic link / OTP), `proxy.ts`, protected application shell, frontend session experience | Not started |
| M2 | AI core: provider interface (P4), test provider, structured output helper, policy layer, tool registry, injection harness | Not started |
| M3 | Communication Studio | Not started |
| M4 | Contacts, Conversations, keyword retrieval, cited Q&A | Not started |
| M5 | Commitments & Tasks with approval queue | Not started |
| — | **v0.1 acceptance** (`PRD.md` §5) | — |
| M6 | Daily briefing | Post-v0.1 |
| M7 | Gmail/Calendar, read-only first | Post-v0.1 |
| M8 | Evaluation run, hardening, export/deletion, deployment | Not started |

Splitting the original Phase 1 into M1.x and M2 is **Recommended (pending approval)**. Each milestone ends with lint, typegen, typecheck, tests and build green and docs updated.
