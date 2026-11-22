-- v0.1 acceptance: scenarios not covered elsewhere (docs/ACCEPTANCE.md) and the AI cost-cap
-- reservation (security review M1). Synthetic data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create function pg_temp.as_user(p_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;

insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
values ('a@example.com', extensions.digest('a-token', 'sha256'), gen_random_uuid(), now() + interval '1 day'),
       ('b@example.com', extensions.digest('b-token', 'sha256'), gen_random_uuid(), now() + interval '1 day');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"invitation_token": "a-token"}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"invitation_token": "b-token"}');
create temp table ws on commit drop as
  select m.user_id, m.workspace_id from public.workspace_members m
   where m.user_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b');
grant select on ws to authenticated;
create temp table ids (k text primary key, v uuid) on commit drop;
grant select, insert on ids to authenticated;
create function pg_temp.wsa() returns uuid language sql as $$ select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' $$;
create function pg_temp.wsb() returns uuid language sql as $$ select workspace_id from ws where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' $$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.wsa() to authenticated;
grant execute on function pg_temp.wsb() to authenticated;
grant execute on function pg_temp.id(text) to authenticated;
create function pg_temp.rows_changed(p_sql text) returns int language plpgsql as $$
declare n int; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
grant execute on function pg_temp.rows_changed(text) to authenticated;

-- ---------------------------------------------------------------- A's data
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
insert into ids select 'contact', (public.save_contact(pg_temp.wsa(), 'Priya Shah', 'priya@example.com') ->> 'contact_id')::uuid;
insert into ids select 'conv', (public.import_conversation(pg_temp.wsa(), 'Deck', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","body":"Could you send the revised deck by Friday? And confirm the pilot by Monday.","direction":"inbound"}]'::jsonb) ->> 'conversation_id')::uuid;
insert into ids select 'm1', id from public.messages where conversation_id = pg_temp.id('conv');
select public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'), jsonb_build_array(
  jsonb_build_object('description', 'Send the revised deck', 'owner', 'me', 'origin', 'extracted',
    'citations', jsonb_build_array(jsonb_build_object('message_id', pg_temp.id('m1'), 'quote', 'send the revised deck')),
    'task', jsonb_build_object('title', 'Send deck')),
  jsonb_build_object('description', 'Confirm the pilot', 'owner', 'me', 'origin', 'inferred',
    'citations', jsonb_build_array(jsonb_build_object('message_id', pg_temp.id('m1'), 'quote', 'confirm the pilot by Monday')), 'task', null)),
  '{"provider":"test","model":"m","prompt_version":"extract-commitments@1"}');
insert into ids select 'c1', id from public.commitments where description = 'Send the revised deck';
insert into ids select 'c2', id from public.commitments where description = 'Confirm the pilot';
insert into ids select 't1', id from public.tasks where commitment_id = pg_temp.id('c1');

-- A15: derived records carry model metadata.
select is((select ai_provider || '/' || ai_model || '/' || prompt_version from public.commitments where id = pg_temp.id('c1')),
  'test/m/extract-commitments@1', 'A15: proposals carry provider, model and prompt version');

-- S16: decision and provenance columns are not writable through the API.
select throws_ok($$ update public.commitments set decided_by = auth.uid() $$, '42501', null, 'S16: decided_by is not writable');
select throws_ok($$ update public.commitments set decided_at = now() $$, '42501', null, 'S16: decided_at is not writable');
select throws_ok($$ update public.commitments set origin = 'user_stated' $$, '42501', null, 'S16: origin is not writable');
select throws_ok($$ update public.commitments set evidence_state = 'supported' $$, '42501', null, 'S16: evidence_state is not writable');
select throws_ok($$ update public.tasks set decided_by = auth.uid(), status = 'open' $$, '42501', null, 'S16: task decisions are not writable');
select throws_ok($$ update public.ai_usage_daily set reserved_micro_usd = 0, cost_micro_usd = 0 $$, '42501', null, 'the AI spend ledger is not writable');

-- A18: approval with confirmation writes one audit event per change.
select is(public.approve_task(pg_temp.id('t1'), true) ->> 'status', 'ok', 'A18: approve with confirmation');
select is((select count(*)::int from public.audit_events where target_id in (pg_temp.id('c1')::text, pg_temp.id('t1')::text)
            and action in ('commitment.confirmed', 'task.approved')), 2, 'A18: two audit events, one per change');
-- S21: the owner can read their own workspace's audit events.
select ok((select count(*) from public.audit_events where workspace_id = pg_temp.wsa()) > 0, 'S21: the owner reads their workspace audit events');

-- A22: invalid transitions.
select public.decide_proposal('commitment', pg_temp.id('c2'), 'reject');
select is(public.decide_proposal('commitment', pg_temp.id('c2'), 'confirm') ->> 'status', 'invalid_transition', 'A22: rejected cannot become confirmed');
select is(public.set_task_status(pg_temp.id('t1'), 'proposed') ->> 'status', 'invalid', 'A22: an open task cannot go back to proposed');

-- ---------------------------------------------------------------- M1: AI spend reservation
create temp table res (name text primary key, id uuid);
grant all on res to authenticated;
insert into res select 'r1', (public.reserve_ai_usage(pg_temp.wsa(), 600000, 1000000) ->> 'reservation_id')::uuid;
select isnt((select id from res where name = 'r1'), null, 'M1: a first request reserves its worst case and gets a reservation id');
select is(public.reserve_ai_usage(pg_temp.wsa(), 500000, 1000000) ->> 'status', 'over_cap', 'M1: a concurrent request that would pass the cap is refused');
-- Review 2026-11-22: a direct call cannot release reservations it does not own.
select public.record_ai_usage(pg_temp.wsa(), 0, 0, 0, gen_random_uuid());
select is((select reserved_micro_usd from public.ai_usage_daily where workspace_id = pg_temp.wsa()), 600000::bigint,
  'settling with an unknown reservation id releases nothing');
select public.record_ai_usage(pg_temp.wsa(), 0, 0, 0);
select is((select reserved_micro_usd from public.ai_usage_daily where workspace_id = pg_temp.wsa()), 600000::bigint,
  'recording usage without a reservation id releases nothing');
select public.record_ai_usage(pg_temp.wsa(), 1000, 500, 300000, (select id from res where name = 'r1'));
select is((select cost_micro_usd || '/' || reserved_micro_usd from public.ai_usage_daily where workspace_id = pg_temp.wsa()), '300000/0',
  'M1: settling records the real cost and releases the reservation');
insert into res select 'r2', (public.reserve_ai_usage(pg_temp.wsa(), 900000, 1000000) ->> 'reservation_id')::uuid;
select public.record_ai_usage(pg_temp.wsa(), 0, 0, 0, (select id from res where name = 'r1'));
select is((select reserved_micro_usd from public.ai_usage_daily where workspace_id = pg_temp.wsa()), 900000::bigint,
  'a reservation can be released only once (settling r1 again frees nothing)');
select isnt((select id from res where name = 'r2'), null, 'M1: a lone request may start while under the cap');
select public.record_ai_usage(pg_temp.wsa(), 1000, 500, 800000, (select id from res where name = 'r2'));
select throws_ok($$ select count(*) from app_private.ai_reservations $$, '42501', null, 'reservation rows are not readable by users');
select is(public.reserve_ai_usage(pg_temp.wsa(), 1000, 1000000) ->> 'status', 'over_cap', 'M1: nothing starts once the cap is reached');
select is(public.reserve_ai_usage(pg_temp.wsa(), 0, 1000000) ->> 'status', 'invalid', 'M1: amounts are validated');

-- ---------------------------------------------------------------- another user
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000000b');
select is(pg_temp.rows_changed(format($$ update public.conversations set subject = 'hijacked' where id = %L $$, pg_temp.id('conv'))), 0,
  'S2: another user cannot update a conversation');
select is(pg_temp.rows_changed(format($$ update public.contacts set full_name = 'hijacked' where id = %L $$, pg_temp.id('contact'))), 0,
  'S2: another user cannot update a contact');
select is(public.reserve_ai_usage(pg_temp.wsa(), 1000, 1000000) ->> 'status', 'not_found', 'M1: another user cannot touch this workspace''s ledger');
select is((select count(*)::int from public.audit_events where workspace_id = pg_temp.wsa()), 0, 'S21: another user cannot read them');

-- ---------------------------------------------------------------- database-level guards (bypassing grants)
reset role;
select throws_ok(format($$ insert into public.commitments (workspace_id, conversation_id, description, owner, origin, status, decided_at)
  values (%L, %L, 'x', 'me', 'extracted', 'confirmed', now()) $$, pg_temp.wsa(), pg_temp.id('conv')), '23514', null,
  'A16: an AI-origin commitment cannot be inserted as confirmed');
select throws_ok(format($$ insert into public.tasks (workspace_id, title, status, origin, commitment_id)
  values (%L, 'x', 'open', 'extracted', %L) $$, pg_temp.wsa(), pg_temp.id('c1')), '23514', null,
  'A16: an AI-origin task cannot be inserted as open');
select throws_ok(format($$ insert into public.tasks (workspace_id, title, status, origin)
  values (%L, 'x', 'proposed', 'inferred') $$, pg_temp.wsa()), '23514', null,
  'A17: an AI-proposed task needs a commitment');
select throws_ok(format($$ update public.commitments set origin = 'user_stated' where id = %L $$, pg_temp.id('c1')), '23514', null,
  'A22: origin can never change');
select throws_ok(format($$ update public.conversations set workspace_id = %L where id = %L $$, pg_temp.wsb(), pg_temp.id('conv')), null, null,
  'S18: workspace_id can never change');

-- ---------------------------------------------------------------- deletion
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select public.soft_delete_conversation(pg_temp.id('conv'));
select is((select count(*)::int from public.conversation_participants), 0, 'A24: participants disappear with their conversation');
select is((select count(*)::int from public.search_messages(pg_temp.wsa(), 'deck')), 0, 'A24: and the messages leave retrieval');

select public.request_account_deletion();
select ok((select count(*) from public.commitments) + (select count(*) from public.tasks) + (select count(*) from public.contacts)
          + (select count(*) from public.ai_usage_daily) = 0, 'S36: after a deletion request no workspace data is visible');
select is(public.create_task(pg_temp.wsa(), 'after deletion') ->> 'status', 'not_found', 'S36: and nothing can be added');

select * from finish();
rollback;
