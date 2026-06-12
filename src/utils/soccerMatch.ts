/* ============================================================
   SOCCER STARS — LIVE multiplayer match store (turn-based, polled).

   Unlike the async score-compare challenges in arcade.ts, this is a live
   head-to-head: two players share one authoritative match state and alternate
   turns. State lives in the league-namespaced shared KV, polled (~1.5s) by both
   clients — turn-based play tolerates that latency, so no realtime socket needed.

   Sync model ("watch it animate"): the player on turn simulates their shot
   LOCALLY (deterministic physics), then writes the resulting board + the shot
   parameters (`lastShot`). The opponent replays `lastShot` from its own copy of
   the pre-shot board to animate the motion, then snaps to the authoritative
   `bodies` the shooter wrote — so floating-point drift can never desync the game.

   Concurrency: every turn bumps `seq`; submitTurn is a compare-and-set on `seq`
   so two writes can't clobber each other. One match per key `wc:soccer:m:<id>`
   to avoid the write contention a single big list would cause mid-rally.
   ============================================================ */
import { sget, sset } from './storage';
import { uid } from './helpers';

/** A physics body serialized for the wire (positions + velocities only). */
export interface WireBody { x: number; y: number; vx: number; vy: number; kind: 'me' | 'cpu' | 'ball'; keeper?: boolean; }

export interface MatchPlayer { id: string; name: string; nation: string; }

/** The shot that produced the current board, for the opponent to replay. `disc`
 *  is the index into `bodies` of the disc that was struck; (vx,vy) its launch
 *  velocity. `by` is which side took it. */
export interface LastShot { by: 'a' | 'b'; disc: number; vx: number; vy: number; }

export type MatchStatus = 'waiting' | 'active' | 'over' | 'declined' | 'abandoned';

export interface SoccerMatch {
  id: string;
  a: MatchPlayer;                 // challenger — defends the LEFT goal, is 'me' bodies
  b: MatchPlayer | null;          // opponent — defends the RIGHT goal, is 'cpu' bodies; null until they join
  invitee?: { id: string; name: string };  // who was challenged (for the waiting lobby before they join)
  status: MatchStatus;
  turn: 'a' | 'b';                // whose turn it is to shoot
  score: { a: number; b: number };
  bodies: WireBody[];             // authoritative board (resting positions between turns)
  lastShot: LastShot | null;      // the most recent shot, for replay
  seq: number;                    // monotonic state version — turn counter + CAS guard
  winner: 'a' | 'b' | null;
  rematch: { a: boolean; b: boolean };
  ts: number;                     // last write (epoch ms)
}

export const WIN_GOALS = 3;
const matchKey = (id: string) => `wc:soccer:m:${id}`;
const OPEN_KEY = 'wc:soccer:open';   // lightweight index of pending invites for discovery

/** A pending invite as shown in the Arcade before the match starts. */
export interface OpenInvite { id: string; from: string; fromName: string; fromNation: string; to: string; toName: string; ts: number; }

/* ---------------- lobby / invites ---------------- */

export async function loadOpenInvites(): Promise<OpenInvite[]> {
  const r = await sget<OpenInvite[]>(OPEN_KEY, true);
  return Array.isArray(r) ? r : [];
}

/** Invites waiting for ME to accept. */
export function invitesForMe(list: OpenInvite[], meId: string): OpenInvite[] {
  return list.filter(i => i.to === meId).sort((a, b) => b.ts - a.ts);
}
/** My invites still waiting on the opponent. */
export function invitesFromMe(list: OpenInvite[], meId: string): OpenInvite[] {
  return list.filter(i => i.from === meId).sort((a, b) => b.ts - a.ts);
}

/** Create a live-match invite (status `waiting`) and index it for discovery.
 *  The caller also fires a notification to `to` with the returned match id. */
export async function createInvite(from: MatchPlayer, to: { id: string; name: string }): Promise<SoccerMatch> {
  const now = Date.now();
  const match: SoccerMatch = {
    id: uid(),
    a: from,
    b: null,
    invitee: { id: to.id, name: to.name },
    status: 'waiting',
    turn: 'a',
    score: { a: 0, b: 0 },
    bodies: [],
    lastShot: null,
    seq: 0,
    winner: null,
    rematch: { a: false, b: false },
    ts: now,
  };
  await sset(matchKey(match.id), match, true);
  const open = await loadOpenInvites();
  const invite: OpenInvite = { id: match.id, from: from.id, fromName: from.name, fromNation: from.nation, to: to.id, toName: to.name, ts: now };
  // prune anything older than 15 min so the lobby never shows stale invites
  const fresh = open.filter(i => now - i.ts < 15 * 60_000 && i.id !== match.id);
  await sset(OPEN_KEY, [...fresh, invite].slice(-60), true);
  return match;
}

async function dropInvite(id: string): Promise<void> {
  const open = await loadOpenInvites();
  const next = open.filter(i => i.id !== id);
  if (next.length !== open.length) await sset(OPEN_KEY, next, true);
}

/* ---------------- match lifecycle ---------------- */

export async function loadMatch(id: string): Promise<SoccerMatch | null> {
  return sget<SoccerMatch>(matchKey(id), true);
}

async function saveMatch(m: SoccerMatch): Promise<void> {
  m.ts = Date.now();
  await sset(matchKey(m.id), m, true);
}

/** Opponent accepts: seats player B, lays down the opening board, starts play on
 *  A's turn. `bodies` is the kickoff formation (the component owns the physics). */
export async function joinMatch(id: string, b: MatchPlayer, bodies: WireBody[]): Promise<SoccerMatch | null> {
  const m = await loadMatch(id);
  if (!m || m.status !== 'waiting') return null;
  m.b = b;
  m.status = 'active';
  m.bodies = bodies;
  m.turn = 'a';
  m.seq = 1;
  await saveMatch(m);
  await dropInvite(id);
  return m;
}

/** Opponent declines (or the invite is cancelled). */
export async function declineMatch(id: string): Promise<void> {
  const m = await loadMatch(id);
  if (m && m.status === 'waiting') { m.status = 'declined'; await saveMatch(m); }
  await dropInvite(id);
}

/**
 * Apply a completed turn. Compare-and-set on `seq`: if the stored match has
 * advanced past `fromSeq` (the seq the shooter started from), the write is
 * rejected (stale) and the caller should re-sync. On success the turn flips,
 * the score/winner update, and `seq` increments.
 */
export async function submitTurn(
  id: string,
  fromSeq: number,
  patch: { bodies: WireBody[]; lastShot: LastShot; score: { a: number; b: number }; scored: boolean },
): Promise<SoccerMatch | null> {
  const m = await loadMatch(id);
  if (!m || m.status !== 'active' || m.seq !== fromSeq) return null;   // stale / not your turn
  m.bodies = patch.bodies;
  m.lastShot = patch.lastShot;
  m.score = patch.score;
  m.seq = fromSeq + 1;
  // Turn always passes to the other side — on a goal the board resets and the
  // conceding side kicks off, matching the single-player game the family knows.
  const shooter = patch.lastShot.by;
  m.turn = shooter === 'a' ? 'b' : 'a';
  if (m.score.a >= WIN_GOALS) { m.status = 'over'; m.winner = 'a'; }
  else if (m.score.b >= WIN_GOALS) { m.status = 'over'; m.winner = 'b'; }
  await saveMatch(m);
  return m;
}

/** Flag a rematch from one side; when both sides agree, reset to a fresh board. */
export async function requestRematch(id: string, side: 'a' | 'b', bodies: WireBody[]): Promise<SoccerMatch | null> {
  const m = await loadMatch(id);
  if (!m) return null;
  m.rematch[side] = true;
  if (m.rematch.a && m.rematch.b) {
    m.status = 'active';
    m.score = { a: 0, b: 0 };
    m.bodies = bodies;
    m.turn = 'a';
    m.seq = m.seq + 1;
    m.lastShot = null;
    m.winner = null;
    m.rematch = { a: false, b: false };
  }
  await saveMatch(m);
  return m;
}

/** Leave a match (close the tab, quit). Marks it abandoned for the other side. */
export async function abandonMatch(id: string, side: 'a' | 'b'): Promise<void> {
  const m = await loadMatch(id);
  if (!m || m.status === 'over') return;
  m.status = 'abandoned';
  m.winner = side === 'a' ? 'b' : 'a';
  await saveMatch(m);
  await dropInvite(id);
}

/** Which side a given member is in a match (or null if they're not in it). */
export function sideOf(m: SoccerMatch, meId: string): 'a' | 'b' | null {
  if (m.a.id === meId) return 'a';
  if (m.b?.id === meId) return 'b';
  return null;
}
