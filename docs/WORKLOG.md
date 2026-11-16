# ConvoPilot — Worklog

Session-by-session report of what was worked on. Newest first.

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
