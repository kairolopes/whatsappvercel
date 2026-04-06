drop index if exists public.messages_conversation_external_id_uniq;

create unique index if not exists messages_conversation_external_id_uniq
  on public.messages (conversation_id, external_id);

