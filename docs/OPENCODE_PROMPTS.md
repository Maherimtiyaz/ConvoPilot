# ConvoPilot — Coding-Agent Prompt Log

Version: 0.2 · Last revised: 2026-11-16

This file is a **log**, not a specification. `AGENTS.md` and the documents it lists are authoritative. Do not execute any prompt in this file without the owner explicitly approving it in the current session.

## Standing rules for every prompt

- Reference `AGENTS.md` and the relevant `docs/` file.
- Work in the existing repository. Never scaffold, re-initialise Git, or recreate the project.
- One milestone per prompt: inspect → plan → implement → check → report. Do not start the next milestone.
- Run, in order: `npm run lint`, `npx next typegen`, `npx tsc --noEmit`, tests (once they exist), `npm run build`. Report exactly what ran and what passed.
- Forbid: unapproved dependencies, fake integrations, TODO stubs presented as done, destructive migrations without approval, committing secrets or real private data.

## Current milestone queue (aligned with `ARCHITECTURE.md` §13)

| # | Milestone | Status |
| --- | --- | --- |
| M1.1 | Baseline verification (`npm ci`, lint, typegen/tsc, build, audit) | ✅ Done 2026-11-16 |
| — | Specification revision v0.2 and hardening pass | ✅ Documented; awaiting owner review |
| M1.2 | Tooling & quality gates | ✅ Accepted 2026-11-16 (commit `2bfb522`, CI green) |
| M1.3 | Database foundation + Supabase Auth integration (local Supabase, migrations, RLS, invitations, sign-up gate, session-bound server client) | 🟡 Stage 0 validation passed 2026-11-16; Stage 1 implementation next |
| M1.4 | Login UI, `proxy.ts`, protected application shell | ⬜ Not started (after M1.3) |
| M2 | AI core (provider interface, test provider, structured output, policy, injection harness) | ⬜ Blocked on P4 |
| M3 | Communication Studio | ⬜ Blocked on P3, P5 |
| M4 | Contacts, Conversations & retrieval | ⬜ |
| M5 | Commitments & Tasks | ⬜ |
| — | v0.1 acceptance (`PRD.md` §5) | ⬜ |
| M6 | Daily briefing | ⬜ Post-v0.1 |
| M7 | Gmail/Calendar (read-only first) | ⬜ Post-v0.1 |
| M8 | Evaluation, hardening, deployment | ⬜ |

### M1.2 — draft prompt (requires owner approval before use)

> In the existing ConvoPilot repository, implement milestone M1.2 only, per `AGENTS.md` and `docs/ARCHITECTURE.md` §10 and §13. Scope: add Vitest and Zod (state why each is needed), `typecheck` and `test` npm scripts, a server-only Zod-validated environment loader with unit tests (no secret values printed), the CI workflow in the order `npm ci` → lint → `next typegen` → `tsc` → tests → build → secret scan, and the `.gitignore` exception `!.env.example`. Do not add Supabase, auth, routes, UI components or AI code. Run lint, typegen, typecheck, tests and build; report results exactly. Do not commit unless asked.

---

## Legacy prompts (historical — NOT authoritative, DO NOT RUN)

Kept for history only. They predate specification v0.2 and conflict with it (old table names such as `users`/`audit_logs`, the provider abstraction inside Phase 1, no `workspace_members`, no per-workflow allow-lists). Any instruction below that conflicts with current docs is void.

| # | Legacy prompt | Legacy status |
| --- | --- | --- |
| P0 | Project scaffold with create-next-app and git init. **Already done; re-running would overwrite this repository. Never re-run.** | Done |
| P1 | Architecture & planning docs | Done (superseded by v0.2) |
| P2 | "Phase 1 — Foundation" (Supabase, auth, schema, layout, provider abstraction, Vitest in one prompt) | Superseded by M1.2–M1.4 and M2 |
| P3 | "Phase 2 — Communication Studio" | Superseded by M3 |
| P4 | "Phase 3 — Contacts & relationship memory" (included pgvector by default) | Superseded by M4 |
| P5 | "Phase 4 — Tasks & commitments" (included daily summary) | Superseded by M5 |
| P6 | "Phase 5 — Daily briefing" | Superseded by M6 |
| P7 | "Phase 6 — Gmail integration" | Superseded by M7 |
| P8 | "Phase 7 — Evaluation & hardening" | Superseded by M8 |

The full text of the legacy P2 and P3 templates has been removed from this file because it instructed a schema and phase structure that contradict v0.2. It remains available in Git history (commit `fbadcfc`).
