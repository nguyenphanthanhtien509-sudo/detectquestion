import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-local-admin-key' };

async function requireAdmin(request: Request) {
  const localKey = request.headers.get('x-local-admin-key') || '';
  const expectedLocalKey = Deno.env.get('LOCAL_ADMIN_KEY') || '';
  if (expectedLocalKey && localKey === expectedLocalKey) return;
  const auth = request.headers.get('authorization') || '';
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await client.auth.getUser();
  if (!data.user || data.user.app_metadata?.role !== 'license_admin') throw new Error('FORBIDDEN');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    await requireAdmin(request);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (request.method === 'GET') {
      const { data, error } = await admin.from('license_accounts').select('student_id,display_name,is_active,last_seen_at,session_expires_at,created_at').order('created_at', { ascending: false });
      if (error) throw error;
      return Response.json({ accounts: data }, { headers: cors });
    }
    const payload = await request.json();
    const studentId = String(payload.studentId || '').trim();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(studentId)) return Response.json({ error: 'INVALID_STUDENT_ID' }, { status: 400, headers: cors });
    if (payload.action === 'reset-device') {
      const { error } = await admin.rpc('reset_license_device', { p_student_id: studentId });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: cors });
    }
    if (payload.action === 'upsert') {
      const { error } = await admin.from('license_accounts').upsert({ student_id: studentId, display_name: String(payload.displayName || '').trim() || null, is_active: payload.isActive !== false }, { onConflict: 'student_id' });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: cors });
    }
    if (payload.action === 'delete') {
      const { error } = await admin.from('license_accounts').delete().eq('student_id', studentId);
      if (error) throw error;
      return Response.json({ ok: true }, { headers: cors });
    }
    return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400, headers: cors });
  } catch (error) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403, headers: cors });
  }
});
