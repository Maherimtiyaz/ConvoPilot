-- ConvoPilot — invite people from the waitlist (operator SQL until the M1.5 console exists).
--
-- Run in the Supabase dashboard → SQL Editor of the project you are inviting into.
-- 1. Replace the example addresses in the `picked` list below with the people you chose.
-- 2. Run it. The result lists each email with its private invitation link.
-- 3. Send each person ONLY their own link (it works once, for that email, for 7 days).
-- Links are shown once and are never stored (only a SHA-256 hash is kept). If a link is lost,
-- revoke the invitation and run this again for that person.
-- Change SITE_URL below to the app's real address once the domain exists.

with settings as (
  select 'http://127.0.0.1:3000'::text as site_url
),
picked as (
  select w.id, w.email_normalized
    from app_private.waitlist_entries w
   where w.status = 'pending'
     and w.email_normalized = any (array[
       'person.one@example.com',
       'person.two@example.com'
     ])
     and not exists (
       select 1 from app_private.invitations i
        where i.email_normalized = w.email_normalized
          and i.consumed_at is null and i.revoked_at is null and i.expires_at > now())
),
tokens as (
  select p.id as waitlist_id, p.email_normalized,
         pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as token
    from picked p
),
created as (
  insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
  select t.email_normalized, extensions.digest(t.token, 'sha256'),
         '00000000-0000-0000-0000-000000000000'::uuid,  -- issued by the operator via SQL
         now() + interval '7 days'
    from tokens t
  returning id, email_normalized
),
marked as (
  update app_private.waitlist_entries w
     set status = 'invited', invited_at = now(), invitation_id = c.id
    from created c
   where w.email_normalized = c.email_normalized
  returning w.email_normalized
),
audited as (
  select app_private.write_audit('account', null, null, 'invitation.created', 'invitation', c.id::text, '{}'::jsonb)
    from created c
)
select t.email_normalized as email,
       (select site_url from settings) || '/invite#t=' || t.token as invitation_link,
       (select count(*) from audited) as audit_rows
  from tokens t
  join created c on c.email_normalized = t.email_normalized
 order by 1;
