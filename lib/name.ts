function normalizeText(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyPlaceholderName(input: string) {
  const s = normalizeText(input);
  if (!s) return true;
  const banned = [
    'sindico',
    'síndico',
    'administracao',
    'administracao',
    'administrador',
    'porteiro',
    'atendimento',
    'suporte',
    'bot',
    'assistente',
    'usuario',
    'user',
    'unknown',
    'sem nome',
    'nome',
    'nomeperfil',
    'perfil',
  ];
  if (banned.some((w) => s === w || s.includes(w))) return true;
  if (/(\bx\b)$/.test(s)) return true;
  return false;
}

function isLikelyMessageAsName(input: string) {
  const s = normalizeText(input);
  if (!s) return false;
  const stop = ['quero', 'preciso', 'pagar', 'boleto', 'reserva', 'administracao', 'sindico', 'duvida', 'regimento', 'convencao', 'condominio'];
  if (stop.some((w) => s.includes(w))) return true;
  if (s.split(' ').length >= 4) return true;
  return false;
}

export function isValidPersonName(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return false;
  if (raw.length > 40) return false;
  if (isLikelyPlaceholderName(raw)) return false;
  if (isLikelyMessageAsName(raw)) return false;
  const cleaned = raw.replace(/[^A-Za-zÀ-ÿ\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length > 3) return false;
  if (parts[0].length < 2) return false;
  return true;
}

export function firstName(input: string) {
  const cleaned = String(input || '').replace(/[^A-Za-zÀ-ÿ\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  return parts.length ? parts[0] : '';
}

