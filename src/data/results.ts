/* ============================================================
   AUTOMATIC RESULTS ENGINE
   ------------------------------------------------------------
   There is NO manual score entry anywhere in this app. Results are
   produced deterministically from the fixture list, so every device in a
   league computes the exact same scores and knockout bracket with no typing
   and no central writer.

   For the live 2026 tournament this module is the single seam to swap in a
   real results feed: replace `groupResults()` / `knockoutResults()` with an
   API-backed source (keyed by the same fixture ids) and the rest of the app
   is unchanged.
   ============================================================ */
import { MATCHES, GROUP_LETTERS } from './fixtures';
import type { KOMatch } from './fixtures';
import type { ScoreEntry } from './types';
import { groupTable } from '../utils/scoring';

/* ---- tiny deterministic RNG (string-seeded) ---- */
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const goals = (x: number) => (x < 0.20 ? 0 : x < 0.48 ? 1 : x < 0.74 ? 2 : x < 0.90 ? 3 : 4);

/* ---- group stage: every fixture played, deterministic ---- */
export function groupResults(): Record<string, ScoreEntry> {
  const out: Record<string, ScoreEntry> = {};
  for (const m of MATCHES) {
    const r = rng('grp:' + m.i);
    out[m.i] = { h: goals(r()), a: goals(r()), st: 'ft' };
  }
  return out;
}

/* ---- knockouts: derive 32 qualifiers, seed a bracket, play it out ---- */
export function knockoutResults(scores: Record<string, ScoreEntry>): KOMatch[] {
  type Q = { id: string; pts: number; gd: number; gf: number };
  const winners: Q[] = [], runners: Q[] = [], thirds: Q[] = [];
  for (const g of GROUP_LETTERS) {
    const t = groupTable(g, scores);
    if (t[0]) winners.push(t[0]);
    if (t[1]) runners.push(t[1]);
    if (t[2]) thirds.push(t[2]);
  }
  const byStrength = (a: Q, b: Q) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.id.localeCompare(b.id);
  thirds.sort(byStrength);
  const pool = [...winners, ...runners, ...thirds.slice(0, 8)].sort(byStrength).slice(0, 32);
  if (pool.length < 2) return [];

  const ROUNDS = ['R32', 'R16', 'QF', 'SF', 'Final'] as const;
  const KO_DATE: Record<string, string> = { R32: '2026-06-30', R16: '2026-07-05', QF: '2026-07-10', SF: '2026-07-14', Final: '2026-07-19' };
  const out: KOMatch[] = [];

  // standard seeding for the first round: best vs worst
  let cur: string[] = [];
  const n = pool.length;
  for (let i = 0; i < n / 2; i++) { cur.push(pool[i].id); cur.push(pool[n - 1 - i].id); }

  for (const round of ROUNDS) {
    if (cur.length < 2) break;
    const next: string[] = [];
    for (let i = 0; i + 1 < cur.length; i += 2) {
      const h = cur[i], a = cur[i + 1];
      const r = rng(round + ':' + h + ':' + a);
      const hs = goals(r()), as = goals(r());
      const pk = hs === as ? (r() < 0.5 ? h : a) : null;
      out.push({ id: `ko_${round}_${i}`, round, h, a, h_s: hs, a_s: as, st: 'ft', pk, d: KO_DATE[round] });
      next.push(hs > as ? h : as > hs ? a : (pk as string));
    }
    cur = next;
  }
  return out;
}
