/**
 * Targeted web push — notify ONE league member's devices (out-of-app).
 *
 * POST { league, toMemberId, title, body, url }  (Authorization: Bearer <supabase access token>)
 * Any authenticated member of the league may call it (peer-to-peer: Arcade
 * challenges, chat). The caller is verified against the league's shared state,
 * the target member is mapped to their account uid, and only that uid's stored
 * push subscriptions (league KV `<league>:wc:push`) receive the notification.
 *
 * Env (Vercel): VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT,
 *   SUPABASE_URL / SUPABASE_ANON_KEY (fall back to VITE_*).
 */
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@worldcupdraft.app';

  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!url || !anonKey) { res.status(200).json({ ok: false, error: 'not_configured' }); return; }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { res.status(200).json({ ok: false, error: 'push_not_configured' }); return; }

  const authh = req.headers.authorization || '';
  const token = authh.startsWith('Bearer ') ? authh.slice(7).trim() : '';
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const league = (body.league || '').toString().trim();
  const toMemberId = (body.toMemberId || '').toString().trim();
  const title = (body.title || '').toString().slice(0, 120);
  const text = (body.body || '').toString().slice(0, 300);
  const link = (body.url || '/').toString();
  if (!league || !toMemberId || !title) { res.status(400).json({ error: 'bad_request' }); return; }

  const sb = createClient(url, anonKey, NOAUTH);

  // authenticate the caller
  const { data: ures, error: uerr } = await sb.auth.getUser(token);
  const requester = ures?.user;
  if (uerr || !requester) { res.status(401).json({ error: 'unauthorized' }); return; }

  // confirm the caller is in this league + map the target member → account uid
  const { data: row } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:state`).maybeSingle();
  const state = row?.value || null;
  if (!state) { res.status(200).json({ ok: false, error: 'no_state' }); return; }
  let callerIn = false, targetUid = null;
  for (const t of (state.teams || [])) {
    for (const m of (t.members || [])) {
      if (m.uid && m.uid === requester.id) callerIn = true;
      if (m.id === toMemberId && m.uid) targetUid = m.uid;
    }
  }
  if (!callerIn) { res.status(403).json({ error: 'forbidden' }); return; }
  if (!targetUid) { res.status(200).json({ ok: true, pushed: 0, reason: 'target_not_linked' }); return; }

  // send to the target uid's subscriptions only; prune dead endpoints
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { data: prow } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:push`).maybeSingle();
  const subs = Array.isArray(prow?.value) ? prow.value : [];
  const payload = JSON.stringify({ title, body: text, url: link });
  let pushed = 0;
  const live = [];
  const failures = [];   // surfaced to the client so "test notification" can say WHY
  let matched = 0;
  for (const entry of subs) {
    if (entry.uid !== targetUid) { live.push(entry); continue; }
    matched++;
    const sub = entry.sub || entry;
    try { await webpush.sendNotification(sub, payload); pushed++; live.push(entry); }
    catch (e) {
      let host = '';
      try { host = new URL(sub.endpoint).hostname; } catch { /* ignore */ }
      failures.push({ host, code: e?.statusCode || 0, msg: (e?.body || e?.message || '').toString().slice(0, 160) });
      console.error('push failed', host, e?.statusCode, e?.body || e?.message);
      if (e?.statusCode !== 404 && e?.statusCode !== 410) live.push(entry);
    }
  }
  if (live.length !== subs.length) {
    await sb.from('app_kv').upsert({ key: `${league}:wc:push`, value: live, updated_at: new Date().toISOString() });
  }
  res.status(200).json({ ok: true, pushed, matched, failures });
}
