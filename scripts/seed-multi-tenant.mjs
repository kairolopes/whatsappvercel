import { createClient } from '@supabase/supabase-js';

function mustEnv(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function getCondominioIdBySlug(supabase, slug) {
  const { data, error } = await supabase.from('condominios').select('id').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Condomínio não encontrado: ${slug}`);
  return data.id;
}

async function ensureUser(supabase, email, password) {
  const existing = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing.data?.users?.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
  if (found?.id) return found.id;

  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  if (!created.data?.user?.id) throw new Error(`Falha ao criar usuário: ${email}`);
  return created.data.user.id;
}

async function ensureMembership(supabase, condominioId, userId, role) {
  const { data, error } = await supabase
    .from('membros_condominio')
    .upsert({ condominio_id: condominioId, user_id: userId, role, ativo: true }, { onConflict: 'user_id,condominio_id' })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function ensureZapiConfig(supabase, condominioId, cfg) {
  const payload = {
    condominio_id: condominioId,
    instance_id: cfg.instance_id ? String(cfg.instance_id).trim() || null : null,
    token: cfg.token ? String(cfg.token).trim() || null : null,
    client_token: cfg.client_token ? String(cfg.client_token).trim() || null : null,
    webhook_secret: cfg.webhook_secret ? String(cfg.webhook_secret).trim() || null : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('zapi_config').upsert(payload, { onConflict: 'condominio_id' });
  if (error) throw error;
}

async function main() {
  const url = mustEnv('SUPABASE_URL');
  const serviceKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cond1 = await getCondominioIdBySlug(supabase, 'condominio-1');
  const cond2 = await getCondominioIdBySlug(supabase, 'condominio-2');

  const admin1Email = 'kairolopesca@gmail.com';
  const admin2Email = 'kairolopes@gmail.com';
  const password = '123456';

  const admin1Id = await ensureUser(supabase, admin1Email, password);
  const admin2Id = await ensureUser(supabase, admin2Email, password);

  await ensureMembership(supabase, cond1, admin1Id, 'admin');
  await ensureMembership(supabase, cond2, admin2Id, 'admin');

  await ensureZapiConfig(supabase, cond1, {
    instance_id: String(process.env.ZAPI_INSTANCE_ID || '').trim(),
    token: String(process.env.ZAPI_TOKEN || '').trim(),
    client_token: String(process.env.ZAPI_CLIENT_TOKEN || '').trim(),
    webhook_secret: String(process.env.ZAPI_WEBHOOK_SECRET || process.env.ZAPI_SHARED_SECRET || '').trim(),
  });

  await ensureZapiConfig(supabase, cond2, {
    instance_id: String(process.env.ZAPI2_INSTANCE_ID || '').trim(),
    token: String(process.env.ZAPI2_TOKEN || '').trim(),
    client_token: String(process.env.ZAPI2_CLIENT_TOKEN || '').trim(),
    webhook_secret: String(process.env.ZAPI2_WEBHOOK_SECRET || '').trim(),
  });

  console.log('Seed concluído:', {
    condominio1: cond1,
    condominio2: cond2,
    admin1: admin1Email,
    admin2: admin2Email,
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
