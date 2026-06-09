/**
 * Serverless accounts directory for the commissioner (emails + last login).
 *
 * The browser can't read Supabase's auth.users with the anon key, so this
 * same-origin endpoint uses the service-role key (server-side only, never sent
 * to the browser) to list accounts. It is gated to the league's commissioner:
 * the caller's Supabase session JWT is verified, then checked against the
 * commissioner member recorded in that league's shared state.
 *
 * The league state lives in app_kv, which is intentionally anon-readable (the
 * app's whole sharing model). We read it with the anon key — the service_role
 * role isn't granted table privileges on app_kv (see the migration), and the
 * service key is only needed for the auth.users listing.
 *
 * Returns { accounts: [{ id, email, last_sign_in_at, created_at }] }.
 * On any non-fatal misconfiguration it returns HTTP 200 with an { error }
 * field so the client cleanly falls back to the "lite" inline emails.
 *
 * Env (set in the Vercel project, server-side only):
 *   SUPABASE_SERVICE_ROLE_KEY  (required) service-role key
 *   SUPABASE_URL               (optional) falls back to VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY          (optional) falls back to VITE_SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    res.status(200).json({ error: 'not_configured', reason: 'SUPABASE_SERVICE_ROLE_KEY not set' });
    return;
  }

  // Read league state with the anon key (service_role lacks app_kv grants).
  const reader = createClient(url, anonKey || serviceKey, NOAUTH);
  const readState = async (league) => {
    const { data, error } = await reader
      .from('app_kv').select('value').eq('key', `${league}:wc:state`).maybeSingle();
    if (error) throw error;
    return data?.value || null;
  };

  // TEMP diagnostic: report config + whether the admin/list and state reads
  // work, without exposing any emails/PII. Remove after debugging.
  if (req.query?.selftest === '1') {
    let role = null;
    try { role = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64').toString('utf8')).role; } catch { /* not a JWT */ }
    let listUsersOk = false, listError = null, stateReadOk = false, stateError = null;
    try {
      const probe = createClient(url, serviceKey, NOAUTH);
      const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) listError = error.message; else listUsersOk = true;
    } catch (e) { listError = String(e?.message || e); }
    try { await readState(req.query.league || 'x'); stateReadOk = true; }
    catch (e) { stateError = String(e?.message || e); }
    res.status(200).json({ selftest: true, urlPresent: !!url, anonKeyPresent: !!anonKey, serviceKeyRole: role, listUsersOk, listError, stateReadOk, stateError });
    return;
  }

  // Caller's session token (Authorization: Bearer <access_token>).
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }

  const league = (req.query?.league || '').toString().trim();
  if (!league) { res.status(400).json({ error: 'bad_request', reason: 'missing league' }); return; }

  const admin = createClient(url, serviceKey, NOAUTH);

  // 1. Verify the caller is a real, signed-in account.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const requester = userData?.user;
  if (userErr || !requester) { res.status(401).json({ error: 'unauthorized' }); return; }

  // 2. Commissioner gate: the requester's uid must match the commissioner
  //    member recorded in this league's shared state.
  let state;
  try { state = await readState(league); }
  catch (e) { res.status(500).json({ error: 'state_read_failed', reason: String(e?.message || e) }); return; }
  const commishId = state?.commissioner || null;
  let allowed = false;
  if (commishId) {
    for (const t of (state.teams || [])) {
      for (const m of (t.members || [])) {
        if (m.id === commishId && m.uid === requester.id) { allowed = true; break; }
      }
      if (allowed) break;
    }
  }
  if (!allowed) { res.status(403).json({ error: 'forbidden' }); return; }

  // 3. List accounts (paged so a large pool is fully covered).
  const accounts = [];
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { res.status(500).json({ error: 'list_failed', reason: error.message }); return; }
    const users = data?.users || [];
    for (const u of users) {
      accounts.push({
        id: u.id,
        email: u.email || null,
        last_sign_in_at: u.last_sign_in_at || null,
        created_at: u.created_at || null,
      });
    }
    if (users.length < 200) break;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ accounts });
}
