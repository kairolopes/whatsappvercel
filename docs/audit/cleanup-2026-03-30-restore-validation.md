# Validação de reversão + nova limpeza

Este registro valida que o processo é reversível:

1) Foi executado `restore_cleanup_operation()` do último lote.
2) Em seguida, foi executado `cleanup_test_conversations(false)` novamente para manter o ambiente limpo.

- Data/hora (UTC): 2026-03-30T18:10:54.531032Z
- operation_id (nova limpeza): 989c1bb8-a2bb-461d-b940-e8d4ecc7096f
- Conversas removidas: 5
- Mensagens removidas: 27

## Reversão

Para restaurar este lote (service_role):

```sql
select public.restore_cleanup_operation('989c1bb8-a2bb-461d-b940-e8d4ecc7096f');
```

