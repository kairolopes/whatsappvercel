alter table public.conversations
  add column if not exists phone text;

create unique index if not exists conversations_phone_uniq on public.conversations (phone);

alter table public.messages
  add column if not exists external_id text;

create unique index if not exists messages_conversation_external_id_uniq
  on public.messages (conversation_id, external_id)
  where external_id is not null;

