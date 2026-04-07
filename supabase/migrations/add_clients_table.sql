create table if not exists public.clients (
  phone text primary key,
  status smallint not null default 2 check (status in (1, 2)),
  whatsapp_name text,
  whatsapp_photo_url text,
  unit_id text,
  block text,
  apartment text,
  matched boolean not null default false,
  match_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

alter table public.clients enable row level security;

revoke all on table public.clients from anon;
revoke all on table public.clients from authenticated;
grant all on table public.clients to service_role;

