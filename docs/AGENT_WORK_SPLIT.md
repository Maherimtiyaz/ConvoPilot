# ConvoPilot — Agent Work Split Ledger

Detailed record of **which part was built by which agent**. Two coding agents work on this project, in parallel but on separate milestones to avoid conflicts:

| Agent | Role | Works on |
| --- | --- | --- |
| **OpenCode** (user-driven) | Implementation milestones, one prompt at a time | Follows `docs/OPENCODE_PROMPTS.md` queue (P0–P8) |
| **Mistral (Vibe Code)** | Parallel phase delivery, docs, review, PRs | Next phase while OpenCode runs; process docs; verification |

Rule: before starting a milestone, check this ledger and `docs/OPENCODE_PROMPTS.md` so two agents never edit the same files in the same milestone. Every entry below is dated and lists the exact files touched.

---

## Milestone 0 — Project bootstrap — ✅ Mistral (Vibe Code)

Completed: 2025 session · Commit: `fbadcfc` · Pushed directly to `main` (repo was empty)

- Scaffolded Next.js 16 + TypeScript + Tailwind v4 app (`create-next-app`).
- `AGENTS.md` master engineering instruction.
- All P1 planning docs: `docs/PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `AGENT_DESIGN.md`, `SECURITY.md`, `EVALUATION.md`.
- Process docs: `docs/OPENCODE_PROMPTS.md`, `docs/WORKLOG.md`, `.env.example`, `README.md`.

**OpenCode did:** nothing yet (project did not exist on disk locally).

---

## Milestone P1 — Architecture & planning — ✅ Mistral (Vibe Code)

Completed as part of commit `fbadcfc` (see Milestone 0). If OpenCode was also given Prompt 1: **do not regenerate the docs** — read them and report discrepancies instead. The review gate is the owner's approval of the existing docs.

---

## Milestone P2 — Foundation — 🔄 In progress

| Task | Owner | Status | Files |
| --- | --- | --- | --- |
| Ownership ledger (this file) | Mistral | ✅ | `docs/AGENT_WORK_SPLIT.md` |
| Dependencies (supabase-js/ssr, zod, vitest, cn utils) | Mistral | ✅ | `package.json` |
| DB migration: workspace schema + RLS + indexes | Mistral | ✅ | `supabase/migrations/0001_initial_schema.sql` |
| Env validation (Zod) + typed error envelope | Mistral | ✅ | `src/lib/validation/env.ts`, `src/lib/errors.ts` |
| Supabase clients (browser/server/admin) | Mistral | ✅ | `src/lib/database/supabase.ts` |
| Auth: session helpers, proxy guard, login page | Mistral | ✅ | `src/lib/auth.ts`, `src/proxy.ts`, `src/app/(auth)/login/` |
| AI provider abstraction + fake provider | Mistral | ✅ | `src/lib/ai/providers/` |
| Dashboard shell + 5 MVP screens + base UI components | Mistral | ✅ | `src/app/(app)/`, `src/components/` |
| Vitest setup + unit tests | Mistral | ✅ | `vitest.config.ts`, `tests/unit/` |
| OpenCode prompt P2 execution (per `OPENCODE_PROMPTS.md`) | OpenCode | ⬜ Pending — user runs locally | OpenCode's local working copy |

**Conflict-avoidance note for OpenCode's P2 run:** the codebase already contains the P2 foundation (this branch). When running Prompt P2, OpenCode should `git pull` first, review what exists, and only fill gaps — not rebuild from scratch. Report duplicates instead of overwriting.

---

## Milestone P3 — Communication Studio — ✅ Mistral (Vibe Code)

Branch: `vibe/studio-p3-5bccb6` · PR: stacked on PR #1

| Task | Owner | Files |
| --- | --- | --- |
| Thread parser (heuristic, direction detection) | Mistral | `src/lib/email/parse-thread.ts` |
| Zod schemas (analysis, import, draft) | Mistral | `src/lib/schemas/communication.ts` |
| Versioned prompts + untrusted-data delimiting | Mistral | `src/lib/ai/prompts/analyze-email.ts`, `draft-reply.ts` |
| Orchestrator (analyzeEmail, generateReply) | Mistral | `src/lib/ai/orchestrator/communication.ts` |
| Repositories (contacts, conversations, messages, classifications, drafts) | Mistral | `src/lib/database/repositories/index.ts`, `src/types/database.ts` |
| API routes (import, analyze, drafts, draft edit) | Mistral | `src/app/api/conversations/**`, `src/app/api/drafts/[id]/route.ts` |
| Studio UI full flow | Mistral | `src/components/email/studio-workspace.tsx`, `src/app/(app)/studio/page.tsx` |
| 17 unit tests (parser, orchestrator, injection delimiting) | Mistral | `tests/unit/parse-thread.test.ts`, `communication-orchestrator.test.ts` |
| Review P3 against docs, report gaps | OpenCode | ⬜ pending |

---

## Milestone P4 — Tasks & commitments — ⬜ Not started

Planned split: **OpenCode** implements per Prompt P4 (task dashboard, approval queue for proposed commitments); **Mistral** reviews. Assign explicitly before starting.

---

## Ledger maintenance rules

1. Every milestone gets a row in the table above **before** work starts (claim it) and is updated after.
2. Always list the concrete files touched.
3. One owner per file per milestone. If both agents must touch the same file, the second one rebases and reviews instead of editing blind.
4. The owner of a milestone runs lint + typecheck + tests and records the result in `docs/WORKLOG.md`.
