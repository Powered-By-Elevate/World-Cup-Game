/* ============================================================
   COMMISSIONER SCORE OVERRIDES
   ------------------------------------------------------------
   A narrow safety valve over the automatic results feed: if the feed ever
   reports a wrong score, the commissioner can correct one match. Corrections
   are stored per league (AppState.scoreOverrides) and LAYER OVER the live feed
   here, so the rest of the app (standings, bonuses, calls) sees the corrected
   value without any other change. Clearing a correction hands the match back
   to the feed. This is NOT general manual entry — only the commissioner sets
   it, every corrected match is flagged in the UI, and it's fully reversible.
   ============================================================ */
import type { KOMatch } from '../data/fixtures';
import type { ScoreEntry } from '../data/types';

export type ScoreOverride = { h: number; a: number; pk?: string };
export type Overrides = Record<string, ScoreOverride>;

/** Group fixture ids are "g1".."g72"; knockout ids are "api_#". */
export const isGroupId = (id: string) => /^g\d+$/.test(id);

/** Overlay group-fixture corrections onto the feed scores. */
export function applyGroupOverrides(scores: Record<string, ScoreEntry>, overrides: Overrides): Record<string, ScoreEntry> {
  const keys = Object.keys(overrides).filter(isGroupId);
  if (!keys.length) return scores;
  const out = { ...scores };
  for (const id of keys) {
    const o = overrides[id];
    out[id] = { h: o.h, a: o.a, st: 'ft' };
  }
  return out;
}

/** Overlay knockout corrections onto the resolved bracket. A corrected KO match
 *  is final; a level score resolves by the override's `pk` (who advances). */
export function applyKoOverrides(ko: KOMatch[], overrides: Overrides): KOMatch[] {
  const keys = Object.keys(overrides).filter(id => !isGroupId(id));
  if (!keys.length) return ko;
  const set = new Set(keys);
  return ko.map(k => {
    if (!set.has(k.id)) return k;
    const o = overrides[k.id];
    const pk = o.h === o.a ? (o.pk ?? k.pk ?? null) : null;
    return { ...k, h_s: o.h, a_s: o.a, st: 'ft', pk };
  });
}

/** True if a match id currently carries a commissioner correction. */
export const isOverridden = (id: string, overrides?: Overrides) => !!overrides && Object.prototype.hasOwnProperty.call(overrides, id);
