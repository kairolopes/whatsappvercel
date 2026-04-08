alter table public.clients
add column if not exists last_boleto_list jsonb not null default '[]'::jsonb,
add column if not exists last_boleto_list_at timestamptz;

