import { createClient } from 'npm:@supabase/supabase-js@2';
import { hasValidPublishableApiKey } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { isRecord } from '../_shared/normalize.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!hasValidPublishableApiKey(request, {
    publishableKeys: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    publishableKey: Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    legacyAnonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  })) return json({ error: 'unauthorized' }, 401);
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !['string', 'number'].includes(typeof body.refreshId)) throw new Error('invalid_refresh_id');
    const refreshId = Number(body.refreshId);
    if (!Number.isSafeInteger(refreshId) || refreshId < 1) return json({ refreshId: String(body.refreshId), state: 'completed', sources: [{ sourceCode: 'mock', status: 'succeeded' }] });
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'server_not_configured' }, 503);
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.from('source_refreshes').select('id,status,records_found,records_inserted,records_updated,records_unchanged,error_code,requested_at,started_at,completed_at,sources!inner(code,display_name)').eq('id', refreshId).maybeSingle();
    if (error) return json({ error: 'refresh_lookup_failed' }, 500);
    if (!data) return json({ error: 'refresh_not_found' }, 404);
    const publicStatus = data.status === 'succeeded' ? 'completed' : data.status === 'failed' ? 'partial' : 'running';
    return json({ refreshId: String(data.id), state: publicStatus, sources: [{ sourceCode: data.sources.code, sourceName: data.sources.display_name, status: data.status, found: data.records_found, inserted: data.records_inserted, updated: data.records_updated, unchanged: data.records_unchanged, ...(data.error_code ? { errorCode: data.error_code } : {}) }], requestedAt: data.requested_at, startedAt: data.started_at, completedAt: data.completed_at });
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
});
