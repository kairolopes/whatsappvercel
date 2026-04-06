# Especificação de Design de Páginas — Envio de Mídia e Reações (padrão WhatsApp Business)

## Global Styles (tokens e padrões)
- Layout: desktop-first com “app shell” em 2 colunas (lista à esquerda + painel de conversa à direita). Responsivo: abaixo de ~900px, colapsar para 1 coluna (lista -> conversa em navegação por rota).
- Cores (referência visual WhatsApp Business):
  - Background app: tons escuros (ex.: #0B141A / #111B21)
  - Superfícies: #202C33 (headers), #111B21 (painéis)
  - Bolha enviada: verde escuro (ex.: #005C4B) / recebida: cinza (ex.: #202C33)
  - Acento (ações): verde WhatsApp (ex.: #00A884)
  - Texto primário: #E9EDEF; secundário: #8696A0
- Tipografia: escala simples 12/14/16px; timestamps em 11–12px; títulos 15–16px.
- Botões/ícones: ícones com hit-area mínima 40x40; hover com fundo sutil; foco com outline visível.
- Animações: transições rápidas (120–180ms) para hover/menus; upload/progresso com indicadores discretos.

## Página 1 — Lista de conversas
### Layout
- CSS Grid: `grid-template-columns: 360px 1fr;` (painel direito como placeholder).

### Meta Information
- Title: "Conversas"
- Description: "Lista de conversas e acesso rápido ao chat."
- Open Graph: título/descrição coerentes com o app.

### Page Structure
1. Coluna esquerda (fixa): cabeçalho + busca + lista.
2. Coluna direita (flexível): estado vazio.

### Sections & Components
- Header da lista
  - Título (ex.: “Conversas”) + ações (menu/novo chat se já existir no produto).
- Busca
  - Input com ícone; filtra lista em tempo real.
- Lista de chats
  - Item: avatar, nome, última mensagem (preview), horário, badge de não lidas (se existir).
  - Estados: hover, selecionado, carregando.
- Estado vazio (painel direito)
  - Ilustração/placeholder + texto curto, mantendo a linguagem e o espaçamento do WhatsApp Business.

## Página 2 — Tela de conversa
### Layout
- Mesmo app shell; painel direito vira o chat.
- Painel do chat em Flexbox vertical: Header (fixo) + MessageList