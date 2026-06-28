/* ============================================================
   LIVE RESULTS — maps the /api/results feed (Zafronix WC API) onto
   our fixtures + knockout bracket. No manual entry; results flow in
   automatically. Returns null on any problem so callers fall back to the
   deterministic engine.

   Free-tier feed: every fixture + kickoff time, `IN_PLAY` while a match
   is being played (no in-play score), final score once it finishes.
   ============================================================ */
import { MATCHES, GROUP_LETTERS } from './fixtures';
import type { KOMatch } from './fixtures';
import { NATION, NATIONS } from './nations';
import type { ScoreEntry } from './types';
import { groupTable } from '../utils/scoring';

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

export interface LiveData { scores: Record<string, ScoreEntry>; ko: KOMatch[]; liveNow: LiveNowMatch[]; dates: Record<string, string>; }

interface FeedMatch {
  id: number | string; stage: string; status: string;
  home: { tla: string | null; name?: string | null; short?: string | null };
  away: { tla: string | null; name?: string | null; short?: string | null };
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

/* ------------------------------------------------------------------
   Bracket-slot resolution. The free-tier feed schedules each knockout
   match with a SLOT CODE (homeRef/awayRef → "1A" winner of A, "2B"
   runner-up of B, "3ABCDF" a best-third from one of those groups) and a
   kickoff time, but doesn't name the actual team until well after the
   group stage ends. We don't wait: the same feed already carries every
   final group result, so we compute the group tables ourselves and fill
   the slots in — winners, runners-up, and the eight best third-placed
   teams — exactly as FIFA does. This also keeps the rest of the app
   correct: elimination/“still alive”/awards all key off which nations
   appear in the bracket, so an unresolved slot would wrongly read as
   "everyone is out."
   ------------------------------------------------------------------ */
function resolveBracketTeams(ko: KOMatch[], scores: Record<string, ScoreEntry>): KOMatch[] {
  const groupDone = (g: string) =>
    MATCHES.filter(m => m.g === g).every(m => { const s = scores[m.i]; return !!s && s.st === 'ft' && s.h != null; });
  const allGroupsDone = GROUP_LETTERS.every(groupDone);

  const winner: Record<string, string> = {};
  const runner: Record<string, string> = {};
  const thirds: { g: string; id: string; pts: number; gd: number; gf: number }[] = [];
  for (const g of GROUP_LETTERS) {
    if (!groupDone(g)) continue;
    const t = groupTable(g, scores);
    if (t[0]) winner[g] = t[0].id;
    if (t[1]) runner[g] = t[1].id;
    if (t[2]) thirds.push({ g, id: t[2].id, pts: t[2].pts, gd: t[2].gd, gf: t[2].gf });
  }
  // FIFA third-place ranking: points, then goal difference, then goals for.
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.g.localeCompare(b.g));
  // Only the eight best third-placed teams advance, and only once every group
  // is final (the ranking spans all 12 groups).
  const best8 = allGroupsDone ? thirds.slice(0, 8) : [];
  const best8Group = new Set(best8.map(x => x.g));

  // Assign each "3<groups>" slot to a qualifying third whose group is in its
  // candidate set, each third used once. Most-constrained slot first, strongest
  // available third to it — a valid, deterministic allocation. (The exact slot a
  // given third lands in can differ from FIFA's official table in rare scenarios;
  // the SET of 32 qualifiers — what elimination/scoring depends on — is exact.)
  const thirdRefs = new Set<string>();
  for (const k of ko) {
    if (!k.h && k.hRef && /^3[A-L]+$/.test(k.hRef)) thirdRefs.add(k.hRef);
    if (!k.a && k.aRef && /^3[A-L]+$/.test(k.aRef)) thirdRefs.add(k.aRef);
  }
  const assign: Record<string, string> = {};
  const usedGroup = new Set<string>();
  const slots = [...thirdRefs]
    .map(ref => ({ ref, cands: ref.slice(1).split('').filter(g => best8Group.has(g)) }))
    .sort((a, b) => a.cands.length - b.cands.length || a.ref.localeCompare(b.ref));
  for (const slot of slots) {
    const pick = best8.find(x => slot.cands.includes(x.g) && !usedGroup.has(x.g));
    if (pick) { assign[slot.ref] = pick.id; usedGroup.add(pick.g); }
  }

  const resolveRef = (ref?: string): string => {
    if (!ref) return '';
    const m = /^([12])([A-L])$/.exec(ref);
    if (m) return (m[1] === '1' ? winner[m[2]] : runner[m[2]]) || '';
    if (/^3[A-L]+$/.test(ref)) return assign[ref] || '';
    return '';   // e.g. "W49" winner-of-match refs (R16+) — resolved later as rounds play
  };

  return ko.map(k => {
    if (k.h && k.a) return k;                 // feed already named both teams
    const h = k.h || resolveRef(k.hRef);
    const a = k.a || resolveRef(k.aRef);
    return (h !== k.h || a !== k.a) ? { ...k, h, a } : k;
  });
}

/** Pure: map the normalized /api/results feed onto our fixtures + bracket.
 *  Shared by the client poll and the server-side notification tick. */
export function mapLive(matches: FeedMatch[]): LiveData {
  const scores: Record<string, ScoreEntry> = {};
  const ko: KOMatch[] = [];
  const liveNow: LiveNowMatch[] = [];
  const dates: Record<string, string> = {};   // fixture mi → real feed kickoff (overrides our placeholder dates)

  for (const m of matches) {
    const h = toId(m.home?.name ?? m.home?.tla);
    const a = toId(m.away?.name ?? m.away?.tla);

    if (m.stage === 'GROUP_STAGE') {
      const st = statusOf(m.status);
      const f = h && a ? PAIR[[h, a].sort().join('|')] : undefined;
      if (f && m.date) dates[f.mi] = m.date;          // keep the schedule honest even for TIMED matches
      if (!st || !h || !a) continue;
      if (st === 'live') liveNow.push({ mi: f?.mi || null, round: null, h, a, date: m.date || '' });
      if (m.hs == null || m.as == null || !f) continue;
      scores[f.mi] = f.home === h ? { h: m.hs, a: m.as, st } : { h: m.as, a: m.hs, st };
      continue;
    }

    const round = STAGE_ROUND[m.stage];
    if (!round) continue;
    // A knockout slot is worth showing as soon as the feed schedules it — even
    // before the draw resolves its teams — so the bracket + schedule appear the
    // moment the group stage wraps. Skip only truly empty slots (no teams, no date).
    const bothKnown = !!(h && a);
    if (!bothKnown && !m.date) continue;
    const st = statusOf(m.status);
    if (st === 'live' && bothKnown) liveNow.push({ mi: null, round, h: h!, a: a!, date: m.date || '' });
    const done = bothKnown && !!st && m.hs != null && m.as != null;
    let pk: string | null = null;
    if (bothKnown) {
      if (m.pens && m.pens.home != null && m.pens.away != null) {
        pk = m.pens.home > m.pens.away ? h : a;
      } else if (done && m.hs === m.as && m.winner) {
        pk = m.winner === 'HOME_TEAM' ? h : m.winner === 'AWAY_TEAM' ? a : null;
      }
    }
    ko.push({
      id: 'api_' + m.id, round,
      h: h || '', a: a || '',
      hRef: h ? undefined : (m.home?.short || undefined),
      aRef: a ? undefined : (m.away?.short || undefined),
      h_s: done ? m.hs : null, a_s: done ? m.as : null,
      st: bothKnown ? (st || 'sched') : 'sched', pk,
      d: (m.date || '').slice(0, 10), dt: m.date || undefined,
    });
  }

  return { scores, ko: resolveBracketTeams(ko, scores), liveNow, dates };
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
