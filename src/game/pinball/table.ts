/* ============================================================
   WORLD CUP PINBALL — table geometry, now sourced from Space Cadet's REAL
   table. scData.ts is auto-generated from the decompiled .dat dump (112 wall
   polylines + every part at its true coordinate, normalized to logical TW×TH,
   plunger on the right). This module maps that raw geometry onto the engine's
   entities and soccer-skins the roles:
     • 7 pop bumpers      → midfield jets
     • 2 kickers          → slingshots
     • sinks + kickouts   → the GOAL (one kickout) + hyperspace/lock holes
     • 2 flag spinners    → corner flags
     • targets + rollers  → TACTICS bank + multiplier lanes + scoring banks
     • 2 flippers          → real pivots/angles (faithful, small)
   A hard backstop still guarantees the ball can't escape; only the bottom drains.
   ============================================================ */
import type { Vec } from './vec';
import { v } from './vec';
import {
  type Segment, type Bumper, type Target, type Goal, type Flipper,
  type Hole, type Spinner, type Kickback,
} from './types';
import { SC_TW, SC_TH, SC_WALLS, SC_PARTS, SC_FLIPPERS } from './scData';

export const TW = SC_TW, TH = SC_TH;

const partsOf = (type: string) => SC_PARTS.filter(p => p.type === type);
const flipL = SC_FLIPPERS.find(f => f.side === 'L')!;
const flipR = SC_FLIPPERS.find(f => f.side === 'R')!;

const plunger = partsOf('plunger')[0] || { x: TW - 30, y: TH - 90, r: 2 };
// The ball kicks off from the CENTRE SPOT — Space Cadet's real launch lane is
// only ~14px wide (too tight for a playable ball + wall colliders, so it jams),
// and a centre kick-off is both reliable and thematically a soccer kickoff.
export const SPAWN: Vec = v(205, 210);
export const CHUTE = { x0: plunger.x - 13, x1: plunger.x + 13, top: plunger.y - 150, bottom: plunger.y + 14 };
export const DRAIN_Y = TH - 14;

const kouts = partsOf('kout');

function chain(pts: Vec[], e: number, kind: Segment['kind'] = 'wall'): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], e, kind });
  return out;
}

export function buildSegments(): Segment[] {
  const segs: Segment[] = [];
  // hard outer backstop (containment; the real walls sit just inside)
  segs.push(
    { a: v(3, 3), b: v(3, TH), e: 0.3, kind: 'wall' },
    { a: v(3, 3), b: v(TW - 3, 3), e: 0.3, kind: 'wall' },
    { a: v(TW - 3, 3), b: v(TW - 3, TH), e: 0.3, kind: 'wall' },
  );
  // every real Space Cadet wall polyline
  for (const poly of SC_WALLS) {
    if (poly.length < 2) continue;
    segs.push(...chain(poly.map(([x, y]) => v(x, y)), 0.34, 'wall'));
  }
  // slingshot kicking faces over the two real kickers
  for (const k of partsOf('kicker')) {
    segs.push({ a: v(k.x - 16, k.y + 10), b: v(k.x + 16, k.y + 10), e: 0.6, kind: 'sling', kick: 360, score: 110, light: 'sl' });
  }
  return segs;
}

export function buildBumpers(): Bumper[] {
  const cols = ['#E1342B', '#1769FF', '#FFC400'];
  return partsOf('bumper').map((p, i) => ({
    id: 'b' + i, p: v(p.x, p.y), r: Math.max(11, p.r || 0),
    e: 0.5, kick: 420, score: 250, color: cols[i % 3], lit: 0,
  }));
}

export function buildTargets(): Target[] {
  const out: Target[] = [];
  // rollovers: the 3 highest become the multiplier lanes; the rest just score
  const rolls = [...partsOf('roll'), ...partsOf('rollG')].sort((a, b) => a.y - b.y);
  rolls.forEach((p, i) => out.push({
    id: 'ro' + i, p: v(p.x, p.y), r: 9, score: 150, lit: 0, on: false,
    kind: 'rollover', group: i < 3 ? 'mult' : 'lane',
  }));
  // standing targets: a left cluster becomes TACTICS (cues the mission); rest score
  const tgts = [...partsOf('yTarget'), ...partsOf('rTarget')];
  const tactics = [...tgts].sort((a, b) => a.x - b.x).slice(0, 3);
  tgts.forEach((p, i) => out.push({
    id: 'tg' + i, p: v(p.x, p.y), r: 8, score: 200, lit: 0, on: false,
    kind: 'target', group: tactics.includes(p) ? 'tactics' : 'bank',
  }));
  return out;
}

export function buildGoal(): Goal {
  // the decorative GOAL net at top-centre is also a sensor zone (matches the
  // design art at 176,15 → 234,40). Reachable via the top orbit.
  return { p: v(176, 15), w: 58, h: 26, lit: 0 };
}

export function buildHoles(): Hole[] {
  // every sink + kickout. The gold kickout (≈x249) is the LOCK; the cyan one
  // (≈x152, the TUNNEL) and the sinks are hyperspace holes — matching the skin.
  const holes = [...kouts, ...partsOf('sink')];
  return holes.map((p, i) => ({
    id: 'h' + i, p: v(p.x, p.y), r: Math.max(9, p.r || 0),
    kind: (p.type === 'kout' && p.x > 200) ? 'lock' as const : 'hyper' as const, lit: 0, locked: 0,
  }));
}

export function buildSpinner(): Spinner {
  const f = partsOf('flag')[0] || { x: 30, y: 150 };
  return { id: 'flag', a: v(f.x - 12, f.y), b: v(f.x + 12, f.y), spin: 0, value: 90 };
}

export function buildKickback(): Kickback {
  // left outlane saver, just inside the left flipper
  return { p: v(Math.min(flipL.x, flipR.x) - 34, TH - 24), r: 12, armed: true };
}

export function buildFlippers(): Flipper[] {
  // the design's flippers are small; a slightly fatter collision radius makes
  // them reliably catch the ball while still leaving a centre drain gap so you
  // can actually lose (the controls, not the board art).
  return SC_FLIPPERS.map(f => ({
    side: f.side, pivot: v(f.x, f.y), len: f.len, r: 6.5,
    rest: f.rest, up: f.up, angle: f.rest, omega: 0, pressed: false,
  }));
}

export const flipperTip = (f: Flipper): Vec => v(f.pivot.x + Math.cos(f.angle) * f.len, f.pivot.y + Math.sin(f.angle) * f.len);
