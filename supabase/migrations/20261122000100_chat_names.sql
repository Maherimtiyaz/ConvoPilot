-- W2 follow-up — the names the user appears under in chat exports (docs/WHATSAPP.md §1).
-- WhatsApp exports carry names but no email addresses, so the user lists the name(s) WhatsApp
-- shows for them; messages from those names count as sent by the user. Up to 5 names, each
-- 1–100 characters without control characters (normalised by the app; the database enforces the
-- bounds). The check is a plain expression: a helper function would need EXECUTE for every user
-- who updates workspace_settings.
alter table public.workspace_settings add column chat_names text[] not null default '{}'
  check (
    cardinality(chat_names) <= 5
    and array_position(chat_names, null) is null
    and (
      cardinality(chat_names) = 0
      or array_to_string(chat_names, chr(10)) ~ '^[^[:cntrl:]]{1,100}(\n[^[:cntrl:]]{1,100}){0,4}$'
    )
  );
grant update (chat_names) on public.workspace_settings to authenticated;
