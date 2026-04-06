create table if not exists public.cleanup_last_result (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  operation_id uuid,
  removed_conversations integer not null,
  removed_messages integer not null,
  criteria jsonb not null
);

alter table public.cleanup_last_result enable row level security;

do $$
declare
  r jsonb;
  op_id uuid;
begin
  r := public.cleanup_test_conversations(false);
  op_id := null;
  begin
    op_id := (r->>'operation_id')::uuid;
  exception when others then
    op_id := null;
  end;

  insert into public.cleanup_last_result (operation_id, removed_conversations, removed_messages, criteria)
  values (
    op_id,
    coalesce((r->>'removed_conversations')::int, 0),
    coalesce((r->>'removed_messages')::int, 0),
    coalesce(r->'criteria', '{}'::jsonb)
  );
end $$;

drop policy if exists cleanup_last_result_read on public.cleanup_last_result;
create policy cleanup_last_result_read on public.cleanup_last_result
for select to anon
using (true);

