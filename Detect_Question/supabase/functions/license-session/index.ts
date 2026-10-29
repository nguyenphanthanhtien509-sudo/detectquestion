import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const encoder = new TextEncoder();
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { studentId, deviceId, sessionId } = await request.json();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(String(studentId || '')) || !/^[A-Za-z0-9-]{16,128}$/.test(String(deviceId || ''))) {
      return Response.json({ allowed: false, reason: 'INVALID_REQUEST' }, { status: 400, headers: cors });
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const issuedSession = typeof sessionId === 'string' && sessionId.length >= 24 ? sessionId : crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.rpc('claim_license_device', {
      p_student_id: studentId, p_device_hash: await hash(deviceId), p_session_hash: await hash(issuedSession), p_expires_at: expiresAt
    }).single();
    if (error) throw error;
    if (!data.allowed) return Response.json({ allowed: false, reason: data.reason }, { status: 403, headers: cors });
    return Response.json({ allowed: true, studentId, displayName: data.display_name, sessionId: issuedSession, expiresAt }, { headers: cors });
  } catch (error) {
    return Response.json({ allowed: false, reason: 'LICENSE_SERVICE_ERROR' }, { status: 500, headers: cors });
  }
});
