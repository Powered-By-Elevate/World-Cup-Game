/**
 * SOURCE for the match-notification cron function. Bundled by esbuild into the
 * deployed serverless function `api/tick.js` (`npm run build:tick`) so the
 * shared ../src detection logic is INLINED — Vercel compiles only /api/*.ts and
 * will NOT compile .ts imported from outside /api, so a plain `api/tick.ts`
 * importing ../src crashes at runtime with ERR_MODULE_NOT_FOUND. Bundling makes
 * the function self-contained (only web-push + @supabase external from
 * node_modules). EDIT THIS FILE, then run `npm run build:tick` and commit the
 * regenerated api/tick.js.
 *
 * Server-side counterpart to the in-app detector in App.tsx: a free GitHub
 * Actions cron pings /api/tick every few minutes so kickoff / full-time / "your
 * match is coming up" notifications fire on time even when nobody has the app
 * open. Reuses the EXACT client detection logic (detectMatchEvents +
 * detectUpcoming) and the shared per-league state, deduped via wc:matchwatch.
 *
 * Auth: shared secret TICK_SECRET (Vercel env), sent as `Authorization: Bearer
 * <secret>` or `?key=<secret>`. Absent env → no-op. Reads the live feed via our
 * own /api/results so it rides the shared cache (no extra Zafronix quota).
 */
import { createClient } from '@supabase/supabase-js';
import { vapidConfig } from '../api/_vapid.js';
import { configurePush, leaguePushList, sendToUser } from '../api/_push.js';
import { mapLive, upcomingFromFeed } from '../src/data/liveResults';
import { detectMatchEvents, detectUpcoming } from '../src/utils/matchNotify';
import { DEFAULT_SCORING } from '../src/data/types';
import type { Team, Scoring } from '../src/data/types';
import { uid } from '../src/utils/helpers';

interface Req { headers: Record<string, string | undefined>; query?: Record<string, string | string[] | undefined>; }
interface Res { status(code: number): { json(body: unknown): void } }

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const CAP = 200;
const kindOf = (k: string) => (k === 'start' ? 'match-start' : k === 'result' ? 'match-result' : 'match-soon');

export default async function handler(req: Req, res: Res) {
  const secret = process.env.TICK_SECRET;
  if (!secret) { res.status(200).json({ ok: false, error: 'not_configured' }); return; }
  const authh = req.headers.authorization || '';
  const qk = req.query?.key;
  const provided = (authh.startsWith('Bearer ') ? authh.slice(7).trim() : '') || (Array.isArray(qk) ? qk[0] : qk) || '';
  if (provided !== secret) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) { res.status(200).json({ ok: false, error: 'no_supabase' }); return; }
  const sb = createClient(url, anonKey, NOAUTH);

  const pushOn = configurePush(vapidConfig());

  // Live feed via our own proxy → rides the shared cache, no extra upstream quota.
  const base = process.env.PUBLIC_BASE_URL || (req.headers.host ? `https://${req.headers.host}` : '');
  let matches: unknown[] = [];
  try {
    const r = await fetch(`${base}/api/results`, { headers: { accept: 'application/json' } });
    const j = await r.json();
    if (j?.source === 'live' && Array.isArray(j.matches)) matches = j.matches;
  } catch (e) { res.status(200).json({ ok: false, error: 'feed_error', detail: String((e as Error)?.message || e) }); return; }
  if (!matches.length) { res.status(200).json({ ok: true, leagues: 0, note: 'no live feed' }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = mapLive(matches as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcoming = upcomingFromFeed(matches as any);
  const now = Date.now();

  const { data: rows, error } = await sb.from('app_kv').select('key,value').like('key', '%:wc:state');
  if (error) { res.status(500).json({ ok: false, error: error.message }); return; }

  const report: Array<{ league: string; events: number; notifs: number; pushed: number }> = [];
  for (const row of rows || []) {
    const league = String(row.key).replace(/:wc:state$/, '');
    const state = (row.value || null) as { draftDone?: boolean; teams?: Team[]; scoring?: Scoring } | null;
    if (!state || !state.draftDone || !Array.isArray(state.teams) || !state.teams.length) continue;
    const teams = state.teams;
    const scoring = state.scoring || DEFAULT_SCORING;

    const { data: wrow } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:matchwatch`).maybeSingle();
    const watch = (wrow?.value && typeof wrow.value === 'object') ? wrow.value as Record<string, number> : null;

    const r1 = detectMatchEvents(teams, live.scores, live.ko, scoring, watch, now);
    const r2 = detectUpcoming(teams, upcoming, r1.watch, now);
    const events = [...r1.events, ...r2.events];

    // Claim (persist the updated watch) BEFORE sending, so a racing client/tick
    // can't double-fire the same event.
    if (JSON.stringify(r2.watch) !== JSON.stringify(watch || {})) {
      await sb.from('app_kv').upsert({ key: `${league}:wc:matchwatch`, value: r2.watch, updated_at: new Date().toISOString() });
    }
    if (!events.length) continue;

    const link = `${base}/?league=${league}`;

    // In-app feed (canonical history) — one entry per recipient, capped like notify.ts.
    const adds = events.flatMap(ev => ev.recipients.map(rcp => ({
      id: uid(), to: rcp.memberId, kind: kindOf(ev.kind), title: ev.title, body: rcp.body, ts: now, read: false,
    })));
    if (adds.length) {
      const { data: nrow } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:notifs`).maybeSingle();
      const cur = Array.isArray(nrow?.value) ? nrow.value : [];
      await sb.from('app_kv').upsert({ key: `${league}:wc:notifs`, value: [...cur, ...adds].slice(-CAP), updated_at: new Date().toISOString() });
    }

    // Out-of-app push to each recipient's devices (member → account uid via state).
    let pushed = 0;
    if (pushOn) {
      const memberUid = new Map<string, string>();
      for (const t of teams) for (const m of (t.members || [])) if (m?.id && m?.uid) memberUid.set(m.id, m.uid);
      const legacy = await leaguePushList(sb, league);
      for (const ev of events) for (const rcp of ev.recipients) {
        const targetUid = memberUid.get(rcp.memberId);
        if (!targetUid) continue;
        const r = await sendToUser(sb, targetUid, league, legacy, { title: ev.title, body: rcp.body, url: link });
        pushed += r.pushed;
      }
    }
    report.push({ league, events: events.length, notifs: adds.length, pushed });
  }

  res.status(200).json({ ok: true, leagues: report.length, report });
}
