# ConvoPilot — Product Requirements Document (PRD)

Version: 0.3 · Status: Draft for review · Owner: Mahek · Last revised: 2026-11-16

Nothing in this document is implemented yet (see `WORKLOG.md`). Technical requirements are specified in `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md` and `AGENT_DESIGN.md`.

## 1. Problem (hypothesis)

Our working hypothesis is that busy people — founders first — lose track of professional conversations, promises and follow-ups across email, chat and meetings, and that generic AI chat tools do not keep relationship memory or an accountability loop. This has not been validated with user research; v0.1 is built first for the owner's own use to test it.

## 2. Product positioning

> ConvoPilot is an AI Chief of Staff that turns conversations into decisions, commitments, and completed work.

Intended initial audience (assumption, not validated): solo founders and small startup operators, then busy professionals. The v0.1 user base is one primary user plus a small number of invited people. **Approved:** each person has their own private workspace; invited people never see each other's data; there is no shared-workspace collaboration in the MVP.

### Long-term vision (not v0.1)

Founder intelligence, daily briefings and recommendations, Gmail/Calendar and other communication integrations, meeting preparation, voice assistance, desktop apps and professional networking. These inform the data model's extensibility but are not built in v0.1.

## 3. Product decisions

| Decision | Status | Choice |
| --- | --- | --- |
| Runtime | Locked | Local development first; cloud deployment later |
| AI strategy | Locked | Provider-agnostic abstraction. First provider pending (P3); hosted processing of private content pending (P5) |
| Conversation intake | Locked | Manual paste/file import first; Gmail later |
| Users | Approved | Private workspace per user; invite-only sign-up; only a platform operator issues invitations; email magic link / OTP login |
| Tasks/calendar | Locked | Internal tasks first; calendar later |
| Autonomy | Locked | Draft and propose only; user approves; no sending in v0.1 |
| Notifications | Deferred | Later: morning briefing + important alerts |

## 4. MVP v0.1 — scope

Five screens (plus a Settings shell):

1. **Dashboard** — counts of pending proposals, open/overdue tasks, recent conversations; quick actions.
2. **Communication Studio** — paste or import an email/thread, analyse it, generate a reply in the user's style, edit, copy, save as draft.
3. **Contacts** — people, company, role, relationship context, identifiers, linked history.
4. **Conversations** — stored threads, searchable, linked to contacts.
5. **Tasks** — tasks and commitments, including AI proposals awaiting approval.

Out of scope for v0.1: daily briefing (planned for M6, after v0.1 acceptance), the WhatsApp assistant (`docs/WHATSAPP.md`, after early access), Gmail/Calendar sync, meetings and meeting preparation, Slack/Discord/Outlook, voice, desktop app, networking, investor CRM, team collaboration features, billing, any sending of messages.

## 5. Acceptance criteria (v0.1)

- [ ] I can paste a complete email thread (or import a `.txt`/`.md`/`.eml` file). WhatsApp "Export chat" text is also accepted (owner decision 2026-11-21).
- [ ] The system identifies the thread's intent, main points and expected response, citing the messages it relied on.
- [ ] It produces a reply draft in my style (using only style preferences I confirmed).
- [ ] I can edit and save that reply as a draft, and copy it.
- [ ] I can save the sender as a contact.
- [ ] I can retrieve the conversation later.
- [ ] I can ask what I previously discussed with a person and get answers that cite stored messages or notes; if there is no record, it says so.
- [ ] It proposes commitments and tasks from conversations; nothing becomes confirmed without my approval.
- [ ] It does not invent commitments: ambiguous items are proposals with confidence and raw wording, not facts with hard dates.
- [ ] It cannot send any message (no send capability exists).
- [ ] Another user cannot see or change my data (cross-workspace tests pass, `EVALUATION.md` §3).

## 6. Functional requirements

### FR-1 Communication Studio
- Paste an email or full thread, or upload a file (formats and limits: `SECURITY.md` §10); optional "intended outcome" field.
- WhatsApp chats: the user exports a chat from WhatsApp ("Export chat → Without media") and uploads or pastes the `.txt`. Recognised automatically; times read in the workspace time zone; long chats keep the newest 50 messages and say how many were left out; media placeholders and system notices are dropped. WhatsApp offers no API to read a person's own chats, so manual export is the only supported route.
- Structured analysis: intent, main points, expected response, urgency, risks, with citations.
- Reply generation with tone (direct/warm/formal) and length controls.
- Draft persistence with revisions; copy to clipboard. No sending.

### FR-2 Contacts
- Create, edit and delete contacts: name, identifiers (email addresses), company, role, relationship context, notes.
- Contact timeline: linked conversations, drafts, tasks, commitments, confirmed memories.
- AI observations about a contact appear as proposed memories for approval; AI does not edit contact fields.

### FR-3 Conversations
- Import by paste or file; store messages with provenance (source, direction, participants, timestamps when known); detect duplicate imports.
- Associate conversations with contacts; list and keyword search. Semantic search is added only if retrieval evaluation shows a need (`ARCHITECTURE.md` §9, D10).
- Delete conversations; deleted content no longer appears in search or AI answers.

### FR-4 Tasks & commitments
- Manual task CRUD: title, status, priority, due date, linked contact/conversation/commitment.
- AI-extracted commitments and tasks enter an approval queue (proposed → confirmed/rejected, editable before approval).
- Two-way view: what I owe others, what others owe me.

### FR-5 Ask history
- Questions over the user's own stored conversations, notes and confirmed memories, with citations to sources.

### FR-6 Dashboard
- Counts: pending proposals, open tasks, overdue items, recent conversations. (Daily briefing is post-v0.1.)

## 7. Non-functional requirements

- Workspace isolation enforced by application checks, deterministic policy and RLS (`ARCHITECTURE.md` §4).
- No message content in logs, analytics or error responses (`SECURITY.md` §9).
- Provider configuration server-side only; hosted-provider data handling per P5.
- Stored-data pages respond in under 2 s locally (target, to be measured); AI calls show progress.
- Data export and deletion implemented before any real deployment. Users can request account deletion; access ends immediately and data is permanently deleted after a retention period (period pending owner decision; `DATABASE.md` §8.6).

## 8. Success metrics (post-MVP, to be measured)

Commitments captured accurately, follow-ups completed on time, proposals accepted vs rejected, weekly active use, hallucination rate in answers (`EVALUATION.md` §5).
