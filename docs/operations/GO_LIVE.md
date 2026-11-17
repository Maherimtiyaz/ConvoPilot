# H1 — Go-live checklist (waitlist online)

Goal of stage A: the landing page and waitlist live on a free `*.vercel.app` address, storing
sign-ups in the hosted Supabase **production** project. Sign-in for invited users comes in stage B
(needs a domain + Resend, see §5).

Rules: never paste keys or passwords into chat. Public values (project URL, publishable key) go
into Vercel's dashboard; the one secret Claude needs (a temporary Supabase access token) goes into
the Claude environment settings and is revoked afterwards.

## 1. Supabase project (owner, ~5 minutes)

1. supabase.com → **New project** → name `convopilot-prod`, region closest to your first users,
   plan Free (upgrade before inviting ~1,000 people).
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

1. Applies the 10 migrations (schema, security, invitations, waitlist, operator console) to `convopilot-prod`.
2. Pushes the Auth settings from `supabase/config.toml` (passwordless, invite-only hook, link and
   session lifetimes, scanner-safe email templates) with the production site URL.
3. Verifies: the API exposes only `public`; anonymous users can join the waitlist but cannot read
   it; sign-up without an invitation is refused.

## 3b. Become the first operator (owner, ~3 minutes)

Run `docs/operations/bootstrap-operator.sql` in the Supabase SQL Editor (step 1), open the link it
returns and create your account (Supabase's built-in email reaches you because you own the
project), then run step 2. "Operator" appears in the app's menu; from then
on you invite people from `/app/operator`. (Inviting others needs stage B email, see below.)

## 4. Remove Claude's access (owner, 1 minute)

Delete the `claude-setup-temporary` token in Supabase and the variable in the Claude environment.

## 5. Vercel (owner, ~5 minutes; after step 3)

1. vercel.com → **Add New → Project → Import** the `ConvoPilot` GitHub repository.
2. **Environment Variables** (both public by design; from Supabase → Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **publishable** key (`sb_publishable_…`).
     Never the `secret`/`service_role` key.
   - `NEXT_PUBLIC_APP_URL` = the site's address (e.g. `https://convopilot-xyz.vercel.app`), used to
     build invitation links in the operator console.
3. Deploy. Vercel publishes the `main` branch, so the reviewed work is merged into `main` first
   (Claude opens a pull request; you press Merge).
4. Send Claude the address (e.g. `convopilot-xyz.vercel.app`); Claude sets it as the Auth site URL
   and checks the live site (pages, headers, waitlist sign-up end to end).

## 6. Before sharing the link publicly (owner)

- Approve or edit the draft privacy notice (`/privacy`) and the FAQ answer about pricing.
- Share links with a channel tag: `…/?ref=linkedin`, `?ref=x`, `?ref=community`, `?ref=network`.

## Stage B — inviting people (later)

Domain (~$10–15/year) → Resend account with the domain verified → Supabase custom SMTP →
the domain added in Vercel → site URL updated. Supabase's built-in email only reaches your own
team, so invited users cannot sign in before this.
