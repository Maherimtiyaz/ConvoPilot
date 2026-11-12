# ConvoPilot — Worklog

Session-by-session report of what was worked on. Newest first.

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
