create table if not exists public.zapi_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  phone text,
  from_me boolean,
  message_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.zapi_webhook_events enable row level security;

create index if not exists zapi_webhook_events_created_at_idx on public.zapi_webhook_events (created_at desc);
create index if not exists zapi_webhook_events_phone_idx on public.zapi_webhook_events (phone);

