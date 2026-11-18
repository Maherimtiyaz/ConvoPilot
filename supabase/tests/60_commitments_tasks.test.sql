-- M5 commitments and tasks: proposals need evidence, only the user decides, atomic approval,
-- evidence follows source deletion, isolation. Synthetic data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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
grant select, insert, update on ids to authenticated;
create function pg_temp.wsa() returns uuid language sql as $$ select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' $$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.wsa() to authenticated;
grant execute on function pg_temp.id(text) to authenticated;

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select public.save_contact(pg_temp.wsa(), 'Priya Shah', 'priya@example.com');
insert into ids select 'conv', (public.import_conversation(pg_temp.wsa(), 'Deck', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","body":"Could you send the revised deck by Friday?","direction":"inbound"},
    {"sender_name":"Ada","sender_email":"a@example.com","body":"Sounds good, I will send it Friday.","direction":"outbound"}]'::jsonb) ->> 'conversation_id')::uuid;
insert into ids select 'm1', id from public.messages where conversation_id = pg_temp.id('conv') and position = 1;
insert into ids select 'm2', id from public.messages where conversation_id = pg_temp.id('conv') and position = 2;

create function pg_temp.items(p_quote text, p_desc text default 'Send Priya the revised deck') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'description', p_desc, 'owner', 'me', 'origin', 'extracted', 'confidence', 'high',
    'due_date', null, 'due_text', 'Friday',
    'citations', jsonb_build_array(jsonb_build_object('message_id', pg_temp.id('m2'), 'quote', p_quote)),
    'task', jsonb_build_object('title', 'Send the revised deck')));
$$;
grant execute on function pg_temp.items(text, text) to authenticated;

-- ---------------------------------------------------------------- storing proposals
select is(public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'), pg_temp.items('I will send it Friday'), '{"provider":"test","model":"m","prompt_version":"x@1"}') ->> 'created',
  '1', 'a cited proposal is stored');
insert into ids select 'c1', id from public.commitments;
insert into ids select 't1', id from public.tasks;
select is((select status || '/' || origin || '/' || evidence_state from public.commitments where id = pg_temp.id('c1')), 'proposed/extracted/supported',
  'AI commitments start proposed and supported');
select is((select status from public.tasks where id = pg_temp.id('t1')), 'proposed', 'the linked task starts proposed');
select is((select contact_id from public.commitments where id = pg_temp.id('c1')), (select id from public.contacts limit 1),
  'the commitment is linked to the other person in the thread');
select is((select count(*)::int from public.citations where commitment_id = pg_temp.id('c1')), 1, 'its citation is stored');
select is((select due_text_raw from public.commitments where id = pg_temp.id('c1')), 'Friday', 'an unclear date stays as text, no date invented');

select is(public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'), pg_temp.items('words that are not there', 'Something invented'), '{}') ->> 'unsupported',
  '1', 'a proposal whose quote is not in the message is refused');
select is(public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'), pg_temp.items('I will send it Friday', '  send PRIYA the revised   deck '), '{}') ->> 'duplicates',
  '1', 'the same commitment is not proposed twice');
select is(public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'),
  jsonb_build_array(jsonb_build_object('description', 'x', 'owner', 'me', 'origin', 'user_stated', 'citations', '[]'::jsonb)), '{}') ->> 'status',
  'invalid', 'the AI path cannot create user-stated records');
select is((select count(*)::int from public.commitments), 1, 'nothing else was stored');

-- ---------------------------------------------------------------- the API cannot write these tables
select throws_ok($$ insert into public.commitments (workspace_id, conversation_id, description, owner, origin, status)
  values (pg_temp.wsa(), pg_temp.id('conv'), 'x', 'me', 'extracted', 'confirmed') $$, '42501', null, 'commitments cannot be inserted directly');
select throws_ok($$ update public.commitments set status = 'confirmed' $$, '42501', null, 'status cannot be updated directly');
select throws_ok($$ update public.tasks set status = 'open' $$, '42501', null, 'task status cannot be updated directly');
select throws_ok($$ insert into public.citations (workspace_id, commitment_id, message_id, quote)
  values (pg_temp.wsa(), pg_temp.id('c1'), pg_temp.id('m1'), 'Could you') $$, '42501', null, 'commitment citations cannot be added directly');
select throws_ok($$ delete from public.tasks $$, '42501', null, 'hard delete is revoked');

-- ---------------------------------------------------------------- isolation
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.commitments) + (select count(*)::int from public.tasks), 0, 'another user sees no commitments or tasks');
select is(public.decide_proposal('commitment', pg_temp.id('c1'), 'confirm') ->> 'status', 'not_found', 'another user cannot confirm');
select is(public.approve_task(pg_temp.id('t1'), true) ->> 'status', 'not_found', 'another user cannot approve');
select is(public.set_task_status(pg_temp.id('t1'), 'done') ->> 'status', 'not_found', 'another user cannot complete');
select is(public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv'), pg_temp.items('I will send it Friday', 'Other'), '{}') ->> 'status',
  'not_found', 'another user cannot propose into this workspace');
select is(public.create_task(pg_temp.wsa(), 'Intrude') ->> 'status', 'not_found', 'another user cannot add tasks here');

-- ---------------------------------------------------------------- decisions
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select is(public.decide_proposal('task', pg_temp.id('t1'), 'confirm') ->> 'status', 'invalid_transition', 'tasks are approved only through approve_task');
select is(public.approve_task(pg_temp.id('t1'), false) ->> 'status', 'commitment_not_confirmed', 'approval needs a confirmed commitment');
select is((select status from public.commitments where id = pg_temp.id('c1')) || '/' || (select status from public.tasks where id = pg_temp.id('t1')),
  'proposed/proposed', 'a refused approval changes nothing');
select is(public.approve_task(pg_temp.id('t1'), true) ->> 'status', 'ok', 'approving with confirmation works');
select is((select status from public.commitments where id = pg_temp.id('c1')) || '/' || (select status from public.tasks where id = pg_temp.id('t1')),
  'confirmed/open', 'commitment confirmed and task opened together');
select ok((select decided_by = 'aaaaaaaa-0000-0000-0000-00000000000a' and decided_at is not null from public.commitments where id = pg_temp.id('c1')),
  'the decision is attributed to the user');
select is(public.decide_proposal('commitment', pg_temp.id('c1'), 'reject') ->> 'status', 'invalid_transition', 'a confirmed commitment cannot be rejected');
select is(public.set_task_status(pg_temp.id('t1'), 'done') ->> 'status', 'ok', 'an open task can be completed');
select is(public.set_task_status(pg_temp.id('t1'), 'open') ->> 'status', 'ok', 'a completed task can be reopened');
select is(public.create_task(pg_temp.wsa(), 'Book flights', '2026-12-01', 'high') ->> 'status', 'created', 'the user can add their own task');
select is((select status || '/' || origin from public.tasks where title = 'Book flights'), 'open/user_stated', 'it is open and user-stated');

-- ---------------------------------------------------------------- rejection and evidence
insert into ids select 'conv2', (public.import_conversation(pg_temp.wsa(), 'Pilot', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"priya@example.com","body":"Can the pilot start in March? Please confirm by Monday.","direction":"inbound"}]'::jsonb) ->> 'conversation_id')::uuid;
insert into ids select 'p1', id from public.messages where conversation_id = pg_temp.id('conv2');
select public.store_commitment_proposals(pg_temp.wsa(), pg_temp.id('conv2'), jsonb_build_array(
  jsonb_build_object('description', 'Confirm the pilot start date', 'owner', 'me', 'origin', 'extracted', 'due_text', 'Monday',
    'citations', jsonb_build_array(jsonb_build_object('message_id', pg_temp.id('p1'), 'quote', 'Please confirm by Monday')),
    'task', jsonb_build_object('title', 'Confirm pilot date'))), '{}');
insert into ids select 'c2', id from public.commitments where conversation_id = pg_temp.id('conv2');
select public.decide_proposal('commitment', pg_temp.id('c2'), 'reject');
select is((select status from public.tasks where commitment_id = pg_temp.id('c2')), 'rejected', 'rejecting a commitment rejects its proposed task');

select public.soft_delete_conversation(pg_temp.id('conv'));
select is((select evidence_state || '/' || status from public.commitments where id = pg_temp.id('c1')), 'sources_hidden/confirmed',
  'deleting the source hides the evidence but never changes the decision');

select * from finish();
rollback;
