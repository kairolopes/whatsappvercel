import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const execute = process.argv.includes('--execute');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const dryRun = await supabase.rpc('cleanup_test_conversations', { p_dry_run: true });
if (dryRun.error) {
  console.error('Dry-run failed:', dryRun.error);
  process.exit(1);
}

console.log('Dry-run summary:\n', JSON.stringify(dryRun.data, null, 2));

if (!execute) {
  console.log('Run again with --execute to perform cleanup.');
  process.exit(0);
}

const run = await supabase.rpc('cleanup_test_conversations', { p_dry_run: false });
if (run.error) {
  console.error('Cleanup failed:', run.error);
  process.exit(1);
}

console.log('Cleanup summary:\n', JSON.stringify(run.data, null, 2));

const operationId = run.data?.operation_id;
const now = new Date().toISOString();

mkdirSync(join('docs', 'audit'), { recursive: true });

const report = [
  '# Remoção de Conversas de Teste',
  '',
  `- Data/hora (UTC): ${now}`,
  `- operation_id: ${operationId ?? 'N/A'}`,
  `- Conversas removidas: ${run.data?.removed_conversations ?? 0}`,
  `- Mensagens removidas: ${run.data?.removed_messages ?? 0}`,
  '',
  '## Critérios aplicados',
  '```json',
  JSON.stringify(run.data?.criteria ?? {}, null, 2),
  '```',
  '',
  '## Reversão',
  'Para restaurar este lote, execute a função no Supabase (service_role):',
  '```sql',
  `select public.restore_cleanup_operation('${operationId}');`,
  '```',
  '',
].join('\n');

const reportPath = join('docs', 'audit', `cleanup-${operationId ?? 'unknown'}.md`);
writeFileSync(reportPath, report, 'utf8');
console.log('Report written:', reportPath);

