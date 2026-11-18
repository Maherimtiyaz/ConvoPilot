-- Waitlist (W1): public entry point, no read access, same response for duplicates, flood limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role anon;
select is(public.join_waitlist('Ada@Example.com ', 'Ada Lovelace', 'founder', 'solo', 'Too many follow-ups', true, 'linkedin') ->> 'status',
  'ok', 'anon can join the waitlist');
select is(public.join_waitlist('ada@example.com', 'Someone Else', 'operator', '2-10', null, true, null) ->> 'status',
  'ok', 'duplicate email gets the same response (no enumeration)');
select is(public.join_waitlist('bob@example.com', 'Bob', 'founder', 'solo', null, false, null) ->> 'status',
  'invalid', 'consent is required');
select is(public.join_waitlist('not-an-email', 'Bob', 'founder', 'solo', null, true, null) ->> 'status',
  'invalid', 'malformed email is rejected');
select is(public.join_waitlist('bob@example.com', 'Bob', 'admin', 'solo', null, true, null) ->> 'status',
  'invalid', 'unknown role is rejected');
select is(public.join_waitlist('bob@example.com', 'Bob', 'founder', 'solo', repeat('x', 501), true, null) ->> 'status',
  'invalid', 'over-long challenge text is rejected');
select is(public.join_waitlist('bob@example.com', '', 'founder', 'solo', null, true, null) ->> 'status',
  'invalid', 'empty name is rejected');
select is(public.join_waitlist('bob@example.com', 'Bob', 'founder', 'solo', null, true, 'Bad Source!') ->> 'status',
  'invalid', 'source tag must be a simple identifier');
select throws_ok($$ select count(*) from app_private.waitlist_entries $$, '42501', null,
  'anon cannot read waitlist entries');
reset role;

select is((select count(*)::int from app_private.waitlist_entries where email_normalized = 'ada@example.com'), 1,
  'one row per email; the first submission is kept');
select is((select full_name || '|' || role || '|' || status from app_private.waitlist_entries where email_normalized = 'ada@example.com'),
  'Ada Lovelace|founder|pending', 'entry stored normalised with status pending');

insert into app_private.waitlist_entries (email_normalized, full_name, role, company_size, consent_at)
select 'flood' || g || '@example.com', 'Flood', 'other', 'solo', now() from generate_series(1, 60) g;
set local role anon;
select is(public.join_waitlist('late@example.com', 'Late', 'founder', 'solo', null, true, null) ->> 'status',
  'busy', 'global flood limit returns busy');
reset role;

select * from finish();
rollback;
