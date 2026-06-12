/* ============================================================
   SOCCER STARS — deterministic physics engine for LIVE multiplayer.

   The single-player game (views/SoccerStars.tsx) keeps its own inline copy of
   this physics ("gameplay LOCKED"); this module is a standalone, side-effect-free
   mirror used ONLY by the networked match so the same constants can never drift
   single-player by accident. Both players run THIS exact module, so a shot
   advanced frame-by-frame from the same start state + impulse produces the same
   trajectory on both screens (the shooter's final board is still written as the
   source of truth to snap away any cross-device float drift).

   The world is frame-based (velocities in units/frame) and settles by a velocity
   threshold, so the result is independent of wall-clock / frame rate — that's
   what makes replay deterministic. Keep these numbers identical to SoccerStars.tsx.
   ============================================================ */
import type { WireBody } from '../utils/soccerMatch';

/* world (logical, LANDSCAPE pitch) — must match views/SoccerStars.tsx */
export const W = 480, H = 300;
export const GOAL_H = 110;
export const GT = (H - GOAL_H) / 2, GB = (H + GOAL_H) / 2;
export const R_P = 18, R_B = 12;
export const MASS_P = 1.55, MASS_B = 0.78;
export const WALL_E = 0.72, HIT_E = 0.95;
export const FRICTION = 0.971;
export const STOP = 0.2;
export const MAX_SPEED = 18.5;
export const MIN_PULL = 9, MAX_PULL = 118;
export const SUBSTEPS = 5;

export type Kind = 'me' | 'cpu' | 'ball';

export interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number; kind: Kind; keeper?: boolean; }

const radiusOf = (k: Kind) => (k === 'ball' ? R_B : R_P);
const massOf = (k: Kind) => (k === 'ball' ? MASS_B : MASS_P);

/** Kickoff formation — side 'me' defends the LEFT goal, 'cpu' the RIGHT. The
 *  ball is always the LAST entry (the step loop relies on that). */
export function formation(): Body[] {
  const mk = (x: number, y: number, kind: Kind, keeper = false): Body =>
    ({ x, y, vx: 0, vy: 0, r: radiusOf(kind), m: massOf(kind), kind, keeper });
  return [
    mk(28, H / 2, 'me', true),
    mk(W * 0.20, H * 0.28, 'me'), mk(W * 0.20, H * 0.72, 'me'),
    mk(W * 0.38, H * 0.40, 'me'), mk(W * 0.38, H * 0.60, 'me'),
    mk(W - 28, H / 2, 'cpu', true),
    mk(W * 0.80, H * 0.28, 'cpu'), mk(W * 0.80, H * 0.72, 'cpu'),
    mk(W * 0.62, H * 0.40, 'cpu'), mk(W * 0.62, H * 0.60, 'cpu'),
    mk(W / 2, H / 2, 'ball'),
  ];
}

/** Elastic disc-on-disc collision with positional de-overlap (verbatim physics). */
export function collide(a: Body, b: Body): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy); if (d === 0) d = 0.01;
  const min = a.r + b.r;
  if (d >= min) return;
  const nx = dx / d, ny = dy / d;
  const overlap = min - d, tot = a.m + b.m;
  a.x -= nx * overlap * (b.m / tot); a.y -= ny * overlap * (b.m / tot);
  b.x += nx * overlap * (a.m / tot); b.y += ny * overlap * (a.m / tot);
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn > 0) return;
  const jimp = -(1 + HIT_E) * vn / (1 / a.m + 1 / b.m);
  a.vx -= jimp * nx / a.m; a.vy -= jimp * ny / a.m;
  b.vx += jimp * nx / b.m; b.vy += jimp * ny / b.m;
}

/**
 * Advance the world ONE animation frame (SUBSTEPS sub-integrations). Mutates
 * `bs` in place. Returns whether a goal was scored this frame and whether the
 * world has come to rest. `scored` is in BOARD orientation: 'me' = into the
 * right goal (the left-defender scores), 'cpu' = into the left goal.
 */
export function stepWorld(bs: Body[]): { scored: Kind | null; settled: boolean } {
  for (let s = 0; s < SUBSTEPS; s++) {
    for (const b of bs) { b.x += b.vx / SUBSTEPS; b.y += b.vy / SUBSTEPS; }
    for (const b of bs) {
      const inMouth = b.y > GT && b.y < GB;
      if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * WALL_E; }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy = -b.vy * WALL_E; }
      if (b.kind === 'ball' && inMouth) continue;
      if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * WALL_E; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -b.vx * WALL_E; }
    }
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) collide(bs[i], bs[j]);
    const ball = bs[bs.length - 1];
    if (ball.y > GT && ball.y < GB) {
      if (ball.x < -ball.r) return { scored: 'cpu', settled: false };   // into left goal
      if (ball.x > W + ball.r) return { scored: 'me', settled: false }; // into right goal
    }
  }
  let maxV = 0;
  for (const b of bs) { b.vx *= FRICTION; b.vy *= FRICTION; maxV = Math.max(maxV, Math.hypot(b.vx, b.vy)); }
  if (maxV < STOP) { for (const b of bs) { b.vx = 0; b.vy = 0; } return { scored: null, settled: true }; }
  return { scored: null, settled: false };
}

/** Convert a pull-back (start → release, in world units) into a launch velocity,
 *  matching the single-player power curve. */
export function pullToVelocity(dx: number, dy: number): { vx: number; vy: number } {
  const pull = Math.min(Math.hypot(dx, dy), MAX_PULL);
  if (pull < MIN_PULL) return { vx: 0, vy: 0 };
  const power = (pull / MAX_PULL) * MAX_SPEED;
  const len = Math.hypot(dx, dy) || 1;
  return { vx: (dx / len) * power, vy: (dy / len) * power };
}

/* ---- wire <-> body (r/m are derived from kind, so they stay off the wire) ---- */
export function toWire(bs: Body[]): WireBody[] {
  return bs.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, kind: b.kind, keeper: b.keeper }));
}
export function fromWire(ws: WireBody[]): Body[] {
  return ws.map(w => ({ x: w.x, y: w.y, vx: w.vx, vy: w.vy, kind: w.kind, keeper: w.keeper, r: radiusOf(w.kind), m: massOf(w.kind) }));
}
