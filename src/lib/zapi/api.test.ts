import { describe, expect, it, vi } from 'vitest';
import { ZapiClient } from './client';
import { createZapiApi } from './api';

describe('createZapiApi', () => {
  it('calls correct paths for instance/profile endpoints', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ value: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ZapiClient(
      { instanceId: 'I', token: 'T', clientToken: 'CT' },
      { fetcher },
    );
    const api = createZapiApi(client);

    await api.instance.updateAutoReadStatus(true);
    await api.instance.updateProfilePicture('https://example.com/a.png');
    await api.instance.updateProfileName('Nome');
    await api.instance.updateProfileDescription('Desc');

    const urls = fetcher.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/update-auto-read-status'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/profile-picture'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/profile-name'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/profile-description'))).toBe(true);
  });

  it('calls messaging endpoints for location, contact, contacts, option list and pix', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ZapiClient(
      { instanceId: 'I', token: 'T', clientToken: 'CT' },
      { fetcher },
    );
    const api = createZapiApi(client);

    await api.messages.sendLocation({
      phone: '5511999999999',
      title: 'Minha casa',
      address: 'Rua X, 1',
      latitude: '-23.0',
      longitude: '-46.0',
    });
    await api.messages.sendContact({ phone: '5511999999999', contactName: 'Teste', contactPhone: '5511999999999' });
    await api.messages.sendContacts({ phone: '5511999999999', contacts: [{ name: 'A', phones: ['5511999999999'] }] });
    await api.messages.sendOptionList({
      phone: '5511999999999',
      message: 'Escolha',
      optionList: { title: 'Menu', buttonLabel: 'Abrir', options: [{ id: '1', title: 'Opção' }] },
    });
    await api.messages.sendButtonPix({ phone: '5511999999999', pixKey: 'abc', type: 'EVP' });

    const urls = fetcher.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/send-location'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-contact'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-contacts'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-option-list'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-button-pix'))).toBe(true);
  });

  it('calls contacts endpoints', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ZapiClient(
      { instanceId: 'I', token: 'T', clientToken: 'CT' },
      { fetcher },
    );
    const api = createZapiApi(client);

    await api.contacts.getAll();
    await api.contacts.get('5511999999999');

    const urls = fetcher.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/contacts'))).toBe(true);
    expect(urls.some((u) => u.includes('/contact/5511999999999'))).toBe(true);
  });

  it('calls forward-message', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ZapiClient(
      { instanceId: 'I', token: 'T', clientToken: 'CT' },
      { fetcher },
    );
    const api = createZapiApi(client);

    await api.messages.forwardMessage('5511999999999', 'MSGID');
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/forward-message');
    expect((init as any).method).toBe('POST');
  });

  it('passes delayTyping and editMessageId for sendText', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ZapiClient(
      { instanceId: 'I', token: 'T', clientToken: 'CT' },
      { fetcher },
    );
    const api = createZapiApi(client);

    await api.messages.sendText('5511999999999', 'Oi', { delayTyping: 3, editMessageId: 'ABC' });
    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.delayTyping).toBe(3);
    expect(body.editMessageId).toBe('ABC');
  });

  it('calls media endpoints with correct payload keys', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ZapiClient({ instanceId: 'I', token: 'T', clientToken: 'CT' }, { fetcher });
    const api = createZapiApi(client);

    await api.messages.sendSticker('5511999999999', 'https://example.com/s.png', { stickerAuthor: 'A' });
    await api.messages.sendGif('5511999999999', 'https://example.com/g.mp4', { caption: 'c' });
    await api.messages.sendPtv('5511999999999', 'https://example.com/p.mp4');
    await api.messages.sendLink({
      phone: '5511999999999',
      message: 'Texto https://z-api.io',
      image: 'https://example.com/i.png',
      linkUrl: 'https://z-api.io',
      title: 'Z-API',
      linkDescription: 'desc',
    });
    await api.messages.removeReaction('5511999999999', 'MSGID');

    const urls = fetcher.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/send-sticker'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-gif'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-ptv'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-link'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send-remove-reaction'))).toBe(true);

    const stickerBody = JSON.parse((fetcher.mock.calls[0][1] as any).body);
    expect(stickerBody.sticker).toBe('https://example.com/s.png');
    const gifBody = JSON.parse((fetcher.mock.calls[1][1] as any).body);
    expect(gifBody.gif).toBe('https://example.com/g.mp4');
    const ptvBody = JSON.parse((fetcher.mock.calls[2][1] as any).body);
    expect(ptvBody.ptv).toBe('https://example.com/p.mp4');
    const linkBody = JSON.parse((fetcher.mock.calls[3][1] as any).body);
    expect(linkBody.linkUrl).toBe('https://z-api.io');
    const reactBody = JSON.parse((fetcher.mock.calls[4][1] as any).body);
    expect(reactBody.messageId).toBe('MSGID');
  });
});
