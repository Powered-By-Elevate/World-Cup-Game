/**
 * Server-side match-notification tick — the offline-coverage counterpart to the
 * in-app detector in App.tsx. A free GitHub Actions cron (.github/workflows/
 * match-tick.yml) pings this every few minutes so kickoff / full-time / "your
 * match is coming up" notifications fire ON TIME even when nobody has the app
 * open — the one gap of the client-driven version.
 *
 * It reuses the EXACT same pure detection logic as the client (detectMatchEvents
 * + detectUpcoming from src/utils/matchNotify, fed by mapLive/upcomingFromFeed
 * from src/data/liveResults) and the same shared per-league state, so the two
 * can run side by side: whichever fires first claims the event in the shared
 * `<league>:wc:matchwatch` set, and the other sees it already done. The first
 * run for a league seeds silently (no backfill spam).
 *
 * For each league it writes the in-app feed (`<league>:wc:notifs`, canonical
 * history) and sends web push to whoever drafted the nations involved.
 *
 * Auth: a shared secret in the TICK_SECRET env var (Vercel), sent by the cron as
 * `Authorization: Bearer <secret>` or `?key=<secret>`. Absent env → no-op (safe
 * to deploy before the secret exists). Reads the live feed via our own
 * /api/results, so it rides the shared cache and adds no upstream Zafronix quota.
 *
 * Env (Vercel): TICK_SECRET, SUPABASE_URL / SUPABASE_ANON_KEY (fall back to
 *   VITE_*), VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 */
import { createClient } from '@supabase/supabase-js';
import { vapidConfig } from './_vapid.js';
import { configurePush, leaguePushList, sendToUser } from './_push.js';
import type { Team, Scoring } from '../src/data/types';
// NOTE: the ../src/* logic is imported DYNAMICALLY inside the handler (below) so
// a bundling/inclusion failure surfaces as a JSON error instead of a 500 crash.

interface Req { headers: Record<string, string | undefined>; query?: Record<string, string | string[] | undefined>; }
interface Res { status(code: number): { json(body: unknown): void } }

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const CAP = 200;
const kindOf = (k: string) => (k === 'start' ? 'match-start' : k === 'result' ? 'match-result' : 'match-soon');

export default async function handler(req: Req, res: Res) {
  // Liveness + diagnostics (no secret needed): confirms the build is live, whether
  // the ../src bundle imports on Vercel, and which env vars are visible.
  if (req.query?.ping) {
    let importsOk = false, importErr = null;
    try { await Promise.all([import('../src/data/liveResults'), import('../src/utils/matchNotify'), import('../src/data/types'), import('../src/utils/helpers')]); importsOk = true; }
    catch (e) { importErr = String((e as Error)?.stack || (e as Error)?.message || e).slice(0, 400); }
    res.status(200).json({
      ok: true, marker: 'diag2', importsOk, importErr,
      env: {
        TICK_SECRET: !!process.env.TICK_SECRET,
        SUPABASE_URL: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
        VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
      },
    });
    return;
  }

  const secret = process.env.TICK_SECRET;
  if (!secret) { res.status(200).json({ ok: false, error: 'not_configured' }); return; }
  const authh = req.headers.authorization || '';
  const qk = req.query?.key;
  const provided = (authh.startsWith('Bearer ') ? authh.slice(7).trim() : '') || (Array.isArray(qk) ? qk[0] : qk) || '';
  if (provided !== secret) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }

  // Dynamic import of the shared detection logic — if Vercel didn't bundle the
  // ../src/* files this throws here and we report it instead of a blind 500.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mapLive: any, upcomingFromFeed: any, detectMatchEvents: any, detectUpcoming: any, DEFAULT_SCORING: any, uid: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  try {
    const [lr, mn, ty, hp] = await Promise.all([
      import('../src/data/liveResults'),
      import('../src/utils/matchNotify'),
      import('../src/data/types'),
      import('../src/utils/helpers'),
    ]);
    ({ mapLive, upcomingFromFeed } = lr);
    ({ detectMatchEvents, detectUpcoming } = mn);
    ({ DEFAULT_SCORING } = ty);
    ({ uid } = hp);
  } catch (e) {
    res.status(200).json({ ok: false, error: 'import_failed', detail: String((e as Error)?.stack || (e as Error)?.message || e).slice(0, 600) });
    return;
  }

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
    const adds = events.flatMap((ev: any) => ev.recipients.map((rcp: any) => ({
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
