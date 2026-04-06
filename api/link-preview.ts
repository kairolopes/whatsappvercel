function getQueryParam(req: any, key: string): string | null {
  const q = req?.query ?? {};
  const value = q[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function json(res: any, status: number, body: any) {
  res.status(status);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function pickMeta(content: string, keys: string[]) {
  for (const k of keys) {
    const re1 = new RegExp(`<meta[^>]+property=["']${k}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
    const m1 = content.match(re1);
    if (m1?.[1]) return m1[1];

    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${k}["'][^>]*>`, 'i');
    const m2 = content.match(re2);
    if (m2?.[1]) return m2[1];

    const re3 = new RegExp(`<meta[^>]+name=["']${k}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
    const m3 = content.match(re3);
    if (m3?.[1]) return m3[1];

    const re4 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${k}["'][^>]*>`, 'i');
    const m4 = content.match(re4);
    if (m4?.[1]) return m4[1];
  }
  return null;
}

function pickTitle(content: string) {
  const m = content.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m?.[1]?.trim() || null;
}

function absolutize(url: string, baseUrl: string) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

export default async function handler(req: any, res: any) {
  if (req?.method !== 'GET') {
    json(res, 405, { ok: false, reason: 'method_not_allowed' });
    return;
  }

  const target = getQueryParam(req, 'url');
  if (!target) {
    json(res, 400, { ok: false, reason: 'missing_url' });
    return;
  }

  let u: URL;
  try {
    u = new URL(target);
  } catch {
    json(res, 400, { ok: false, reason: 'invalid_url' });
    return;
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    json(res, 400, { ok: false, reason: 'invalid_protocol' });
    return;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const r = await fetch(u.toString(), {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; WhatsAppSoloBuilder/1.0; +https://whatsappsolobuilder.vercel.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await r.text();
    const head = html.slice(0, 120_000);

    const ogTitle = pickMeta(head, ['og:title', 'twitter:title']);
    const ogDesc = pickMeta(head, ['og:description', 'description', 'twitter:description']);
    const ogImage = pickMeta(head, ['og:image', 'twitter:image']);
    const title = ogTitle || pickTitle(head) || u.hostname;

    json(res, 200, {
      ok: true,
      data: {
        url: u.toString(),
        domain: u.hostname,
        title,
        description: ogDesc || '',
        image: ogImage ? absolutize(ogImage, u.toString()) : '',
      },
    });
  } catch {
    json(res, 200, {
      ok: true,
      data: {
        url: u.toString(),
        domain: u.hostname,
        title: u.hostname,
        description: '',
        image: '',
      },
    });
  } finally {
    clearTimeout(t);
  }
}

