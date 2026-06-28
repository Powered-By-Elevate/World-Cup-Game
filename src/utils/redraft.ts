/* ============================================================
   ONE-TIME KNOCKOUT RE-DRAFT
   ------------------------------------------------------------
   Every team should enter the knockouts with three live nations. Any pick
   that survived the group stage stays; any pick eliminated in the groups is
   replaced — once, automatically, the moment the group stage is final, then
   locked forever (guarded by AppState.redraftDone).

   Rules (operator-specified):
   • Replacement pool = nations that REACHED the Round of 32 and aren't owned
     by any team (originals stay owned; an assigned replacement becomes owned).
   • Tier cascade — a Favorite is NEVER handed out as a replacement:
       lost FAV → best surviving UND → else LNG → else "outsider"
       lost UND → best surviving UND → else LNG → else "outsider"
       lost LNG → best surviving LNG → else "outsider"
     "outsider" = a surviving nation left OUT of the draft pots entirely
     (custom-pot leftovers). "Best" within a tier = strongest group record
     (points, then goal difference, then goals for).
   • Order = worst-standing team first, serpentine across multiple rounds (a
     team with two dead picks replaces in round 1 and round 2, etc.).
   • The eliminated nation keeps the group points it already earned; the
     replacement earns knockout points only (handled in scoring.teamStats).

   Deterministic: identical inputs → identical output on every device, so it's
   safe for any client to compute and persist (idempotent via redraftDone).
   ============================================================ */
import type { AppState, Team, Scoring, ScoreEntry } from '../data/types';
import type { KOMatch } from '../data/fixtures';
import { POT_KEYS } from '../data/nations';
import { qualifierInfo, teamStats } from './scoring';

type Tier = 'FAV' | 'UND' | 'LNG' | 'OUT';

const CASCADE: Record<string, Tier[]> = {
  FAV: ['UND', 'LNG', 'OUT'],
  UND: ['UND', 'LNG', 'OUT'],
  LNG: ['LNG', 'OUT'],
};

export interface RedraftResult {
  /** teamId → pot key → replacement nation id. */
  byTeam: Record<string, Record<string, string>>;
  changed: boolean;
}

/** Compute the one-time replacements. Returns no changes until every group is
 *  final, or if no team holds an eliminated nation. */
export function computeRedraft(
  state: AppState,
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring,
): RedraftResult {
  const { set: qualified, strength, allGroupsDone } = qualifierInfo(scores);
  if (!allGroupsDone) return { byTeam: {}, changed: false };

  const teams = state.teams || [];
  const pots = state.pots || { FAV: [], UND: [], LNG: [] };

  const tierOf = (nid: string): Tier =>
    (pots.FAV || []).includes(nid) ? 'FAV'
      : (pots.UND || []).includes(nid) ? 'UND'
        : (pots.LNG || []).includes(nid) ? 'LNG'
          : 'OUT';

  // Originals held by any team stay owned and out of the pool.
  const owned = new Set<string>();
  for (const t of teams) for (const pk of POT_KEYS) { const n = t.picks?.[pk]; if (n) owned.add(n); }

  // A team's eliminated slots (drafted nation didn't reach R32), in pot order.
  const elimSlots = (t: Team) => POT_KEYS.filter(pk => { const n = t.picks?.[pk]; return !!n && !qualified.has(n); });

  const strengthOf = (id: string) => strength[id] || { pts: -1, gd: -1, gf: -1 };
  const bestAvailable = (tier: Tier): string | null => {
    const cands = [...qualified].filter(id => !owned.has(id) && tierOf(id) === tier);
    cands.sort((x, y) => {
      const a = strengthOf(x), b = strengthOf(y);
      return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || x.localeCompare(y);
    });
    return cands[0] || null;
  };

  // Worst standing first (ascending total), stable tiebreak by name.
  const order = [...teams].sort((a, b) =>
    teamStats(a, scores, ko, scoring).total - teamStats(b, scores, ko, scoring).total
    || a.name.localeCompare(b.name));

  const byTeam: Record<string, Record<string, string>> = {};
  const maxRounds = teams.reduce((m, t) => Math.max(m, elimSlots(t).length), 0);
  for (let r = 0; r < maxRounds; r++) {
    const round = r % 2 === 0 ? order : [...order].reverse();   // serpentine
    for (const t of round) {
      const slots = elimSlots(t);
      if (slots.length <= r) continue;
      const pk = slots[r];                       // r-th eliminated slot (pot order)
      let repl: string | null = null;
      for (const tier of (CASCADE[pk] || ['OUT'])) { repl = bestAvailable(tier); if (repl) break; }
      if (!repl) continue;
      owned.add(repl);
      (byTeam[t.id] ||= {})[pk] = repl;
    }
  }

  return { byTeam, changed: Object.keys(byTeam).length > 0 };
}
