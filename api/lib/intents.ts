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
  if (s.includes('taxa condominial') || s.includes('taxa do condominio') || s.includes('taxa do condomínio')) return true;
  if (s.includes('condominial')) return true;
  if (s.includes('mensalidade') || s.includes('mensal')) return true;
  if (s.includes('fatura')) return true;
  if (s.includes('pagamento') || s.includes('pagar')) return true;
  if (s.includes('pix')) return true;
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
  if (s === '4') return true;
  if (s.includes('regimento')) return true;
  if (s.includes('convencao') || s.includes('convenção')) return true;
  if (s.includes('duvida') || s.includes('dúvida')) return true;
  if (s.includes('condominio') || s.includes('condomínio')) return true;
  return false;
}

function isAdminIntent(text: string) {
  const s = simplifyText(text);
  if (!s) return false;
  if (s === '3') return true;
  if (s.includes('administracao') || s.includes('administração')) return true;
  if (s.includes('administrador')) return true;
  if (s.includes('falar com')) return true;
  if (s.includes('sindico') || s.includes('síndico')) return true;
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

function isLinkingIssue(text: string) {
  const s = simplifyText(text);
  if (!s) return false;
  if (s.includes('nao esta vinculado') || s.includes('não está vinculado')) return true;
  if (s.includes('nao esta vinculada') || s.includes('não está vinculada')) return true;
  if (s.includes('nao sou desse apartamento') || s.includes('não sou desse apartamento')) return true;
  if (s.includes('apartamento errado') || s.includes('bloco errado')) return true;
  if (s.includes('corrigir cadastro') || s.includes('atualizar cadastro')) return true;
  if (s.includes('vincular minha conta') || s.includes('vincular')) return true;
  return false;
}

function isMenuRequest(text: string) {
  const s = simplifyText(text);
  return s === 'menu' || s === 'opcoes' || s === 'opcoes do menu' || s === 'opcao' || s === 'opções' || s === 'opções do menu';
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
  isMenuRequest,
  isLinkingIssue,
};
