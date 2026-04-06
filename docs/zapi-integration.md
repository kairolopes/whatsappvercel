# Integração Z-API (WhatsApp)

Esta aplicação integra com a Z-API em duas camadas:

1. **SDK (TypeScript)** em `src/lib/zapi/` (tipado, com retry/backoff e erros padronizados).
2. **Endpoints serverless** em `api/zapi/*` para chamadas em produção sem expor tokens no navegador.

## Variáveis de ambiente

### Frontend (DEV/local)

Por padrão, o frontend usa o proxy `/api/zapi/*` (mesmo em `localhost`) para evitar CORS e não depender de chamar `api.z-api.io` direto.

Se você quiser forçar chamadas diretas do browser (não recomendado), habilite:

```env
VITE_ZAPI_INSTANCE=...
VITE_ZAPI_TOKEN=...
VITE_ZAPI_CLIENT_TOKEN=...

# Opcional: habilita chamadas diretas do browser.
VITE_ALLOW_DIRECT_ZAPI=true
```

Em produção, o recomendado é **não** usar essas variáveis no frontend.

### Vercel (produção)

Configure no projeto (Vercel → Settings → Environment Variables):

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

ZAPI_INSTANCE_ID=...
ZAPI_TOKEN=...
ZAPI_CLIENT_TOKEN=...

# (opcional) protege os endpoints /api/zapi/*
ADMIN_API_KEY=...
```

Observação: anexos (imagem/vídeo/áudio/documento/sticker/GIF/PTV por arquivo) dependem de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no server-side. Sem isso, o upload falha com `missing_server_env`.

## Uso no frontend

O helper `src/lib/zapi.ts` escolhe automaticamente:

- Se `VITE_ZAPI_*` existir (DEV/local) → chama a Z-API direto.
- Caso contrário (produção) → chama os endpoints `GET/POST /api/zapi/*`.

### Exemplo: enviar texto

```ts
import { zapi } from '@/lib/zapi';

await zapi.sendText('5511999999999', 'Olá!');
```

### Exemplo: enviar texto com delay e editar mensagem

```ts
import { zapi } from '@/lib/zapi';

await zapi.sendText('5511999999999', 'Digitando e enviando...', {
  delayTyping: 3,
  delayMessage: 5,
});

await zapi.sendText('5511999999999', 'Texto atualizado', {
  editMessageId: 'MESSAGE_ID_DA_MENSAGEM',
});
```

### Exemplo: reencaminhar mensagem

```ts
import { zapi } from '@/lib/zapi';

await zapi.forwardMessage('5511999999999', 'MESSAGE_ID_DA_MENSAGEM');
```

### Exemplo: leitura automática de status

```ts
import { zapi } from '@/lib/zapi';

await zapi.updateAutoReadStatus(true);
```

### Exemplo: atualizar perfil

```ts
import { zapi } from '@/lib/zapi';

await zapi.updateProfileName('Meu Nome');
await zapi.updateProfileDescription('Minha descrição');
await zapi.updateProfilePicture('https://site.com/minha-foto.jpg');
```

### Exemplo: enviar imagem

```ts
import { zapi } from '@/lib/zapi';

await zapi.sendImage('5511999999999', 'https://site.com/imagem.jpg', {
  caption: 'Confira isso',
  viewOnce: false,
});
```

### Exemplo: documento

```ts
import { zapi } from '@/lib/zapi';

await zapi.sendDocument('5511999999999', 'https://site.com/arquivo.pdf', 'pdf', {
  fileName: 'arquivo.pdf',
});
```

## Uso via endpoints (produção)

### Autenticação do proxy (recomendado)

Se `ADMIN_API_KEY` estiver configurada no Vercel, o proxy exige autenticação.

Faça login uma vez e o backend vai gravar um cookie `HttpOnly`:

`POST /api/zapi/login`

Body:

```json
{ "token": "SUA_ADMIN_API_KEY" }
```

Para sair:

`POST /api/zapi/logout`

### Enviar texto

`POST /api/zapi/send-text`

Body:

```json
{ "phone": "5511999999999", "message": "Olá" }
```

### Listar chats

`GET /api/zapi/chats`

### Buscar mensagens de um chat

`GET /api/zapi/chat-messages?phone=5511999999999`

### Requisição genérica

`POST /api/zapi/request`

Body:

```json
{ "method": "PUT", "path": "/update-webhook-received", "data": { "value": "https://..." } }
```

### Rotas adicionadas

- `PUT /api/zapi/update-auto-read-status` body `{ "value": true }`
- `PUT /api/zapi/profile-picture` body `{ "value": "https://..." }`
- `PUT /api/zapi/profile-name` body `{ "value": "Nome" }`
- `PUT /api/zapi/profile-description` body `{ "value": "Descrição" }`
- `POST /api/zapi/forward-message` body `{ "phone": "5511...", "messageId": "..." }`
- `POST /api/zapi/send-location` body `{ "phone": "...", "title": "...", "address": "...", "latitude": "...", "longitude": "..." }`
- `POST /api/zapi/send-contact` body `{ "phone": "...", "contactName": "...", "contactPhone": "..." }`
- `POST /api/zapi/send-contacts` body `{ "phone": "...", "contacts": [{ "name": "...", "phones": ["..."] }] }`
- `POST /api/zapi/send-option-list` body `{ "phone": "...", "message": "...", "optionList": { "title": "...", "buttonLabel": "...", "options": [{ "id": "1", "title": "..." }] } }`
- `POST /api/zapi/send-button-pix` body `{ "phone": "...", "pixKey": "...", "type": "EVP" }`
- `POST /api/zapi/set-read-receipts` body `{ "value": "enable" | "disable" }`

## Tratamento de erros e limites

- O SDK aplica **retry** automático em `429` e erros `5xx`, respeitando `Retry-After` quando presente.
- Os endpoints serverless possuem **rate limit best-effort** (memória), retornando `429`.

## Testes

Rodar testes:

```bash
npm test
```

Cobertura:

```bash
npm test -- --coverage
```
