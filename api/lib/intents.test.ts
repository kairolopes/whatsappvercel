import { describe, expect, test } from 'vitest';

import {
  isAdminIntent,
  isAffirmative,
  isBoletoIntent,
  isCancel,
  isLinkingIssue,
  isMenuRequest,
  isNegative,
  isRegimentoIntent,
  isReservaIntent,
} from './intents';

describe('intents', () => {
  test('boleto intent', () => {
    expect(isBoletoIntent('1')).toBe(true);
    expect(isBoletoIntent('um')).toBe(true);
    expect(isBoletoIntent('boleto')).toBe(true);
    expect(isBoletoIntent('2 via boleto')).toBe(true);
    expect(isBoletoIntent('segunda via')).toBe(true);
    expect(isBoletoIntent('quero pagar minha taxa mensal')).toBe(true);
    expect(isBoletoIntent('taxa condominial')).toBe(true);
    expect(isBoletoIntent('quero pagar via pix')).toBe(true);
    expect(isBoletoIntent('reserva')).toBe(false);
  });

  test('reserva intent', () => {
    expect(isReservaIntent('2')).toBe(true);
    expect(isReservaIntent('dois')).toBe(true);
    expect(isReservaIntent('reserva de ambientes')).toBe(true);
    expect(isReservaIntent('churrasqueira')).toBe(true);
    expect(isReservaIntent('boleto')).toBe(false);
  });

  test('docs intent', () => {
    expect(isRegimentoIntent('4')).toBe(true);
    expect(isRegimentoIntent('quatro')).toBe(true);
    expect(isRegimentoIntent('dúvida sobre convenção')).toBe(true);
    expect(isRegimentoIntent('regimento interno')).toBe(true);
  });

  test('admin intent', () => {
    expect(isAdminIntent('3')).toBe(true);
    expect(isAdminIntent('tres')).toBe(true);
    expect(isAdminIntent('falar com a administração')).toBe(true);
  });

  test('confirm/cancel', () => {
    expect(isAffirmative('1')).toBe(true);
    expect(isAffirmative('sim')).toBe(true);
    expect(isNegative('2')).toBe(true);
    expect(isNegative('não')).toBe(true);
    expect(isCancel('cancelar')).toBe(true);
    expect(isCancel('0')).toBe(true);
  });

  test('menu request', () => {
    expect(isMenuRequest('menu')).toBe(true);
    expect(isMenuRequest('opções')).toBe(true);
    expect(isMenuRequest('opcoes')).toBe(true);
    expect(isMenuRequest('quero boleto')).toBe(false);
  });

  test('linking issue', () => {
    expect(isLinkingIssue('minha conta não está vinculada a este apartamento')).toBe(true);
    expect(isLinkingIssue('apartamento errado')).toBe(true);
    expect(isLinkingIssue('quero boleto')).toBe(false);
  });
});
