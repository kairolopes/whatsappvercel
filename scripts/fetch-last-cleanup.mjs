import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ejuoefbmofozggbvsehh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdW9lZmJtb2ZvemdnYnZzZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2OTMzNTIsImV4cCI6MjA4ODI2OTM1Mn0.UeoEqFPJoEja4ryVgocubHsI3qqLbMhCxIQCxlWcxlc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('cleanup_last_result')
  .select('id, created_at, operation_id, removed_conversations, removed_messages, criteria')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));

