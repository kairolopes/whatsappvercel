do $$
declare
  last_op uuid;
  r_restore jsonb;
  r_cleanup jsonb;
  op_id uuid;
begin
  select operation_id into last_op
  from public.cleanup_last_result
  order by created_at desc
  limit 1;

  if last_op is null then
    return;
  end if;

  r_restore := public.restore_cleanup_operation(last_op);

  r_cleanup := public.cleanup_test_conversations(false);
  op_id := null;
  begin
    op_id := (r_cleanup->>'operation_id')::uuid;
  exception when others then
    op_id := null;
  end;

  insert into public.cleanup_last_result (operation_id, removed_conversations, removed_messages, criteria)
  values (
    op_id,
    coalesce((r_cleanup->>'removed_conversations')::int, 0),
    coalesce((r_cleanup->>'removed_messages')::int, 0),
    coalesce(r_cleanup->'criteria', '{}'::jsonb)
  );
end $$;

