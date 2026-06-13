/* ============================================================
   ARCADE — shared score + challenge store (league-namespaced KV,
   same mechanism as chat: read-modify-write + polled by the app).
   Leaderboards keep ONE best score per person per game; challenges
   are async head-to-heads (each player plays their own leg, scores
   compared when both are in).
   ============================================================ */
import { sget, sset } from './storage';
import { uid } from './helpers';

export type ArcadeGame = 'penalty' | 'soccer' | 'pinball';

export const GAME_META: Record<ArcadeGame, { name: string; emoji: string; cls: string; board: string; verb: string }> = {
  penalty: { name: 'Penalty Streak', emoji: '🥅', cls: 'pen', board: 'best streak', verb: 'scored' },
  soccer:  { name: 'Soccer Stars',   emoji: '⚽', cls: 'soc', board: 'total wins',  verb: 'beat the CPU by' },
  pinball: { name: 'World Cup Pinball', emoji: '🎯', cls: 'pin', board: 'high score', verb: 'scored' },
};
export const GAMES: ArcadeGame[] = ['penalty', 'soccer', 'pinball'];

/** How a game is launched from the Arcade. */
export type LaunchMode =
  | { kind: 'solo' }
  | { kind: 'challenge'; oppId: string; oppName: string }
  | { kind: 'respond'; challengeId: string; oppName: string }
  // live turn-based head-to-head (Soccer Stars): 'live-new' creates+hosts and
  // notifies the opponent, 'live-join' accepts an invite, 'live' is the resolved
  // in-match mode the App renders once a match id + side are known.
  | { kind: 'live-new'; oppId: string; oppName: string }
  | { kind: 'live-join'; matchId: string }
  | { kind: 'live'; matchId: string; side: 'a' | 'b'; oppName?: string };

export interface ScoreEntry { memberId: string; name: string; score: number; ts: number; }

export interface Challenge {
  id: string;
  game: ArcadeGame;
  from: string; fromName: string;     // challenger
  to: string;   toName: string;       // challenged
  fromScore: number | null;           // challenger's leg (set when they play)
  toScore: number | null;             // opponent's leg (set on respond)
  status: 'pending' | 'complete';
  ts: number;
}

const SCORES_KEY = 'wc:arcade:scores';        // { [game]: ScoreEntry[] }
const CH_KEY = 'wc:arcade:challenges';

/* ---------------- leaderboards ---------------- */
export async function loadScores(): Promise<Record<string, ScoreEntry[]>> {
  const r = await sget<Record<string, ScoreEntry[]>>(SCORES_KEY, true);
  return r && typeof r === 'object' ? r : {};
}

/** Record a result. mode 'best' keeps each person's highest (Penalty streak);
 *  mode 'add' accumulates (Soccer total wins — pass value 1 per win). */
export async function recordScore(game: ArcadeGame, memberId: string, name: string, value: number, mode: 'best' | 'add' = 'best'): Promise<void> {
  const all = await loadScores();
  const list = (all[game] = all[game] || []);
  const cur = list.find(e => e.memberId === memberId);
  if (!cur) list.push({ memberId, name, score: value, ts: Date.now() });
  else { cur.score = mode === 'add' ? cur.score + value : Math.max(cur.score, value); cur.name = name; cur.ts = Date.now(); }
  await sset(SCORES_KEY, all, true);
}

export function leaderboard(all: Record<string, ScoreEntry[]>, game: ArcadeGame, top = 5): ScoreEntry[] {
  return [...(all[game] || [])].sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, top);
}

/* ---------------- challenges ---------------- */
export async function loadChallenges(): Promise<Challenge[]> {
  const r = await sget<Challenge[]>(CH_KEY, true);
  return Array.isArray(r) ? r : [];
}

/** Create a head-to-head after the challenger plays their leg. */
export async function createChallenge(
  game: ArcadeGame, from: string, fromName: string, to: string, toName: string, fromScore: number,
): Promise<Challenge> {
  const cur = await loadChallenges();
  const ch: Challenge = { id: uid(), game, from, fromName, to, toName, fromScore, toScore: null, status: 'pending', ts: Date.now() };
  await sset(CH_KEY, [...cur, ch].slice(-120), true);
  return ch;
}

/** The opponent plays their leg → settle the challenge. Returns the settled record. */
export async function respondChallenge(id: string, toScore: number): Promise<Challenge | null> {
  const cur = await loadChallenges();
  const ch = cur.find(c => c.id === id);
  if (!ch) return null;
  ch.toScore = toScore;
  ch.status = 'complete';
  await sset(CH_KEY, cur, true);
  return ch;
}

/** Pending challenges waiting on me to play my leg. */
export function incoming(challenges: Challenge[], meId: string): Challenge[] {
  return challenges.filter(c => c.status === 'pending' && c.to === meId).sort((a, b) => b.ts - a.ts);
}
/** My challenges still waiting on the opponent. */
export function outgoing(challenges: Challenge[], meId: string): Challenge[] {
  return challenges.filter(c => c.status === 'pending' && c.from === meId).sort((a, b) => b.ts - a.ts);
}
/** Settled head-to-heads I was part of. */
export function settled(challenges: Challenge[], meId: string): Challenge[] {
  return challenges.filter(c => c.status === 'complete' && (c.from === meId || c.to === meId)).sort((a, b) => b.ts - a.ts);
}
/** Winner of a settled challenge: memberId, or null for a draw. */
export function winnerOf(c: Challenge): string | null {
  if (c.fromScore == null || c.toScore == null) return null;
  if (c.fromScore === c.toScore) return null;
  return c.fromScore > c.toScore ? c.from : c.to;
}
