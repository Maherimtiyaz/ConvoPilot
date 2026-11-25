# H1 — Go-live checklist (waitlist online)

Goal of stage A: the landing page and waitlist live on a free `*.vercel.app` address, storing
sign-ups in the hosted Supabase **production** project. Sign-in for invited users comes in stage B
(needs a domain + Resend, see §5).

Rules: never paste keys or passwords into chat. Public values (project URL, publishable key) go
into Vercel's dashboard; the one secret Claude needs (a temporary Supabase access token) goes into
the Claude environment settings and is revoked afterwards.

## 1. Supabase project (owner, ~5 minutes)

1. supabase.com → **New project** → name `convopilot-prod`, region closest to your first users,
   plan Free for the waitlist only. **Upgrade to Pro before the first invited user stores real
   conversations**: verify on the plan that it includes daily backups (point-in-time recovery is
   an add-on) and that the project is never paused for inactivity (a paused project stops the
   waitlist and the daily erasure job). Backups keep erased data until they expire; the privacy
   notice must say how long.
   A separate `convopilot-dev` project for manual testing (CLAUDE.md §3) can follow later; until
   then, test locally only and never with real conversations.
2. Generate the database password with the button and save it in your password manager.
   Do not share it.
3. Copy the **project ref**: the 20-letter ID in the dashboard URL
   (`supabase.com/dashboard/project/<ref>`). It is not secret; send it to Claude.

## 2. Temporary access for Claude (owner, ~3 minutes)

1. supabase.com → your avatar → **Account preferences → Access Tokens → Generate new token**,
   name it `claude-setup-temporary`. It gives full access to your Supabase account, so it is
   removed again in step 4.
2. In the Claude app: the cloud environment menu in this session's title bar → **Edit** → add it
   under *Network secrets* (or as an environment variable) named **`SUPABASE_ACCESS_TOKEN`**.
3. Start a new session (or tell Claude) so the variable is picked up.

## 3. Database and Auth setup (Claude)

With the token and project ref, Claude:

1. Applies all migrations in `supabase/migrations` (schema, security, invitations, waitlist, operator console, Communication Studio, contacts, commitments and tasks, acceptance hardening, retention and restore, chat names, AI reservations — retention and restore enables the `pg_cron` extension, which Supabase provides, and schedules the daily erasure job) to `convopilot-prod`.
2. Pushes the Auth settings from `supabase/config.toml` (passwordless, invite-only hook, link and
   session lifetimes, scanner-safe email templates) with the production site URL.
3. Verifies: the API exposes only `public` (hosted projects also expose `graphql_public` by
   default — turn it off); the `before_user_created` hook is on; access tokens last 15 minutes;
   anonymous sign-ins are off; email templates and link lifetime match; anonymous users can join
   the waitlist but cannot read it; sign-up without an invitation is refused; the erasure job is
   scheduled.
4. Sets `NEXT_PUBLIC_APP_URL` to the public https address in Vercel (in production, creating
   invitation links fails loudly without it instead of producing localhost links) and leaves `ANTHROPIC_BASE_URL` unset.

## 3b. Become the first operator (owner, ~3 minutes)

Run `docs/operations/bootstrap-operator.sql` in the Supabase SQL Editor (step 1), open the link it
returns and create your account (Supabase's built-in email reaches you because you own the
project), then run step 2. "Operator" appears in the app's menu; from then
on you invite people from `/app/operator`. (Inviting others needs stage B email, see below.)

## 4. Remove Claude's access (owner, 1 minute)

Delete the `claude-setup-temporary` token in Supabase and the variable in the Claude environment.

## 5. Vercel (owner, ~5 minutes; after step 3)

Settings to make while creating the project (production-readiness review 2026-11-25):
- **Function region:** the same region as the Supabase project (each AI action makes about ten
  database round trips).
- **Environment scope:** add every variable below to **Production only**. Preview deployments
  (one per pushed branch) must not get the production database or the Anthropic key.
- **Deployment Protection:** on for previews (Vercel Authentication).
- **Function duration:** AI pages ask for up to 300 seconds (`maxDuration`). Verify on the plan
  that this is allowed; if the plan allows less, tell Claude so the AI time limits are lowered.


1. vercel.com → **Add New → Project → Import** the `ConvoPilot` GitHub repository.
2. **Environment Variables** (both public by design; from Supabase → Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **publishable** key (`sb_publishable_…`).
     Never the `secret`/`service_role` key.
   - `ANTHROPIC_API_KEY` = an Anthropic API key (console.anthropic.com → API keys). **Secret**:
     paste it only into Vercel, mark it "Sensitive", never into chat or the repository. Optional
     until you want AI features live; without it the app says "AI isn't connected yet".
   - `NEXT_PUBLIC_APP_URL` = the site's address (e.g. `https://convopilot-xyz.vercel.app`), used to
     build invitation links in the operator console.
3. Deploy. Vercel publishes the `main` branch, so the reviewed work is merged into `main` first
   (Claude opens a pull request; you press Merge).
4. Send Claude the address (e.g. `convopilot-xyz.vercel.app`); Claude sets it as the Auth site URL
   and checks the live site (pages, headers, waitlist sign-up end to end).

## 6. Before sharing the link publicly (owner)

- **Anthropic:** in console.anthropic.com set an organisation-wide monthly spend limit and an
  alert. The app caps each workspace at $1/day, which is still up to $1,000/day for 1,000 users.
- **GitHub:** protect `main` (Settings → Branches): require the CI checks to pass before merging.
- **Uptime monitor:** a free monitor (e.g. UptimeRobot or Better Stack) on the home page and on
  `/api/health`, alerting by email.
- **Logs:** Vercel → Logs shows one JSON line per AI action and per error (codes, paths and
  durations only; never content). Search `"event":"request.error"` or `"event":"ai.failed"`.

- Approve or edit the draft privacy notice (`/privacy`) and the FAQ answer about pricing.
- Share links with a channel tag: `…/?ref=linkedin`, `?ref=x`, `?ref=community`, `?ref=network`.

## Stage B — inviting people (later)

Domain (~$10–15/year) → Resend account with the domain verified (SPF, DKIM and DMARC records)
→ Supabase custom SMTP → the domain added in Vercel → site URL updated. Supabase's built-in
email only reaches your own team, so invited users cannot sign in before this. Then raise the
Auth email rate limit in Supabase (Authentication → Rate limits) above the size of an invitation
batch (e.g. 100 per hour for batches of 50).

## Deploying changes after go-live

1. Database first: new migrations are written so the *current* app keeps working with them
   (add columns and functions; remove old ones only in a later release).
2. Claude applies the migrations to production (with a temporary token, as in step 2), checks
   them, then you merge the pull request; Vercel deploys `main`.
3. If a release misbehaves: Vercel → Deployments → **Promote** the previous deployment. Database
   changes are not rolled back automatically; a follow-up migration fixes them.
