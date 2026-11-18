-- M3 Communication Studio tables: isolation, protected columns, soft delete, citations, usage ledger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

-- ---------------------------------------------------------------- user A imports
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
insert into ids select 'conv', (public.import_conversation(
  (select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'Pilot timing', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"Priya@Example.com","sent_at":"2026-03-12T09:14:00Z","body":"Could you send the deck by Friday?","direction":"inbound"},
    {"sender_name":"Me","sender_email":"a@example.com","body":"Sure.","direction":"outbound"}]'::jsonb) ->> 'conversation_id')::uuid;
select ok((select v from ids where k = 'conv') is not null, 'member can import a conversation');
select is((select count(*)::int from public.messages where conversation_id = (select v from ids where k = 'conv')), 2,
  'messages stored in order');
select is((select sender_email from public.messages where position = 1 and conversation_id = (select v from ids where k = 'conv')),
  'priya@example.com', 'sender email normalised');
select is(public.import_conversation((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'Again', 'paste', null,
  '[{"sender_name":"Priya","sender_email":"Priya@Example.com","sent_at":"2026-03-12T09:14:00Z","body":"Could you send the deck by Friday?","direction":"inbound"},
    {"sender_name":"Me","sender_email":"a@example.com","body":"Sure.","direction":"outbound"}]'::jsonb) ->> 'status',
  'duplicate', 're-importing the same thread is reported, not duplicated');
select is(public.import_conversation((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), '', 'paste', null, '[]'::jsonb) ->> 'status',
  'invalid', 'empty imports are rejected');

insert into ids select 'msg', id from public.messages where position = 1 and conversation_id = (select v from ids where k = 'conv');
insert into public.thread_analyses (workspace_id, conversation_id, analysis, ai_provider, ai_model, prompt_version, input_tokens, output_tokens)
  select (select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), (select v from ids where k = 'conv'),
         '{"intent":"x"}', 'test', 'scripted-1', 'analyze-email@1', 10, 5;
insert into ids select 'analysis', id from public.thread_analyses where conversation_id = (select v from ids where k = 'conv');
insert into public.citations (workspace_id, thread_analysis_id, message_id, quote)
  select (select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), (select v from ids where k = 'analysis'), (select v from ids where k = 'msg'), 'by Friday';
insert into public.drafts (workspace_id, conversation_id, content, tone, length)
  select (select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), (select v from ids where k = 'conv'), 'Hi Priya', 'warm', 'short';
insert into ids select 'draft', id from public.drafts where conversation_id = (select v from ids where k = 'conv');
select ok((select count(*) from public.citations) = 1, 'citation linking analysis to message is stored');

update public.drafts set content = 'Hi Priya, deck on Friday.', edited_by_user = true where id = (select v from ids where k = 'draft');
select is((select content from public.drafts where id = (select v from ids where k = 'draft')), 'Hi Priya, deck on Friday.', 'member can edit a draft');
select throws_ok($$ update public.drafts set status = 'approved' $$, '42501', null, 'draft status is not directly writable');
select throws_ok($$ update public.messages set body_text = 'changed' $$, '42501', null, 'messages are immutable');
select throws_ok($$ update public.conversations set workspace_id = gen_random_uuid() $$, '42501', null, 'workspace_id is not writable');
select throws_ok($$ delete from public.conversations $$, '42501', null, 'hard delete is revoked');
select throws_ok($$ insert into public.drafts (workspace_id, conversation_id, content, tone, length, status)
  select workspace_id, conversation_id, 'x', 'warm', 'short', 'approved' from public.drafts limit 1 $$,
  '42501', null, 'drafts cannot be inserted as approved');

-- ---------------------------------------------------------------- user B is isolated
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.conversations), 0, 'another user sees no conversations');
select is((select count(*)::int from public.messages), 0, 'another user sees no messages');
select is((select count(*)::int from public.citations), 0, 'another user sees no citations');
select throws_ok($$ select public.import_conversation((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'x', 'paste', null,
  '[{"body":"hi","direction":"unknown"}]'::jsonb) $$, '42501', null, 'cannot import into another workspace');
select is(public.soft_delete_conversation((select v from ids where k = 'conv')) ->> 'status', 'not_found', 'cannot delete another user''s conversation');
select throws_ok($$ select public.record_ai_usage((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 1, 1, 1) $$,
  '42501', null, 'cannot record usage on another workspace');
-- B's own analysis cannot cite A's message (composite workspace FK)
insert into ids select 'conv_b', (public.import_conversation((select workspace_id from ws where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  'B thread', 'paste', null, '[{"body":"hello","direction":"unknown"}]'::jsonb) ->> 'conversation_id')::uuid;
insert into public.thread_analyses (workspace_id, conversation_id, analysis, ai_provider, ai_model, prompt_version, input_tokens, output_tokens)
  select (select workspace_id from ws where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'), (select v from ids where k = 'conv_b'), '{}', 'test', 'm', 'analyze-email@1', 1, 1;
select throws_ok($$ insert into public.citations (workspace_id, thread_analysis_id, message_id)
  select (select workspace_id from ws where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
         (select id from public.thread_analyses limit 1), (select v from ids where k = 'msg') $$,
  '23503', null, 'citations cannot point at another workspace''s message');

-- ---------------------------------------------------------------- usage ledger
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
select is(public.record_ai_usage((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 1000, 200, 8000), 8000::bigint, 'usage is recorded');
select is(public.record_ai_usage((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 10, 2, 100), 8100::bigint, 'usage accumulates per day');
select throws_ok($$ select public.record_ai_usage((select workspace_id from ws where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), -1, 0, 0) $$,
  '22023', null, 'negative usage is rejected');
select throws_ok($$ insert into public.ai_usage_daily (workspace_id, day) values (gen_random_uuid(), current_date) $$,
  '42501', null, 'the ledger is not directly writable');

-- ---------------------------------------------------------------- soft delete hides everything derived
select is(public.soft_delete_conversation((select v from ids where k = 'conv')) ->> 'status', 'deleted', 'owner can delete a conversation');
select ok((select count(*) from public.messages) = 0 and (select count(*) from public.thread_analyses) = 0
          and (select count(*) from public.drafts) = 0 and (select count(*) from public.citations) = 0,
  'messages, analyses, drafts and citations disappear with the conversation');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'conversation.deleted' and actor_user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  'deletion is audited');

select * from finish();
rollback;
