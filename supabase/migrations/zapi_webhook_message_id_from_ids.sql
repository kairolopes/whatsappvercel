create or replace function public.insert_zapi_webhook_event(p_secret text, p_payload jsonb)
returns boolean
language plpgsql
security definer
as $$
declare
  expected_hash text;
  incoming_hash text;
  v_event_type text;
  v_phone text;
  v_from_me boolean;
  v_message_id text;
begin
  select value_hash into expected_hash from public.app_secrets where key = 'zapi_webhook_secret';
  if expected_hash is null then
    return false;
  end if;

  incoming_hash := encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  if incoming_hash <> expected_hash then
    return false;
  end if;

  v_event_type := nullif(p_payload->>'type', '');
  v_phone := nullif(p_payload->>'phone', '');

  v_message_id := nullif(p_payload->>'messageId', '');
  if v_message_id is null then
    if jsonb_typeof(p_payload->'ids') = 'array' then
      v_message_id := nullif((p_payload->'ids'->>0), '');
    end if;
  end if;

  v_from_me := null;
  if (p_payload ? 'fromMe') then
    begin
      v_from_me := (p_payload->>'fromMe')::boolean;
    exception when others then
      v_from_me := null;
    end;
  end if;

  insert into public.zapi_webhook_events (event_type, phone, from_me, message_id, payload)
  values (v_event_type, v_phone, v_from_me, v_message_id, p_payload);

  return true;
end;
$$;

