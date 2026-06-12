/**
 * Targeted web push — notify ONE league member's devices (out-of-app).
 *
 * POST { league, toMemberId, title, body, url }  (Authorization: Bearer <supabase access token>)
 * GET  ?league=<code> — subscription diagnostics (counts/hosts + recent send log).
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
import { vapidConfig } from './_vapid.js';

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  // sanitized — Apple 403s the whole JWT over a messy subject/key (see _vapid.js)
  const vapid = vapidConfig();
  const VAPID_PUBLIC = vapid.publicKey;
  const VAPID_PRIVATE = vapid.privateKey;
  const VAPID_SUBJECT = vapid.subject;

  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!url || !anonKey) { res.status(200).json({ ok: false, error: 'not_configured' }); return; }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { res.status(200).json({ ok: false, error: 'push_not_configured' }); return; }

  // ---- GET ?league=<code>: subscription diagnostics (counts + push hosts only,
  // never endpoints/keys). League codes are share-codes, same trust level as
  // the notify-draft health check. Also surfaces each member's recent send log.
  if (req.method === 'GET') {
    const league = (req.query?.league || '').toString().trim();
    if (!league) {
      // no league → VAPID health: shows the subject Apple will see and flags
      // env vars that carried quotes/whitespace (keys themselves never returned)
      res.status(200).json({
        ok: true, ping: true,
        vapid: {
          subject: VAPID_SUBJECT, subjectEnvSet: vapid.subjectEnvSet,
          publicKeyLen: VAPID_PUBLIC.length, privateKeyLen: VAPID_PRIVATE.length,
          envNeededCleaning: vapid.messy,
        },
      });
      return;
    }
    const sb = createClient(url, anonKey, NOAUTH);
    const { data: row } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:state`).maybeSingle();
    const state = row?.value || null;
    if (!state) { res.status(200).json({ ok: false, error: 'no_state' }); return; }
    const { data: prow } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:push`).maybeSingle();
    const legacy = Array.isArray(prow?.value) ? prow.value : [];
    const host = (ep) => { try { return new URL(ep).hostname; } catch { return '?'; } };
    const members = [];
    for (const t of (state.teams || [])) {
      for (const m of (t.members || [])) {
        if (!m?.uid) { members.push({ id: m?.id, name: m?.name, linked: false }); continue; }
        const { data: urow } = await sb.from('app_kv').select('value').eq('key', `user:${m.uid}:push`).maybeSingle();
        const userSubs = Array.isArray(urow?.value) ? urow.value : [];
        const { data: lrow } = await sb.from('app_kv').select('value').eq('key', `user:${m.uid}:pushlog`).maybeSingle();
        members.push({
          id: m.id, name: m.name, linked: true,
          legacySubs: legacy.filter(e => e?.uid === m.uid && e?.sub?.endpoint).map(e => host(e.sub.endpoint)),
          accountSubs: userSubs.filter(s => s?.endpoint).map(s => host(s.endpoint)),
          lastSends: Array.isArray(lrow?.value) ? lrow.value : [],
        });
      }
    }
    res.status(200).json({ ok: true, members });
    return;
  }

  const authh = req.headers.authorization || '';
  const token = authh.startsWith('Bearer ') ? authh.slice(7).trim() : '';
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const league = (body.league || '').toString().trim();
  const toMemberId = (body.toMemberId || '').toString().trim();
  const title = (body.title || '').toString().slice(0, 120);
  const text = (body.body || '').toString().slice(0, 300);
  const link = (body.url || '/').toString();
  // optional delivery delay (seconds, capped) — iOS won't display a push while
  // the app is foregrounded, so the in-app test waits for you to background it
  const delay = Math.min(Math.max(Number(body.delay) || 0, 0), 6);
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

  // Collect the target's subscriptions from BOTH stores — the account-scoped
  // list (user:<uid>:push, works across leagues) and the legacy per-league list
  // (<league>:wc:push) — deduped by endpoint. The per-league list alone misses
  // devices that enabled notifications while a different league was open.
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { data: prow } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:push`).maybeSingle();
  const subs = Array.isArray(prow?.value) ? prow.value : [];
  const { data: urow } = await sb.from('app_kv').select('value').eq('key', `user:${targetUid}:push`).maybeSingle();
  const userSubs = Array.isArray(urow?.value) ? urow.value : [];

  const targets = new Map();   // endpoint -> subscription
  for (const entry of subs) if (entry?.uid === targetUid && entry?.sub?.endpoint) targets.set(entry.sub.endpoint, entry.sub);
  for (const s of userSubs) if (s?.endpoint) targets.set(s.endpoint, s);

  if (delay) await new Promise(r => setTimeout(r, delay * 1000));

  const payload = JSON.stringify({ title, body: text, url: link });
  let pushed = 0;
  const failures = [];   // surfaced to the client so "test notification" can say WHY
  const dead = new Set();
  for (const [endpoint, sub] of targets) {
    try { await webpush.sendNotification(sub, payload); pushed++; }
    catch (e) {
      let host = '';
      try { host = new URL(endpoint).hostname; } catch { /* ignore */ }
      failures.push({ host, code: e?.statusCode || 0, msg: (e?.body || e?.message || '').toString().slice(0, 160) });
      console.error('push failed', host, e?.statusCode, e?.body || e?.message);
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.add(endpoint);
    }
  }

  // prune dead endpoints from both stores
  if (dead.size) {
    const liveLeague = subs.filter(e => !dead.has(e?.sub?.endpoint));
    if (liveLeague.length !== subs.length) {
      await sb.from('app_kv').upsert({ key: `${league}:wc:push`, value: liveLeague, updated_at: new Date().toISOString() });
    }
    const liveUser = userSubs.filter(s => !dead.has(s?.endpoint));
    if (liveUser.length !== userSubs.length) {
      await sb.from('app_kv').upsert({ key: `user:${targetUid}:push`, value: liveUser, updated_at: new Date().toISOString() });
    }
  }
  // append to the target's send log (last 5) so GET diagnostics can show what
  // actually happened server-side — no more relying on the client toast
  try {
    const entry = { ts: new Date().toISOString(), league, matched: targets.size, pushed, failures };
    const { data: lrow } = await sb.from('app_kv').select('value').eq('key', `user:${targetUid}:pushlog`).maybeSingle();
    const log = Array.isArray(lrow?.value) ? lrow.value : [];
    log.unshift(entry);
    const { error: lerr } = await sb.from('app_kv').upsert({ key: `user:${targetUid}:pushlog`, value: log.slice(0, 5), updated_at: new Date().toISOString() });
    if (lerr) console.error('pushlog write failed', lerr.message);
  } catch (e) { console.error('pushlog write failed', e?.message); }

  res.status(200).json({ ok: true, pushed, matched: targets.size, failures });
}
