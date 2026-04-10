BEGIN;

-- conversations: ensure unique per tenant+phone
WITH ranked AS (
  SELECT
    id,
    condominio_id,
    phone,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY condominio_id, phone ORDER BY created_at DESC, id DESC) AS rn
  FROM public.conversations
  WHERE condominio_id IS NOT NULL AND phone IS NOT NULL
)
DELETE FROM public.conversations c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_conversations_condominio_phone'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_conversations_condominio_phone ON public.conversations (condominio_id, phone)';
  END IF;
END $$;

-- messages: avoid duplicates per tenant+conversation+external_id when external_id exists
WITH ranked AS (
  SELECT
    id,
    condominio_id,
    conversation_id,
    external_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY condominio_id, conversation_id, external_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.messages
  WHERE condominio_id IS NOT NULL AND conversation_id IS NOT NULL AND external_id IS NOT NULL AND external_id <> ''
)
DELETE FROM public.messages m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_messages_condominio_conversation_external'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_messages_condominio_conversation_external ON public.messages (condominio_id, conversation_id, external_id) WHERE external_id IS NOT NULL AND external_id <> ''''';
  END IF;
END $$;

COMMIT;

