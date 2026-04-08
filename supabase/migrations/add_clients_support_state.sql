alter table public.clients
add column if not exists support_state text,
add column if not exists support_topic text,
add column if not exists support_started_at timestamptz;

