/* ============================================================
   WORLD CUP PINBALL — playable table geometry (purpose-built to PLAY, dressed
   in the World-Cup design look by render.ts). 360×620 portrait.

   Space Cadet's authentic collider map can't play at phone scale (narrow lanes
   jam the ball, tiny flippers can't catch it), so this is a clean, contained
   layout: a WIDE right launch chute that the ball rides up and curves into play,
   big flippers over a real central drain + outlanes, three pop bumpers, two
   slingshots, TUNNEL/LOCK holes, a spinner, a top GOAL net, rollover lanes and
   a TACTICS bank. A hard outer backstop guarantees containment; only the bottom
   drains. Keep the World-Cup IDEA + look; the geometry just actually works.
   ============================================================ */
import type { Vec } from './vec';
import { v } from './vec';
import {
  type Segment, type Bumper, type Target, type Goal, type Flipper,
  type Hole, type Spinner, type Kickback,
} from './types';

export const TW = 360, TH = 620;
export const SPAWN: Vec = v(333, 582);                 // bottom of the right launch chute
export const CHUTE = { x0: 320, x1: 346, top: 150, bottom: 600 };
export const DRAIN_Y = 598;                            // just below the flipper tips

const D = Math.PI / 180;
const FLIP = {
  L: { pivot: v(118, 560), len: 58, r: 11, rest: 28 * D, up: -26 * D },
  R: { pivot: v(242, 560), len: 58, r: 11, rest: 152 * D, up: 206 * D },
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
  // left wall + stadium-roof top arc, ending where the chute roof begins
  s.push(...chain([
    v(20, 470), v(20, 150), v(30, 108), v(58, 72), v(100, 46),
    v(150, 34), v(210, 34), v(264, 46), v(300, 70), v(314, 100), v(314, 116),
  ], 0.4, 'wall'));
  // ---- right LAUNCH CHUTE: wide lane the ball rides up, with an angled roof
  //      that deflects it left into the playfield at the top ----
  s.push(...chain([v(314, 116), v(346, 150)], 0.5, 'metal'));   // roof (deflector)
  s.push(...chain([v(346, 150), v(346, 600)], 0.4, 'metal'));   // chute outer wall
  s.push(...chain([v(320, 172), v(320, 540)], 0.4, 'metal'));   // chute divider = right playfield wall
  // ---- lower funnels down to the flippers (gaps beside them = outlanes) ----
  s.push(...chain([v(20, 470), v(20, 540), v(72, 596), v(98, 606)], 0.35, 'wall'));
  s.push(...chain([v(320, 540), v(288, 596), v(262, 606)], 0.35, 'wall'));
  // ---- slingshots (kicking faces) + top guards ----
  s.push({ a: v(94, 504), b: v(150, 540), e: 0.7, kind: 'sling', kick: 560, score: 110, light: 'slL' });
  s.push({ a: v(266, 504), b: v(210, 540), e: 0.7, kind: 'sling', kick: 560, score: 110, light: 'slR' });
  s.push(...chain([v(94, 504), v(102, 482)], 0.4, 'wall'));
  s.push(...chain([v(266, 504), v(258, 482)], 0.4, 'wall'));
  return s;
}

export function buildBumpers(): Bumper[] {
  const mk = (id: string, x: number, y: number, color: string): Bumper =>
    ({ id, p: v(x, y), r: 20, e: 0.5, kick: 540, score: 250, color, lit: 0 });
  return [
    mk('b1', 138, 250, '#D80000'),
    mk('b2', 222, 250, '#6000F0'),
    mk('b3', 180, 196, '#00C060'),
  ];
}

export function buildTargets(): Target[] {
  const roll = (id: string, x: number, y: number): Target =>
    ({ id, p: v(x, y), r: 12, score: 150, lit: 0, on: false, kind: 'rollover', group: 'mult' });
  const tgt = (id: string, x: number, y: number): Target =>
    ({ id, p: v(x, y), r: 9, score: 200, lit: 0, on: false, kind: 'target', group: 'tactics' });
  return [
    roll('r1', 120, 96), roll('r2', 180, 86), roll('r3', 240, 96),
    tgt('t1', 46, 344), tgt('t2', 42, 376), tgt('t3', 46, 408),
  ];
}

export function buildGoal(): Goal {
  return { p: v(150, 28), w: 60, h: 30, lit: 0 };
}

export function buildHoles(): Hole[] {
  return [
    { id: 'tunnel', p: v(112, 318), r: 15, kind: 'hyper', lit: 0, locked: 0 },
    { id: 'lock', p: v(248, 318), r: 15, kind: 'lock', lit: 0, locked: 0 },
  ];
}

export function buildSpinner(): Spinner {
  return { id: 'flag', a: v(24, 212), b: v(52, 212), spin: 0, value: 90 };
}

export function buildKickback(): Kickback {
  return { p: v(80, 600), r: 14, armed: true };
}

export function buildFlippers(): Flipper[] {
  return [
    { side: 'L', pivot: FLIP.L.pivot, len: FLIP.L.len, r: FLIP.L.r, rest: FLIP.L.rest, up: FLIP.L.up, angle: FLIP.L.rest, omega: 0, pressed: false },
    { side: 'R', pivot: FLIP.R.pivot, len: FLIP.R.len, r: FLIP.R.r, rest: FLIP.R.rest, up: FLIP.R.up, angle: FLIP.R.rest, omega: 0, pressed: false },
  ];
}

export const flipperTip = (f: Flipper): Vec => v(f.pivot.x + Math.cos(f.angle) * f.len, f.pivot.y + Math.sin(f.angle) * f.len);
