/* ============================================================
   WORLD CUP PINBALL — playable table geometry (hand-tuned for real pinball
   feel on a phone). 360×620 portrait. Generous flippers that actually catch
   the ball, a sensible central drain + side outlanes, pop bumpers, slingshots,
   two kickout holes (TUNNEL/LOCK), a spinner, a top GOAL net, rollover lanes
   and a TACTICS target bank. The ball KICKS OFF from the centre spot (a
   reliable launch + thematic soccer kickoff). A hard backstop guarantees the
   ball can't leave the table; the only opening is the bottom drain.

   (Space Cadet's authentic .dat micro-geometry is too cramped to play at phone
   scale — narrow lanes jam the ball — so this is purpose-built and dressed in
   the same World-Cup design language by the renderer.)
   ============================================================ */
import type { Vec } from './vec';
import { v } from './vec';
import {
  type Segment, type Bumper, type Target, type Goal, type Flipper,
  type Hole, type Spinner, type Kickback,
} from './types';

export const TW = 360, TH = 620;
export const SPAWN: Vec = v(180, 312);     // centre spot — the ball kicks off here
export const DRAIN_Y = 612;
export const CHUTE = { x0: 320, x1: 350, top: 150, bottom: 600 };  // legacy (unused by render)

/* flipper pivots/lengths shared with the renderer + de-dup math */
const D = Math.PI / 180;
const FLIP = {
  L: { pivot: v(118, 556), len: 56, r: 11, rest: 28 * D, up: -26 * D },
  R: { pivot: v(242, 556), len: 56, r: 11, rest: 152 * D, up: 206 * D },
};

function chain(pts: Vec[], e: number, kind: Segment['kind'] = 'wall'): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], e, kind });
  return out;
}

export function buildSegments(): Segment[] {
  const s: Segment[] = [];
  // hard outer backstop (containment; only the bottom drains)
  s.push(
    { a: v(6, 6), b: v(6, TH), e: 0.3, kind: 'wall' },
    { a: v(6, 6), b: v(TW - 6, 6), e: 0.3, kind: 'wall' },
    { a: v(TW - 6, 6), b: v(TW - 6, TH), e: 0.3, kind: 'wall' },
  );
  // outer playfield boundary: left wall → top arc → right wall
  s.push(...chain([
    v(24, 470), v(24, 150), v(34, 108), v(64, 72), v(110, 46),
    v(165, 34), v(195, 34), v(250, 46), v(296, 72), v(326, 108), v(336, 150), v(336, 470),
  ], 0.4, 'wall'));
  // lower funnels down to the flippers (the gaps beside the flippers = outlanes)
  s.push(...chain([v(24, 470), v(24, 542), v(72, 592), v(96, 602)], 0.35, 'wall'));
  s.push(...chain([v(336, 470), v(336, 542), v(288, 592), v(264, 602)], 0.35, 'wall'));
  // slingshots (kicking faces above each flipper) + their top guards
  s.push({ a: v(96, 502), b: v(150, 538), e: 0.7, kind: 'sling', kick: 640, score: 110, light: 'slL' });
  s.push({ a: v(264, 502), b: v(210, 538), e: 0.7, kind: 'sling', kick: 640, score: 110, light: 'slR' });
  s.push(...chain([v(96, 502), v(104, 480)], 0.4, 'wall'));
  s.push(...chain([v(264, 502), v(256, 480)], 0.4, 'wall'));
  return s;
}

export function buildBumpers(): Bumper[] {
  const mk = (id: string, x: number, y: number, color: string): Bumper =>
    ({ id, p: v(x, y), r: 20, e: 0.5, kick: 600, score: 250, color, lit: 0 });
  return [
    mk('b1', 140, 244, '#D80000'),   // red
    mk('b2', 220, 244, '#6000F0'),   // purple
    mk('b3', 180, 188, '#00C060'),   // emerald
  ];
}

export function buildTargets(): Target[] {
  const roll = (id: string, x: number, y: number): Target =>
    ({ id, p: v(x, y), r: 12, score: 150, lit: 0, on: false, kind: 'rollover', group: 'mult' });
  const tgt = (id: string, x: number, y: number): Target =>
    ({ id, p: v(x, y), r: 9, score: 200, lit: 0, on: false, kind: 'target', group: 'tactics' });
  return [
    roll('r1', 120, 96), roll('r2', 180, 86), roll('r3', 240, 96),
    tgt('t1', 44, 336), tgt('t2', 40, 368), tgt('t3', 44, 400),
  ];
}

export function buildGoal(): Goal {
  return { p: v(150, 28), w: 60, h: 30, lit: 0 };
}

export function buildHoles(): Hole[] {
  return [
    { id: 'tunnel', p: v(110, 304), r: 14, kind: 'hyper', lit: 0, locked: 0 },
    { id: 'lock', p: v(250, 304), r: 14, kind: 'lock', lit: 0, locked: 0 },
  ];
}

export function buildSpinner(): Spinner {
  return { id: 'flag', a: v(24, 206), b: v(50, 206), spin: 0, value: 90 };
}

export function buildKickback(): Kickback {
  return { p: v(78, 596), r: 14, armed: true };
}

export function buildFlippers(): Flipper[] {
  return [
    { side: 'L', pivot: FLIP.L.pivot, len: FLIP.L.len, r: FLIP.L.r, rest: FLIP.L.rest, up: FLIP.L.up, angle: FLIP.L.rest, omega: 0, pressed: false },
    { side: 'R', pivot: FLIP.R.pivot, len: FLIP.R.len, r: FLIP.R.r, rest: FLIP.R.rest, up: FLIP.R.up, angle: FLIP.R.rest, omega: 0, pressed: false },
  ];
}

export const flipperTip = (f: Flipper): Vec => v(f.pivot.x + Math.cos(f.angle) * f.len, f.pivot.y + Math.sin(f.angle) * f.len);
