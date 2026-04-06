# Limpeza de conversas de teste

Este projeto inclui um processo reversível para remover conversas de teste do Supabase sem afetar conversas reais.

## O que é removido

Uma conversa é classificada como **teste** quando atende a pelo menos um dos critérios:

- `conversations.phone is null`
- `conversations.avatar_url` começa com `/avatars/` (dados mock iniciais)
- `conversations.contact_name` igual a `João Silva`, `Maria Santos`, `Pedro Oliveira`
- `conversations.contact_name` contém `teste`
- `last_message` ou algum `messages.text` contém palavras-chave típicas de teste (ex.: `mensagem teste`, `webhook sync`, `teste envio`, `asdf`)

## Backup e auditoria

Antes de excluir, as linhas são copiadas para:

- `cleanup_operations`
- `conversations_backup`
- `messages_backup`

## Como executar

Rodar dry-run (sem excluir):

```bash
node scripts/cleanup-test-conversations.mjs
```

Executar de verdade (com backup):

```bash
node scripts/cleanup-test-conversations.mjs --execute
```

Ambos requerem:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Como restaurar

Use a `operation_id` gerada no relatório em `docs/audit/`:

```sql
select public.restore_cleanup_operation('<operation_id>');
```

