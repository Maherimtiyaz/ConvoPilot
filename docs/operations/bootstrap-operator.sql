-- ConvoPilot — make the owner the first operator (run ONCE per Supabase project, in the
-- dashboard's SQL Editor). Every later invitation is made in the app: /app/operator.
--
-- Step 1: replace the email and SITE_URL, run this block, open the link it returns, and create
-- your account with that same email.
with t as (
  select 'owner@example.com'::text as email,
         'https://YOUR-SITE.vercel.app'::text as site_url,
         pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as token
), ins as (
  insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
  select lower(email), extensions.digest(token, 'sha256'), '00000000-0000-0000-0000-000000000000', now() + interval '1 day'
    from t
  returning id
)
select t.site_url || '/invite#t=' || t.token as your_invitation_link, (select count(*) from ins) as created from t;

-- Step 2: after you have signed in once, grant operator rights (replace the email):
-- insert into app_private.platform_operators (user_id)
--   select id from auth.users where email = 'owner@example.com';
-- Then reload the app: "Operator" appears in the left menu.
