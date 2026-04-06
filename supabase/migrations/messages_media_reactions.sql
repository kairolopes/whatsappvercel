alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  message_external_id text not null,
  emoji text not null,
  from_me boolean,
  created_at timestamptz not null default now()
);

create index if not exists message_reactions_conversation_message_idx
  on public.message_reactions (conversation_id, message_external_id);

grant select on public.message_reactions to anon;
grant all privileges on public.message_reactions to authenticated;
