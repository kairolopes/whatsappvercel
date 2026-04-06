import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req?.method !== 'GET') {
    res.status(405).json({ ok: false, reason: 'method_not_allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secretConfigured = Boolean(process.env.ZAPI_WEBHOOK_SECRET);

  const env = {
    supabaseUrl: Boolean(supabaseUrl),
    supabaseServiceRoleKey: Boolean(supabaseServiceRoleKey),
    zapiWebhookSecret: secretConfigured,
  };

  if (supabaseUrl && supabaseServiceRoleKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from('zapi_webhook_events').insert({
      event_type: 'Healthcheck',
      phone: null,
      from_me: null,
      message_id: null,
      payload: { ok: true },
    });

    if (error) {
      res.status(200).json({ ok: true, env, supabaseWrite: false });
      return;
    }

    res.status(200).json({ ok: true, env, supabaseWrite: true });
    return;
  }

  res.status(200).json({ ok: true, env, supabaseWrite: false, reason: 'missing_vercel_env' });
}

