# ConvoPilot — Worklog

Session-by-session report of what was worked on. Newest first. See also `docs/AGENT_WORK_SPLIT.md` for which agent built which part.

---

## Session 3 — Phase P3 Communication Studio (Mistral/Vibe, parallel with OpenCode's P2 review)

**Scope:** FR-1 Communication Studio per `docs/PRD.md` — import, analyze, draft, edit, save. No sending.

### What was built

1. **Thread parser** (`src/lib/email/parse-thread.ts`): heuristic split on `From:` boundaries, sender/email/date extraction, quote-marker stripping, direction detection via the signed-in user's email. Documented limitation: a body line starting with `From:` splits incorrectly (acceptable for MVP manual import).
2. **Schemas** (`src/lib/schemas/communication.ts`): Zod schemas for email analysis (intent/urgency/summary/mainPoints/senderAsk/expectedResponse/confidence), import input, draft requests (tone/length), draft saves.
3. **Versioned prompts** (`src/lib/ai/prompts/`): `analyze-email@1` and `draft-reply@1`, both with explicit untrusted-data delimiting (`<untrusted_message>`) and anti-injection system rules; draft prompt enforces grounding ("never invent facts") and bans corporate filler.
4. **Orchestrator** (`src/lib/ai/orchestrator/communication.ts`): `analyzeEmail` — JSON-mode call, Zod-validated, one retry on invalid output, then typed `ai_provider_error`; `generateReply` — tone/length controls, contact context, style profile hook. Model metadata (provider/model/prompt version) returned for persistence.
5. **Repositories** (`src/lib/database/repositories/index.ts`): the only Supabase table access layer — contacts, conversations, messages, classifications, drafts; every query workspace-scoped.
6. **API routes** (all `requireUserApi` + Zod validation + error envelopes): `POST /api/conversations` (import thread, optional contact save with dedupe by email), `POST /api/conversations/[id]/analyze` (persist classification), `POST /api/conversations/[id]/drafts` (generate + persist draft with contact context), `PATCH /api/drafts/[id]` (edit/save).
7. **Studio UI** (`src/components/email/studio-workspace.tsx`): full flow — paste thread → import & analyze → analysis panel (intent, urgency badge, main points, sender ask, confidence) → reply controls (intended outcome, tone, length) → editable draft with save + copy-to-clipboard → start over. Loading/error/success states throughout.
8. **Tests**: 17 new unit tests (33 total) — thread parsing (splitting, direction, dates, quote stripping, fallbacks), orchestrator (validated happy path, non-JSON retry-then-fail, schema-invalid intent rejection, empty draft failure), and untrusted-input delimiting + grounding instructions in both prompts.

### Checks run

- `npm test` — 33/33 pass.
- `npx tsc --noEmit` — pass. `npm run lint` — pass. `npm run build` — pass.

### Known limitations

- End-to-end flow needs a live Supabase + a real AI provider key; unit-tested with FakeProvider until then.
- Thread parser is heuristic (see above).
- Analysis is stored per first inbound message; per-message classifications deferred.

### Next

- OpenCode: P2 review + live auth verification (prompt in `docs/OPENCODE_PROMPTS.md`).
- P4 (tasks & commitments + approval queue) is the next implementation milestone.

---

## Session 2 — Phase P2 Foundation (Mistral/Vibe, in parallel with OpenCode's P1 run)

**Scope:** Implement the P2 foundation while the owner runs OpenCode on Prompt 1. Per `docs/AGENT_WORK_SPLIT.md`, OpenCode should review this work and fill gaps rather than rebuild.

### What was built

1. **Dependencies added:** `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `clsx`, `tailwind-merge`; dev: `vitest`, `@types/node` bumped to ^22 (vitest 5 peer requirement; runtime Node is v22).
2. **Database migration** (`supabase/migrations/0001_initial_schema.sql`): all 15 v0.1 tables from `docs/DATABASE.md` — workspaces, users, companies, contacts, relationship_notes, conversations, messages, message_sources, drafts, classifications, commitments, tasks, memories, embeddings (pgvector + HNSW), audit_logs. Includes: `current_workspace_id()` security-definer helper, signup trigger auto-provisioning workspace + user row, `updated_at` triggers, indexes, and RLS enabled with workspace-scoped policies on every table.
3. **Environment validation** (`src/lib/validation/env.ts`): Zod-parsed server env; returns null when unconfigured so pages render a setup notice; `requireServerEnv()` throws a typed error where config is mandatory.
4. **Typed error handling** (`src/lib/errors.ts`): `AppError`, error codes → HTTP status mapping, Zod issue details, redaction of internals (unknown errors never leak their message to clients), `withErrorHandling()` wrapper for route handlers.
5. **Supabase clients** (`src/lib/database/`): cookie-bound server client, browser client, and a service-role admin client (bypasses RLS, server-only).
6. **Auth** (`src/lib/auth.ts`, `src/proxy.ts`, `src/app/(auth)/`): session helpers (`requireUser` for pages, `requireUserApi` for routes returning 401), Next 16 `proxy.ts` route guard (middleware was renamed to proxy in Next 16), login/signup pages with server actions + Zod validation, signout and OAuth-callback routes. Workspace auto-provisioned on signup via DB trigger.
7. **AI provider abstraction** (`src/lib/ai/providers/`): `ChatProvider` interface (complete/stream/embed), `OpenAICompatibleProvider` (fetch-based, works with any compatible endpoint, streaming SSE, timeouts, retryable-error classification, no request bodies logged), deterministic `FakeProvider` for tests/local dev, env-driven `resolveProvider()`. Anthropic/Gemini/Ollama adapters deliberately deferred until a key exists — they currently fall back to FakeProvider so the app runs.
8. **UI foundation** (`src/components/ui/`, `src/components/layout/`): Button, Card, Input/Label, Badge, EmptyState, `cn()` util, sidebar navigation, app shell layout with user footer + signout, SetupNotice for unconfigured Supabase.
9. **Five MVP screens** under `src/app/(app)/`: Dashboard (summary cards + briefing placeholder), Communication Studio, Contacts, Conversations, Tasks, plus a Settings shell showing account and AI-provider status. All with empty states; data wiring comes in P3+.
10. **Error boundaries:** `src/app/error.tsx`, `not-found.tsx`; root page redirects to `/dashboard`.
11. **Vitest setup** (`vitest.config.ts`, `@` alias) + **16 unit tests** (`tests/unit/`): env parsing/failure modes, error envelope mapping incl. internal-redaction, provider resolution rules, FakeProvider scripted/streaming/embedding behavior.

### Checks run

- `npm test` — 16/16 pass.
- `npx tsc --noEmit` — pass.
- `npm run lint` — pass.
- `npm run build` — pass (all routes compiled; proxy registered).

### Known limitations (honest report)

- Auth flow is implemented but **not exercised against a live Supabase project** — requires the owner's Supabase URL/keys in `.env.local` and running migration `0001`. Until then every protected page shows the setup notice.
- Anthropic/Gemini/Ollama adapters are placeholders behind the abstraction (fall back to FakeProvider); implement when a key is available.
- No integration tests against a real Postgres yet (needs a database in CI or local Supabase).

### Next steps

1. Owner: create Supabase project → run migration → fill `.env.local` → verify signup/login end to end.
2. OpenCode: review P2 per the ledger note; report gaps.
3. P3 (Communication Studio) is the next implementation milestone.

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
