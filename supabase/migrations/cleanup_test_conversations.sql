create extension if not exists pgcrypto;

create table if not exists public.cleanup_operations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  criteria jsonb not null,
  removed_conversations integer not null default 0,
  removed_messages integer not null default 0
);

create table if not exists public.conversations_backup (
  operation_id uuid not null references public.cleanup_operations(id) on delete cascade,
  conversation_id uuid not null,
  row jsonb not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, conversation_id)
);

create table if not exists public.messages_backup (
  operation_id uuid not null references public.cleanup_operations(id) on delete cascade,
  message_id uuid not null,
  row jsonb not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, message_id)
);

alter table public.cleanup_operations enable row level security;
alter table public.conversations_backup enable row level security;
alter table public.messages_backup enable row level security;

create or replace function public.is_test_text(p_text text)
returns boolean
language sql
immutable
as $$
  select
    p_text is not null and (
      lower(p_text) like '%mensagem teste%'
      or lower(p_text) like '%webhook sync%'
      or lower(p_text) like '%teste envio%'
      or lower(p_text) like '%fdssd%'
      or lower(p_text) like '%dsfd%'
      or lower(p_text) like '%asdf%'
      or lower(p_text) like '%oiii%'
    );
$$;

create or replace function public.identify_test_conversation_ids()
returns table (id uuid)
language sql
stable
as $$
  select c.id
  from public.conversations c
  where
    c.phone is null
    or c.avatar_url like '/avatars/%'
    or c.contact_name in ('João Silva', 'Maria Santos', 'Pedro Oliveira')
    or lower(c.contact_name) like '%teste%'
    or public.is_test_text(c.last_message)
    or exists (
      select 1
      from public.messages m
      where m.conversation_id = c.id
        and public.is_test_text(m.text)
    );
$$;

create or replace function public.cleanup_test_conversations(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_operation_id uuid;
  v_conv_ids uuid[];
  v_removed_conversations integer := 0;
  v_removed_messages integer := 0;
  v_criteria jsonb;
begin
  select array_agg(id) into v_conv_ids from public.identify_test_conversation_ids();
  if v_conv_ids is null then
    v_conv_ids := array[]::uuid[];
  end if;

  v_criteria := jsonb_build_object(
    'phone_is_null', true,
    'avatar_url_like', '/avatars/%',
    'contact_name_seeded', jsonb_build_array('João Silva', 'Maria Santos', 'Pedro Oliveira'),
    'contact_name_like', '%teste%',
    'message_keywords', jsonb_build_array('mensagem teste', 'webhook sync', 'teste envio', 'fdssd', 'dsfd', 'asdf', 'oiii')
  );

  if p_dry_run then
    select count(*) into v_removed_messages from public.messages where conversation_id = any(v_conv_ids);
    select count(*) into v_removed_conversations from public.conversations where id = any(v_conv_ids);

    return jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'candidate_conversations', v_removed_conversations,
      'candidate_messages', v_removed_messages,
      'criteria', v_criteria
    );
  end if;

  insert into public.cleanup_operations (criteria) values (v_criteria) returning id into v_operation_id;

  insert into public.conversations_backup (operation_id, conversation_id, row)
  select v_operation_id, c.id, to_jsonb(c)
  from public.conversations c
  where c.id = any(v_conv_ids);

  insert into public.messages_backup (operation_id, message_id, row)
  select v_operation_id, m.id, to_jsonb(m)
  from public.messages m
  where m.conversation_id = any(v_conv_ids);

  delete from public.messages where conversation_id = any(v_conv_ids);
  get diagnostics v_removed_messages = row_count;

  delete from public.conversations where id = any(v_conv_ids);
  get diagnostics v_removed_conversations = row_count;

  update public.cleanup_operations
  set removed_conversations = v_removed_conversations,
      removed_messages = v_removed_messages
  where id = v_operation_id;

  return jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'operation_id', v_operation_id,
    'removed_conversations', v_removed_conversations,
    'removed_messages', v_removed_messages,
    'criteria', v_criteria
  );
end;
$$;

create or replace function public.restore_cleanup_operation(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_restored_conversations integer := 0;
  v_restored_messages integer := 0;
begin
  insert into public.conversations
  select (jsonb_populate_record(null::public.conversations, b.row)).*
  from public.conversations_backup b
  where b.operation_id = p_operation_id
  on conflict (id) do nothing;
  get diagnostics v_restored_conversations = row_count;

  insert into public.messages
  select (jsonb_populate_record(null::public.messages, b.row)).*
  from public.messages_backup b
  where b.operation_id = p_operation_id
  on conflict (id) do nothing;
  get diagnostics v_restored_messages = row_count;

  return jsonb_build_object(
    'ok', true,
    'operation_id', p_operation_id,
    'restored_conversations', v_restored_conversations,
    'restored_messages', v_restored_messages
  );
end;
$$;

revoke all on function public.cleanup_test_conversations(boolean) from public;
revoke all on function public.restore_cleanup_operation(uuid) from public;
revoke all on function public.identify_test_conversation_ids() from public;
revoke all on function public.is_test_text(text) from public;

grant execute on function public.cleanup_test_conversations(boolean) to service_role;
grant execute on function public.restore_cleanup_operation(uuid) to service_role;
grant execute on function public.identify_test_conversation_ids() to service_role;
grant execute on function public.is_test_text(text) to service_role;

