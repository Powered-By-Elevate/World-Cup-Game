/* ============================================================
   CALLS OF THE DAY — a one-tap daily prediction mini-game.

   Every day, the full slate: each of today's fixtures asks "Who wins?"
   Anyone can play (it's a coin-flip, no soccer knowledge needed).
   Each pick locks at that match's kickoff and resolves from the
   SAME results the rest of the app already derives (live feed or the demo
   engine) — there is no manual entry here either. A separate "Best Caller"
   leaderboard tracks who calls it right most often.

   Scope: the whole tournament — all 72 group fixtures PLUS every knockout match
   once its teams are resolved and it has a kickoff time. Knockouts flow in
   through the same live feed / bracket resolver the rest of the app uses.
   ============================================================ */
import { MATCHES } from '../data/fixtures';
import type { Match, KOMatch } from '../data/fixtures';
import type { ScoreEntry } from '../data/types';
import { parseDate, dayKeyOf } from './helpers';

/** memberId → matchId → picked nation id. */
export type CallsMap = Record<string, Record<string, string>>;

/** A callable fixture — a group match, or a knockout match once both teams are
 *  known and it has a kickoff time. */
export interface Callable { i: string; d: string; h: string; a: string; ko?: boolean; round?: string }

const MATCH_BY_ID: Record<string, Match> = Object.fromEntries(MATCHES.map(m => [m.i, m]));
const GROUP_CALLABLES: Callable[] = MATCHES.map(m => ({ i: m.i, d: m.d, h: m.h, a: m.a }));

/** Knockout matches ready to call: both teams resolved and a kickoff set. */
export function koCallables(ko: KOMatch[]): Callable[] {
  return (ko || [])
    .filter(k => !!k.h && !!k.a && !!(k.dt || k.d))
    .map(k => ({ i: k.id, d: (k.dt || k.d)!, h: k.h, a: k.a, ko: true, round: k.round }));
}

/** The full callable pool (group + resolved knockouts), in true kickoff order. */
function pool(ko: KOMatch[]): Callable[] {
  return [...GROUP_CALLABLES, ...koCallables(ko)].sort((a, b) => parseDate(a.d).getTime() - parseDate(b.d).getTime());
}

/** id → callable, across group + knockout fixtures. */
function callableById(ko: KOMatch[]): Record<string, Callable> {
  return Object.fromEntries(pool(ko).map(c => [c.i, c]));
}

/** ET calendar day of an epoch — matches how the schedule groups days. */
const etDay = (now: number) => dayKeyOf(new Date(now).toISOString());

/** Today's slate: every callable fixture (group OR knockout) kicking off today,
 *  each open until its own kickoff. Spans the whole tournament now. */
export function todaySlate(now: number, ko: KOMatch[] = []): Callable[] {
  const key = etDay(now);
  return pool(ko).filter(c => dayKeyOf(c.d) === key);
}

/** The next day that has callable fixtures after today — for the "come back"
 *  footer. Empty only once the FINAL has been played. */
export function nextSlate(now: number, ko: KOMatch[] = []): Callable[] {
  const key = etDay(now);
  const all = pool(ko);
  const next = all.find(c => dayKeyOf(c.d) > key);
  return next ? all.filter(c => dayKeyOf(c.d) === dayKeyOf(next.d)) : [];
}

/** A fixture is still open for calls until its own kickoff. */
export function isCallOpen(m: { d: string }, now: number): boolean {
  return parseDate(m.d).getTime() > now;
}

export type Verdict = 'correct' | 'wrong' | 'push' | 'pending';

/** Resolve one call from the app's derived results. A group draw is a "push" —
 *  it neither scores nor breaks a streak. A knockout always has a winner (extra
 *  time / penalties), so there's no push there. */
export function callVerdict(matchId: string, pick: string, scores: Record<string, ScoreEntry>, ko: KOMatch[] = []): Verdict {
  const m = MATCH_BY_ID[matchId];
  if (m) {
    const sc = scores[m.i];
    if (!sc || sc.st !== 'ft' || sc.h == null || sc.a == null) return 'pending';
    if (sc.h === sc.a) return 'push';
    const winner = sc.h > sc.a ? m.h : m.a;   // scores are oriented to fixture home/away
    return winner === pick ? 'correct' : 'wrong';
  }
  const k = (ko || []).find(x => x.id === matchId);
  if (!k || k.st !== 'ft' || k.h_s == null || k.a_s == null) return 'pending';
  const winner = k.h_s > k.a_s ? k.h : k.a_s > k.h_s ? k.a : k.pk;   // level → penalty winner
  if (!winner) return 'pending';
  return winner === pick ? 'correct' : 'wrong';
}

export interface NameInfo { name: string; team: string; }

export interface CallerStat {
  memberId: string;
  name: string;
  team: string;
  correct: number;
  wrong: number;
  push: number;
  pending: number;
  called: number;
  decided: number;   // correct + wrong
  accuracy: number;  // 0..1 over decided calls
  streak: number;    // current run of correct calls (pushes are neutral)
  best: number;      // best streak reached
}

/** Build the Best Caller standings from everyone's calls + the live results
 *  (group fixtures and knockout matches alike). */
export function callerStats(
  calls: CallsMap,
  scores: Record<string, ScoreEntry>,
  names: Record<string, NameInfo>,
  ko: KOMatch[] = [],
): CallerStat[] {
  const lookup = callableById(ko);
  const out: CallerStat[] = [];
  for (const [memberId, picks] of Object.entries(calls || {})) {
    const info = names[memberId];
    if (!info || !picks) continue;   // skip members who've left/been removed
    // chronological by kickoff so streaks read in real-world order
    const entries = Object.entries(picks)
      .map(([mid, pick]) => ({ c: lookup[mid], pick }))
      .filter((e): e is { c: Callable; pick: string } => !!e.c)
      .sort((a, b) => parseDate(a.c.d).getTime() - parseDate(b.c.d).getTime());

    let correct = 0, wrong = 0, push = 0, pending = 0, streak = 0, best = 0;
    for (const e of entries) {
      const v = callVerdict(e.c.i, e.pick, scores, ko);
      if (v === 'correct') { correct++; streak++; if (streak > best) best = streak; }
      else if (v === 'wrong') { wrong++; streak = 0; }
      else if (v === 'push') { push++; }
      else { pending++; }
    }
    const decided = correct + wrong;
    out.push({
      memberId, name: info.name, team: info.team,
      correct, wrong, push, pending,
      called: entries.length, decided,
      accuracy: decided ? correct / decided : 0,
      streak, best,
    });
  }
  out.sort((a, b) =>
    b.correct - a.correct ||
    b.accuracy - a.accuracy ||
    a.wrong - b.wrong ||
    b.called - a.called ||
    a.name.localeCompare(b.name),
  );
  return out;
}
