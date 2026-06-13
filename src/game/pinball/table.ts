/* ============================================================
   WORLD CUP PINBALL — table geometry, modelled on the original Space Cadet
   topology and dressed as a World Cup stadium:

     • right LAUNCH CHUTE + plunger feeding the top ORBIT
     • 3-jet pop-bumper cluster (the "midfield")
     • top multiplier ROLLOVER LANES
     • a GOAL net at top-centre
     • a HYPERSPACE kickout hole (centre-left) that starts the lit mission
     • a LOCK hole (centre-right) that locks balls for Trophy-Lift multiball
     • a corner-flag SPINNER on the left orbit
     • a left-outlane KICKBACK saver
     • two SLINGSHOTS + two FLIPPERS over the central drain, with in/out lanes
     • a TACTICS target bank (left) that selects the mission

   Authored in logical units (TW×TH). A hard outer backstop guarantees the ball
   can never leave the table; the only opening is the bottom drain.
   ============================================================ */
import type { Vec } from './vec';
import { v } from './vec';
import {
  TW, TH, type Segment, type Bumper, type Target, type Goal, type Flipper,
  type Hole, type Spinner, type Kickback,
} from './types';

export const SPAWN: Vec = v(338, 588);
export const CHUTE = { x0: 326, x1: 350, top: 170, bottom: 602 };
export const DRAIN_Y = 614;

function chain(pts: Vec[], e: number, kind: Segment['kind'] = 'wall'): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], e, kind });
  return out;
}

export function buildSegments(): Segment[] {
  const segs: Segment[] = [];

  // ---- hard outer backstop (containment guarantee; drawn as the cabinet) ----
  segs.push(
    { a: v(10, 18), b: v(10, 640), e: 0.3, kind: 'wall' },
    { a: v(10, 18), b: v(350, 18), e: 0.3, kind: 'wall' },
    { a: v(350, 18), b: v(350, 640), e: 0.3, kind: 'wall' },
  );

  // ---- playfield left wall + stadium-roof top arc (the top orbit) ----
  segs.push(...chain([
    v(20, 470), v(20, 150), v(28, 112), v(50, 80), v(84, 56),
    v(128, 40), v(180, 35), v(232, 41), v(278, 60), v(306, 86), v(320, 118),
  ], 0.34, 'wall'));

  // ---- launch chute: divider (gap above y=170) + roof that turns the ball left ----
  segs.push(...chain([v(326, 602), v(326, 170)], 0.32, 'metal'));
  segs.push(...chain([v(350, 150), v(346, 132), v(336, 121), v(322, 117), v(320, 118)], 0.4, 'metal'));

  // ---- lower-left funnel / left outlane outer wall (kickback lives at its foot) ----
  segs.push(...chain([v(20, 470), v(20, 540), v(56, 584), v(78, 598)], 0.32, 'wall'));
  // left in/out lane separator
  segs.push(...chain([v(104, 498), v(110, 556)], 0.3, 'wall'));

  // ---- lower-right funnel / right outlane outer wall ----
  segs.push(...chain([v(326, 470), v(326, 540), v(292, 584), v(270, 598)], 0.32, 'wall'));
  // right in/out lane separator
  segs.push(...chain([v(256, 498), v(250, 556)], 0.3, 'wall'));

  // ---- slingshots (kicking faces) ----
  segs.push({ a: v(112, 522), b: v(154, 552), e: 0.6, kind: 'sling', kick: 540, score: 110, light: 'slL' });
  segs.push({ a: v(248, 522), b: v(206, 552), e: 0.6, kind: 'sling', kick: 540, score: 110, light: 'slR' });
  segs.push(...chain([v(112, 522), v(120, 500)], 0.4, 'wall'));
  segs.push(...chain([v(248, 522), v(240, 500)], 0.4, 'wall'));

  return segs;
}

export function buildBumpers(): Bumper[] {
  const mk = (id: string, x: number, y: number, color: string): Bumper =>
    ({ id, p: v(x, y), r: 18, e: 0.5, kick: 560, score: 250, color, lit: 0 });
  return [
    mk('b1', 146, 214, '#E1342B'),   // red
    mk('b2', 216, 214, '#1769FF'),   // blue
    mk('b3', 181, 166, '#FFC400'),   // gold
  ];
}

export function buildTargets(): Target[] {
  const roll = (id: string, x: number, y: number): Target =>
    ({ id, p: v(x, y), r: 11, score: 150, lit: 0, on: false, kind: 'rollover', group: 'mult' });
  const tgt = (id: string, x: number, y: number): Target =>
    ({ id, p: v(x, y), r: 9, score: 200, lit: 0, on: false, kind: 'target', group: 'tactics' });
  return [
    // top multiplier rollover lanes
    roll('r1', 120, 92), roll('r2', 181, 82), roll('r3', 242, 92),
    // left TACTICS target bank (cycles the selected mission)
    tgt('t1', 40, 330), tgt('t2', 36, 362), tgt('t3', 40, 394),
  ];
}

export function buildGoal(): Goal {
  return { p: v(150, 40), w: 60, h: 28, lit: 0 };
}

export function buildHoles(): Hole[] {
  return [
    { id: 'hyper', p: v(108, 250), r: 13, kind: 'hyper', lit: 0, locked: 0 },
    { id: 'lock', p: v(252, 250), r: 13, kind: 'lock', lit: 0, locked: 0 },
  ];
}

export function buildSpinner(): Spinner {
  return { id: 'flag', a: v(20, 196), b: v(48, 196), spin: 0, value: 90 };
}

export function buildKickback(): Kickback {
  return { p: v(80, 592), r: 14, armed: true };
}

export function buildFlippers(): Flipper[] {
  const D = Math.PI / 180;
  return [
    { side: 'L', pivot: v(120, 566), len: 54, r: 9, rest: 27 * D, up: -22 * D, angle: 27 * D, omega: 0, pressed: false },
    { side: 'R', pivot: v(240, 566), len: 54, r: 9, rest: (180 - 27) * D, up: (180 + 22) * D, angle: (180 - 27) * D, omega: 0, pressed: false },
  ];
}

export const flipperTip = (f: Flipper): Vec => v(f.pivot.x + Math.cos(f.angle) * f.len, f.pivot.y + Math.sin(f.angle) * f.len);

export { TW, TH };
