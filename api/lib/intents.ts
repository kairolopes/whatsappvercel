function simplifyText(input: string) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return s
    .replace(/\bum\b/g, '1')
    .replace(/\bdois\b/g, '2')
    .replace(/\btres\b/g, '3')
    .replace(/\bquatro\b/g, '4')
    .trim();
}

function isMenuChoice(text: string) {
  const t = String(text || '').trim();
  return t === '1' || t === '2' || t === '3' || t === '4';
}

function isBoletoIntent(text: string) {
  const s = simplifyText(text);
  if (!s) return false;
  if (s === '1') return true;
  if (s.includes('boleto')) return true;
  if (s.includes('2 via') || s.includes('segunda via')) return true;
  return false;
}

function isReservaIntent(text: string) {
  const s = simplifyText(text);
  if (!s) return false;
  if (s === '2') return true;
  if (s.includes('reserva')) return true;
  if (s.includes('reservar')) return true;
  if (s.includes('salao') || s.includes('salão')) return true;
  if (s.includes('churrasqueira')) return true;
  if (s.includes('quadra')) return true;
  return false;
}

function isRegimentoIntent(text: string) {
  const s = simplifyText(text);
  if (!s) return false;
  if (s === '3') return true;
  if (s.includes('regimento')) return true;
  if (s.includes('convencao') || s.includes('convenção')) return true;
  if (s.includes('duvida') || s.includes('dúvida')) return true;
  return false;
}

function isAdminIntent(text: string) {
  const s = simplifyText(text);
  if (!s) return false;
  if (s === '4') return true;
  if (s.includes('administracao') || s.includes('administração')) return true;
  if (s.includes('administrador')) return true;
  if (s.includes('falar com')) return true;
  return false;
}

function isAffirmative(text: string) {
  const s = simplifyText(text);
  return s === '1' || s === 'sim' || s === 'confirmo' || s === 'ok' || s === 'isso' || s === 'correto';
}

function isNegative(text: string) {
  const s = simplifyText(text);
  return s === '2' || s === 'nao' || s === 'não' || s === 'negativo' || s === 'errado';
}

function isCancel(text: string) {
  const s = simplifyText(text);
  return s === 'cancelar' || s === 'cancela' || s === '0' || s === 'sair' || s === 'voltar';
}

export {
  simplifyText,
  isMenuChoice,
  isBoletoIntent,
  isReservaIntent,
  isRegimentoIntent,
  isAdminIntent,
  isAffirmative,
  isNegative,
  isCancel,
};
