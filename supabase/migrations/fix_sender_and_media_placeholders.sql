create index if not exists zapi_webhook_events_phone_message_id_idx
  on public.zapi_webhook_events (phone, message_id);

update public.messages m
set sender = 'user'
from public.conversations c
where m.conversation_id = c.id
  and m.sender = 'other'
  and m.external_id is not null
  and exists (
    select 1
    from public.zapi_webhook_events e
    where e.phone = c.phone
      and e.message_id = m.external_id
      and e.from_me is true
  );

update public.messages
set text = case
  when kind = 'image' then '📷 Foto'
  when kind = 'video' then '🎥 Vídeo'
  when kind = 'ptv' then '🎥 PTV'
  when kind = 'audio' then '🎵 Áudio'
  when kind = 'sticker' then '🧩 Figurinha'
  when kind = 'gif' then 'GIF'
  when kind = 'document' then
    case
      when (meta->>'fileName') is not null and length(meta->>'fileName') > 0 then '📄 ' || (meta->>'fileName')
      else '📄 Documento'
    end
  else text
end
where kind <> 'text'
  and lower(text) like '%mensagem%'
  and lower(text) like '%suport%';

