-- ConvoPilot — review the waitlist (read-only). Run in Supabase dashboard → SQL Editor.

-- Who is waiting, newest first.
select created_at::date as joined, full_name, email_normalized as email, role, company_size,
       coalesce(source, '—') as source, coalesce(biggest_challenge, '') as challenge, status
  from app_private.waitlist_entries
 order by created_at desc
 limit 200;

-- Totals by status and by where people heard about ConvoPilot (?ref=… links).
select status, count(*) from app_private.waitlist_entries group by status order by 2 desc;
select coalesce(source, '(direct)') as source, count(*) from app_private.waitlist_entries group by 1 order by 2 desc;

-- Invited people who have created their account (activation).
select w.email_normalized as email, w.invited_at::date as invited, i.consumed_at::date as joined
  from app_private.waitlist_entries w
  join app_private.invitations i on i.id = w.invitation_id
 order by w.invited_at desc;
