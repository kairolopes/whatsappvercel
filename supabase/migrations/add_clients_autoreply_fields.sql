alter table public.clients
add column if not exists last_auto_reply_at timestamptz,
add column if not exists last_auto_reply_to text;

