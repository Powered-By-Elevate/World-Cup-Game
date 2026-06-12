/**
 * Shared web-push sender — used by the cron tick (api/tick.ts) to deliver
 * notifications to a league member's devices out-of-app. Mirrors the proven
 * send/prune/log path in api/push.js (the interactive peer-to-peer endpoint),
 * factored out so the tick can reuse it without re-authenticating per call.
 *
 * A member is reached on BOTH stores, deduped by endpoint:
 *   <league>:wc:push   legacy per-league list of { uid, sub }
 *   user:<uid>:push    account-scoped list of PushSubscriptionJSON (cross-league)
 * Dead endpoints (404/410) are pruned from whichever store held them, and a
 * 5-entry send log is kept at user:<uid>:pushlog for GET /api/push diagnostics.
 */
import webpush from 'web-push';

const host = (ep) => { try { return new URL(ep).hostname; } catch { return '?'; } };

/** Call once before a batch of sends. Returns false if VAPID isn't configured. */
export function configurePush(vapid) {
  if (!vapid?.publicKey || !vapid?.privateKey) return false;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return true;
}

/** Read a league's legacy per-league push list once, to reuse across members. */
export async function leaguePushList(sb, league) {
  const { data } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:push`).maybeSingle();
  return Array.isArray(data?.value) ? data.value : [];
}

/**
 * Send one notification to every device belonging to `uid`.
 * @param legacy  the array returned by leaguePushList (pass [] if unknown)
 * @param {{title:string, body:string, url?:string}} payload
 * @returns {Promise<{pushed:number, matched:number, failures:Array<{host:string,code:number,msg:string}>}>}
 */
export async function sendToUser(sb, uid, league, legacy, payload) {
  const { data: urow } = await sb.from('app_kv').select('value').eq('key', `user:${uid}:push`).maybeSingle();
  const userSubs = Array.isArray(urow?.value) ? urow.value : [];

  const targets = new Map();   // endpoint -> subscription
  for (const e of (legacy || [])) if (e?.uid === uid && e?.sub?.endpoint) targets.set(e.sub.endpoint, e.sub);
  for (const s of userSubs) if (s?.endpoint) targets.set(s.endpoint, s);
  if (!targets.size) return { pushed: 0, matched: 0, failures: [] };

  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/' });
  let pushed = 0;
  const failures = [];
  const dead = new Set();
  for (const [endpoint, sub] of targets) {
    try { await webpush.sendNotification(sub, body); pushed++; }
    catch (e) {
      failures.push({ host: host(endpoint), code: e?.statusCode || 0, msg: (e?.body || e?.message || '').toString().slice(0, 160) });
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.add(endpoint);
    }
  }

  // prune dead endpoints from both stores
  if (dead.size) {
    if (legacy && legacy.length) {
      const liveLeague = legacy.filter(e => !dead.has(e?.sub?.endpoint));
      if (liveLeague.length !== legacy.length) {
        await sb.from('app_kv').upsert({ key: `${league}:wc:push`, value: liveLeague, updated_at: new Date().toISOString() });
      }
    }
    const liveUser = userSubs.filter(s => !dead.has(s?.endpoint));
    if (liveUser.length !== userSubs.length) {
      await sb.from('app_kv').upsert({ key: `user:${uid}:push`, value: liveUser, updated_at: new Date().toISOString() });
    }
  }

  // append to the target's send log (last 5), same shape as api/push.js
  try {
    const entry = { ts: new Date().toISOString(), league, matched: targets.size, pushed, failures, via: 'tick' };
    const { data: lrow } = await sb.from('app_kv').select('value').eq('key', `user:${uid}:pushlog`).maybeSingle();
    const log = Array.isArray(lrow?.value) ? lrow.value : [];
    log.unshift(entry);
    await sb.from('app_kv').upsert({ key: `user:${uid}:pushlog`, value: log.slice(0, 5), updated_at: new Date().toISOString() });
  } catch { /* logging is best-effort */ }

  return { pushed, matched: targets.size, failures };
}
