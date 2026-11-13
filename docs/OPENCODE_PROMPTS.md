# ConvoPilot — OpenCode Prompt Checklist

Running log of every prompt given to the coding agent (OpenCode), in order, with status. Give prompts one at a time, in small milestones — never one giant "build everything" instruction. After each prompt: verify lint + typecheck + tests, update the status here, and add a session report to `docs/WORKLOG.md`.

## Standing rules for every prompt

- Reference `AGENTS.md` and the relevant `docs/` file.
- One milestone per prompt; inspect → plan → implement → test → report.
- Require: run `npm run lint`, `npx tsc --noEmit`, and the test suite; report what works and what doesn't.
- Forbid: new dependencies without justification, fake integrations, TODO stubs presented as done, destructive migrations without approval.

## Prompt queue

| # | Prompt | Purpose | Status |
| --- | --- | --- | --- |
| P0 | Scaffold: `npx create-next-app@latest convopilot --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`, `git init` | Project bootstrap | ✅ Done |
| P1 | Architecture & planning: create `docs/PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `AGENT_DESIGN.md`, `SECURITY.md`, `EVALUATION.md`; recommend what to postpone; wait for approval before coding | Planning | ✅ Done (2025 session, awaiting owner review) |
| P2 | Phase 1 — Foundation: Supabase integration, env config, auth, workspace schema + first migration, dashboard layout + navigation, provider abstraction, error handling, Vitest setup, base UI components | Foundation | ✅ Done by Mistral (Vibe) in parallel — see `docs/AGENT_WORK_SPLIT.md`. OpenCode: `git pull`, review, fill gaps only |
| P3 | Phase 2 — Communication Studio: paste/import thread, structured intent analysis, reply generation with tone/length, draft persistence + revisions, copy-to-clipboard, save conversation + contact, tests for intent/factual grounding | Communication intelligence | ✅ Done by Mistral (Vibe) — stacked PR; OpenCode: review |
| P4 | Phase 3 — Contacts & relationship memory: contact CRUD, conversation association, timelines, source-linked memory extraction, pgvector semantic search, Q&A over history with citations, retrieval/memory tests | Relationship memory | ⬜ Not started |
| P5 | Phase 4 — Tasks & commitments: task dashboard, follow-up queue, proposed-commitment approval flow, due dates, overdue indicators, daily summary, two-way commitment view | Follow-up intelligence | ⬜ Not started |
| P6 | Phase 5 — Daily briefing + dashboard intelligence: briefing generation from stored data, dashboard counts and recommendations | Proactive intelligence | ⬜ Not started |
| P7 | Phase 6 — Gmail integration (separate module): OAuth, minimal scopes, thread import, sync, contact matching, dedupe, draft creation read-only-first, audit logging; test account only | Integration | ⬜ Not started |
| P8 | Phase 7 — Evaluation & hardening: run EVALUATION.md datasets, injection suite, latency/cost tracking, deployment prep | Reliability | ⬜ Not started |

## Prompt templates

Keep the full text of each prompt in `docs/WORKLOG.md` (or paste it into OpenCode from the sections below as we go).

### NEXT PROMPT FOR OPENCODE — P2 review + live auth verification (run now)

> The P2 foundation was implemented by a parallel agent and is on branch `vibe/foundation-p2-5bccb6` (PR #1). Do NOT rebuild it.
>
> 1. `git pull origin vibe/foundation-p2-5bccb6` and read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, and `docs/AGENT_WORK_SPLIT.md`.
> 2. Review the existing implementation against the docs: `supabase/migrations/0001_initial_schema.sql`, `src/lib/` (auth, database, errors, ai/providers, validation), `src/proxy.ts`, `src/app/(app)/`, `src/app/(auth)/`.
> 3. Create a Supabase project (or use Supabase CLI locally), apply migration `0001`, fill `.env.local` from `.env.example`.
> 4. Verify end to end: signup creates a workspace + user row, login works, protected routes redirect, signout works, RLS denies cross-workspace access.
> 5. Fill gaps you find with minimal edits — list every discrepancy instead of rewriting files.
> 6. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Report what works, what fails, and what remains. Do not implement P3/P4 features.

### P2 — Build the foundation (use when P1 is approved)

> **Note:** the foundation was already implemented by Mistral (Vibe) — see `docs/AGENT_WORK_SPLIT.md`. Do not rebuild it. `git pull`, review the existing implementation against the docs, and report gaps or improvements instead of recreating files.
>
> (Original prompt kept for reference.) Implement Phase 1 of ConvoPilot following the approved docs. Configure Supabase integration and environment variables (.env.example), implement authentication, create the initial database migration per docs/DATABASE.md (workspaces, users, contacts, conversations, messages, drafts, tasks, commitments, memories, embeddings, audit_logs — all workspace-scoped with RLS), build the dashboard layout with navigation for the five MVP screens, implement the AI provider abstraction per docs/ARCHITECTURE.md §3, configure typed error handling, and set up Vitest with base unit tests. Do not implement Gmail, calendar, or complex agent workflows yet. Finish by running lint, typecheck, and tests; report what works and what remains.

### P3 — Communication Studio (reference — implemented by Mistral in parallel; review, don't rebuild)

> Implement Phase 2 per docs/PRD.md FR-1 and docs/AGENT_DESIGN.md: paste/import an email or thread, structured analysis (intent, main points, expected response, urgency) with Zod-validated output, context-aware reply generation with tone/length controls, draft persistence with revisions, copy-to-clipboard, and saving the conversation + sender as a contact. Version the prompts, keep the provider abstraction, treat message content as untrusted data, add tests for intent classification, factual grounding, and injection resistance. No sending. Run lint, typecheck, tests; report honestly.
