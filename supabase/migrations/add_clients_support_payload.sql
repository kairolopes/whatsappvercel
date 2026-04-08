alter table public.clients
add column if not exists support_payload jsonb not null default '{}'::jsonb;

