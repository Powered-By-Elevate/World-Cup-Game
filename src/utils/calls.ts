/* ============================================================
   CALLS OF THE DAY — a one-tap daily prediction mini-game.

   Every day, the full slate: each of today's fixtures asks "Who wins?"
   Anyone can play (it's a coin-flip, no soccer knowledge needed).
   Each pick locks at that match's kickoff and resolves from the
   SAME results the rest of the app already derives (live feed or the demo
   engine) — there is no manual entry here either. A separate "Best Caller"
   leaderboard tracks who calls it right most often.

   Scope: the 72 group-stage fixtures, which all have real kickoff datetimes
   and known teams. (Knockouts have no fixed times until the bracket fills, so
   they're a future extension.)
   ============================================================ */
import { MATCHES } from '../data/fixtures';
import type { Match } from '../data/fixtures';
import type { ScoreEntry } from '../data/types';
import { parseDate } from './helpers';

/** memberId → matchId → picked nation id. */
export type CallsMap = Record<string, Record<string, string>>;

const MATCH_BY_ID: Record<string, Match> = Object.fromEntries(MATCHES.map(m => [m.i, m]));
/** Group fixtures in kickoff order — the pool the daily Call draws from. */
const SORTED: Match[] = [...MATCHES].sort((a, b) => a.d.localeCompare(b.d));

/** Local calendar-day key for a timestamp (matches dayKeyOf on fixture strings). */
function dayKeyOfNow(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's slate: EVERY group fixture kicking off on today's calendar day.
 *  Each one is callable until its own kickoff — you call the whole day's games,
 *  but you can't run ahead and call tomorrow's. */
export function todaySlate(now: number): Match[] {
  const key = dayKeyOfNow(now);
  return SORTED.filter(m => m.d.slice(0, 10) === key);
}

/** The next day that has group fixtures after today — for the "come back" footer.
 *  Returns the fixtures of that day (empty once the group stage is over). */
export function nextSlate(now: number): Match[] {
  const key = dayKeyOfNow(now);
  const next = SORTED.find(m => m.d.slice(0, 10) > key);
  return next ? SORTED.filter(m => m.d.slice(0, 10) === next.d.slice(0, 10)) : [];
}

/** A fixture is still open for calls until its own kickoff. */
export function isCallOpen(m: Match, now: number): boolean {
  return parseDate(m.d).getTime() > now;
}

export type Verdict = 'correct' | 'wrong' | 'push' | 'pending';

/** Resolve one call from the app's derived scores. A draw is a "push" — it
 *  neither scores nor breaks a streak, keeping the 50/50 framing honest. */
export function callVerdict(matchId: string, pick: string, scores: Record<string, ScoreEntry>): Verdict {
  const m = MATCH_BY_ID[matchId];
  if (!m) return 'pending';
  const sc = scores[m.i];
  if (!sc || sc.st !== 'ft' || sc.h == null || sc.a == null) return 'pending';
  if (sc.h === sc.a) return 'push';
  const winner = sc.h > sc.a ? m.h : m.a;   // scores are oriented to fixture home/away
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

/** Build the Best Caller standings from everyone's calls + the live scores. */
export function callerStats(
  calls: CallsMap,
  scores: Record<string, ScoreEntry>,
  names: Record<string, NameInfo>,
): CallerStat[] {
  const out: CallerStat[] = [];
  for (const [memberId, picks] of Object.entries(calls || {})) {
    const info = names[memberId];
    if (!info || !picks) continue;   // skip members who've left/been removed
    // chronological by kickoff so streaks read in real-world order
    const entries = Object.entries(picks)
      .map(([mid, pick]) => ({ m: MATCH_BY_ID[mid], pick }))
      .filter((e): e is { m: Match; pick: string } => !!e.m)
      .sort((a, b) => a.m.d.localeCompare(b.m.d));

    let correct = 0, wrong = 0, push = 0, pending = 0, streak = 0, best = 0;
    for (const e of entries) {
      const v = callVerdict(e.m.i, e.pick, scores);
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
