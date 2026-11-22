# WhatsApp in ConvoPilot

Status: **Part 1 built** (chat import). **Part 2 planned** (assistant on WhatsApp): owner said
yes to putting it on the roadmap (2026-11-21). It must not be built until the owner approves this
design and the items in §2.6 are in place. Every Part 2 section below is a
**Recommended (pending approval)** item.

## Ground rule

WhatsApp has **no API for reading a person's own chats**. Unofficial tools (WhatsApp Web
automation, reverse-engineered clients) break WhatsApp's terms, get numbers banned and would
mean handling a user's whole message history. ConvoPilot will never use them.

## 1. Part 1 — WhatsApp chat import (built)

- The user exports one chat from WhatsApp ("Export chat → Without media") and uploads the `.txt`,
  or pastes its text, in Communication Studio.
- Code: `src/lib/conversations/whatsapp.ts`, called from `parse.ts`. Format detection,
  multi-line messages, system notices and media placeholders dropped, day/month order inferred,
  times converted with the workspace time zone, the newest 50 messages kept and the rest counted.
- Everything else is unchanged: the same limits, RLS, plain-text rendering, AI consent and
  cited analysis as email imports.
- Your own messages: exports have names but no emails, so Settings → **Your names in chats**
  lets the user list up to 5 names WhatsApp shows for them (`workspace_settings.chat_names`).
  Messages from those names (case-insensitive) are treated as sent by the user when a
  conversation is shown or given to the AI, including chats imported earlier, and the AI is told
  the names. Messages with an email address are never changed.

## 2. Part 2 — ConvoPilot assistant on WhatsApp (planned)

### 2.1 What the user can do
On ConvoPilot's own WhatsApp number, **only after linking their phone in Settings and opting in**:
- Forward a message → a short cited summary ("what do they want?").
- Ask "what did I promise Priya?" → commitments with sources (the existing ask-history workflow).
- "Draft a reply" → a draft the user copies and sends themselves.
- Approve or dismiss suggested commitments and tasks with reply buttons.
- Later: the daily briefing (M6) delivered on WhatsApp.

ConvoPilot only ever replies **to the linked user**. It never messages anyone else, which keeps
the rule "nothing is sent for you".

### 2.2 How it connects
- **WhatsApp Business Platform (Cloud API)** from Meta, the official route. Meta sends incoming
  messages to a webhook; we reply through the Graph API.
- New route handler `POST /api/whatsapp/webhook` (and `GET` for Meta's one-time verification).
- Outgoing replies through a provider adapter in `src/lib/channels/whatsapp/` (same rule as AI
  SDKs: vendor code only inside the adapter; CI guard extended).

### 2.3 Security design
1. **Webhook authenticity:** verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the
   app secret) in constant time before parsing; reject anything else. Replay protection: store
   message ids and ignore repeats.
2. **Identity without a browser session:** webhook calls have no signed-in user, which is a change
   to the architecture (today every request runs as the signed-in user under RLS). Proposal: one
   narrow `security definer` function per allowed action (`whatsapp_handle_inbound(...)`) that
   resolves the user **only** from a verified phone link, checks the opt-in, and does exactly that
   action. No service-role key in the app; the webhook secret is the only credential.
3. **Phone linking:** the user enters their number in Settings, then sends a one-time 6-digit code
   from that phone to the ConvoPilot number within 10 minutes. Numbers are stored as hashes
   plus the last 4 digits for display. Unlink at any time; account deletion removes the link.
4. **Untrusted input:** forwarded text is imported content (data, never instructions). The
   existing injection defences, citation checks and tool allow-lists apply. The assistant gets
   **Read and Propose tools only**; approvals happen through explicit buttons mapped to the
   existing decision service, never through free text interpreted by the model.
5. **Limits:** per-user message rate limit, the existing $1/day AI cap, and the maximum message size.
6. **Privacy:** messages pass through Meta, so this needs a separate opt-in, a privacy notice
   update and an entry in the processor list. No message content in logs.

### 2.4 WhatsApp rules that shape the product
- Free-form replies are allowed only within **24 hours** of the user's last message; anything
  later (e.g. a morning briefing) must use a **pre-approved template**.
- Meta charges per conversation (price depends on country and category) and requires business
  verification.

### 2.5 Milestone plan (M7W, roughly 2–3 weeks)
1. Database: phone links, inbound message ledger (ids for replay protection), definer functions, pgTAP tests.
2. Webhook and signature checks; linking flow in Settings.
3. Assistant flows: summarise, ask, draft, approve buttons. All reuse the existing workflows.
4. Tests: unit (signature, parsing), pgTAP (isolation, linking), e2e against a local mock of the Cloud API.
5. Docs: SECURITY, DATABASE, privacy notice.

### 2.6 Needed from the owner before building
- Approval of this design (especially §2.3.2, the change to how requests are authorised).
- Meta Business account, business verification, a dedicated phone number, a billing method.
- Privacy/legal review of the new processor (Meta) and the opt-in wording.
- Validation with early-access users that they want it.
