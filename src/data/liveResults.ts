/* ============================================================
   LIVE RESULTS — maps the /api/results feed (Zafronix WC API) onto
   our fixtures + knockout bracket. No manual entry; results flow in
   automatically. Returns null on any problem so callers fall back to the
   deterministic engine.

   Free-tier feed: every fixture + kickoff time, `IN_PLAY` while a match
   is being played (no in-play score), final score once it finishes.
   ============================================================ */
import { MATCHES } from './fixtures';
import type { KOMatch } from './fixtures';
import { NATION, NATIONS } from './nations';
import type { ScoreEntry } from './types';

/* feed team NAME → our nation id. Exact NATION names match automatically;
   ALIAS covers every spelling the feed uses that differs from ours. */
const NAME_TO_ID: Record<string, string> = Object.fromEntries(NATIONS.map(n => [n.name, n.id]));
const ALIAS: Record<string, string> = {
  'Korea Republic': 'KOR',
  'IR Iran': 'IRN',
  "Côte d'Ivoire": 'CIV', "Cote d'Ivoire": 'CIV',
  'Türkiye': 'TUR', 'Turkey': 'TUR',
  'Bosnia and Herzegovina': 'BIH',
  'Congo DR': 'COD', 'DR Congo': 'COD', 'Congo': 'COD',
  'Cabo Verde': 'CPV',
  'Curaçao': 'CUW',
  'United States': 'USA',
  'Czech Republic': 'CZE',
  // legacy tla aliases (harmless if the feed ever sends codes again)
  URY: 'URU',
};
function toId(name: string | null | undefined): string | null {
  if (!name) return null;
  const id = NAME_TO_ID[name] || ALIAS[name] || (NATION[name] ? name : null);
  return id && NATION[id] ? id : null;
}

const STAGE_ROUND: Record<string, string> = {
  LAST_32: 'R32', LAST_16: 'R16', QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF', THIRD_PLACE: '3rd', FINAL: 'Final',
};

// unordered-pair lookup over our fixtures so home/away orientation can't break it
const PAIR: Record<string, { mi: string; home: string }> = {};
for (const m of MATCHES) PAIR[[m.h, m.a].sort().join('|')] = { mi: m.i, home: m.h };

function statusOf(s: string): 'ft' | 'live' | null {
  if (s === 'FINISHED' || s === 'AWARDED') return 'ft';
  if (s === 'IN_PLAY' || s === 'PAUSED' || s === 'LIVE' || s === 'SUSPENDED') return 'live';
  return null;
}

/** A match being played right now (free tier: teams + kickoff, no in-play score). */
export interface LiveNowMatch { mi: string | null; round: string | null; h: string; a: string; date: string; }

export interface LiveData { scores: Record<string, ScoreEntry>; ko: KOMatch[]; liveNow: LiveNowMatch[]; }

interface FeedMatch {
  id: number | string; stage: string; status: string;
  home: { tla: string | null; name?: string | null }; away: { tla: string | null; name?: string | null };
  hs: number | null; as: number | null;
  winner: string | null; pens: { home: number; away: number } | null;
  date: string | null;
}

export async function fetchLiveResults(): Promise<LiveData | null> {
  let json: { source?: string; matches?: FeedMatch[] };
  try {
    const r = await fetch('/api/results', { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    json = await r.json();
  } catch { return null; }
  if (json.source !== 'live' || !Array.isArray(json.matches)) return null;
  return mapLive(json.matches);
}

/** Pure: map the normalized /api/results feed onto our fixtures + bracket.
 *  Shared by the client poll and the server-side notification tick. */
export function mapLive(matches: FeedMatch[]): LiveData {
  const scores: Record<string, ScoreEntry> = {};
  const ko: KOMatch[] = [];
  const liveNow: LiveNowMatch[] = [];

  for (const m of matches) {
    const h = toId(m.home?.name ?? m.home?.tla);
    const a = toId(m.away?.name ?? m.away?.tla);

    if (m.stage === 'GROUP_STAGE') {
      const st = statusOf(m.status);
      if (!st || !h || !a) continue;
      const f = PAIR[[h, a].sort().join('|')];
      if (st === 'live') liveNow.push({ mi: f?.mi || null, round: null, h, a, date: m.date || '' });
      if (m.hs == null || m.as == null || !f) continue;
      scores[f.mi] = f.home === h ? { h: m.hs, a: m.as, st } : { h: m.as, a: m.hs, st };
      continue;
    }

    const round = STAGE_ROUND[m.stage];
    if (!round || !h || !a) continue; // skip rounds whose teams aren't set yet
    const st = statusOf(m.status);
    if (st === 'live') liveNow.push({ mi: null, round, h, a, date: m.date || '' });
    const done = !!st && m.hs != null && m.as != null;
    let pk: string | null = null;
    if (m.pens && m.pens.home != null && m.pens.away != null) {
      pk = m.pens.home > m.pens.away ? h : a;
    } else if (done && m.hs === m.as && m.winner) {
      pk = m.winner === 'HOME_TEAM' ? h : m.winner === 'AWAY_TEAM' ? a : null;
    }
    ko.push({
      id: 'api_' + m.id, round, h, a,
      h_s: done ? m.hs : null, a_s: done ? m.as : null,
      st: st || 'sched', pk, d: (m.date || '').slice(0, 10),
    });
  }

  return { scores, ko, liveNow };
}

/** A fixture that hasn't kicked off yet, resolved to our nation ids. */
export interface UpcomingMatch { key: string; h: string; a: string; kickoff: string; knockout: boolean; }

/** Pure: the not-yet-started matches (feed status TIMED) whose BOTH teams are
 *  known, resolved to nation ids + kickoff time. Drives the advance reminder.
 *  Group keys mirror the fixtures (g:<mi>); knockouts key off the feed id. */
export function upcomingFromFeed(matches: FeedMatch[]): UpcomingMatch[] {
  const out: UpcomingMatch[] = [];
  for (const m of matches) {
    if (m.status !== 'TIMED' || !m.date) continue;
    const h = toId(m.home?.name ?? m.home?.tla);
    const a = toId(m.away?.name ?? m.away?.tla);
    if (!h || !a) continue;
    if (m.stage === 'GROUP_STAGE') {
      const f = PAIR[[h, a].sort().join('|')];
      out.push({ key: `g:${f?.mi || m.id}`, h, a, kickoff: m.date, knockout: false });
    } else if (STAGE_ROUND[m.stage]) {
      out.push({ key: `k:api_${m.id}`, h, a, kickoff: m.date, knockout: true });
    }
  }
  return out;
}
