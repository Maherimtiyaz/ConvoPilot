# ConvoPilot

Your AI Chief of Staff — turns conversations into decisions, commitments, and completed work.

ConvoPilot helps you understand and reply to professional emails, remember people and relationships, track commitments and follow-ups, and get a daily picture of what deserves your attention. Human-in-the-loop by design: the agent reads, analyzes, drafts, and proposes — you approve anything that leaves the system.

## Status

MVP v0.1 in development. Architecture and planning documents are complete; implementation starts with Phase 1 (foundation). See `docs/OPENCODE_PROMPTS.md` for the prompt queue and `docs/WORKLOG.md` for session reports.

## Documentation

- [PRD](docs/PRD.md) — product scope and MVP acceptance criteria
- [Architecture](docs/ARCHITECTURE.md) — system design and key decisions
- [Database](docs/DATABASE.md) — schema, memory integrity rules, RLS
- [Agent Design](docs/AGENT_DESIGN.md) — orchestrator, tool contracts, permissions
- [Security](docs/SECURITY.md) — threat model and security checklist
- [Evaluation](docs/EVALUATION.md) — how we measure agent trustworthiness
- [OpenCode Prompts](docs/OPENCODE_PROMPTS.md) — checklist of prompts given to the coding agent
- [Worklog](docs/WORKLOG.md) — session reports

## Tech stack

Next.js (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui · Supabase (PostgreSQL + Auth + pgvector) · provider-agnostic AI layer · Zod · Vitest

## Development

```bash
npm install
cp .env.example .env.local   # fill in Supabase + AI provider config
npm run dev
```

```bash
npm run lint        # ESLint
npx tsc --noEmit    # type check
npm run build       # production build
```

## Principles

1. Human approval for anything external — the agent never sends without you.
2. Every memory has provenance; inferred facts are proposals until confirmed.
3. Imported messages are untrusted data, never instructions.
4. Workspace-scoped data with RLS from the first migration.
