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

