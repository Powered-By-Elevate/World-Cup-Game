/* ============================================================
   WORLD CUP PINBALL — physics. Custom 2D engine tuned for arcade feel:
   heavy-but-fast ball, punchy slingshots/bumpers, powerful flippers.
   Substepped integration keeps collisions stable (no tunnelling), and a
   hard outer backstop (see table.ts) guarantees the ball stays on the table.
   ============================================================ */
import { closestOnSeg, reflect } from './vec';
import type { Ball, Segment, Bumper, Flipper } from './types';

export const GRAVITY = 980;         // units/s² (down) — tuned for the ~430-tall table
export const MAX_SPEED = 1300;
const SUBSTEPS = 6;
const SEG_R = 2.2;                  // visual line thickness as a collider
const FLIP_AV = 22;                 // flipper angular speed (rad/s)
const FLIP_E = 0.42;

export type HitFn = (type: 'wall' | 'sling' | 'bumper' | 'flip', data: { x: number; y: number; id?: string; score?: number; light?: string }) => void;

/** Advance flipper angles toward their target; set omega for this frame. */
export function updateFlippers(flips: Flipper[], dt: number): void {
  for (const f of flips) {
    const target = f.pressed ? f.up : f.rest;
    const prev = f.angle;
    const max = FLIP_AV * dt;
    const d = target - f.angle;
    f.angle += Math.abs(d) <= max ? d : Math.sign(d) * max;
    f.omega = (f.angle - prev) / (dt || 1 / 60);
  }
}

const clampSpeed = (b: Ball) => {
  const s = Math.hypot(b.v.x, b.v.y);
  if (s > MAX_SPEED) { b.v.x = (b.v.x / s) * MAX_SPEED; b.v.y = (b.v.y / s) * MAX_SPEED; }
};

/** One full frame for a single ball (substepped). Fires `hit` for scoring/sfx. */
export function stepBall(b: Ball, dt: number, segs: Segment[], bumpers: Bumper[], flips: Flipper[], hit: HitFn): void {
  const sdt = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    b.v.y += GRAVITY * sdt;
    b.p.x += b.v.x * sdt;
    b.p.y += b.v.y * sdt;

    // ---- segments (walls / slingshots) ----
    for (const seg of segs) {
      const cp = closestOnSeg(b.p, seg.a, seg.b);
      const dx = b.p.x - cp.x, dy = b.p.y - cp.y;
      const d = Math.hypot(dx, dy);
      const min = b.r + SEG_R;
      if (d >= min || d === 0) continue;
      const n = { x: dx / d, y: dy / d };
      b.p.x = cp.x + n.x * min; b.p.y = cp.y + n.y * min;
      b.v = reflect(b.v, n, seg.e);
      if (seg.kind === 'sling' && seg.kick) {
        b.v.x += n.x * seg.kick; b.v.y += n.y * seg.kick;
        hit('sling', { x: cp.x, y: cp.y, score: seg.score, light: seg.light });
      }
    }

    // ---- pop bumpers ----
    for (const bm of bumpers) {
      const dx = b.p.x - bm.p.x, dy = b.p.y - bm.p.y;
      const d = Math.hypot(dx, dy);
      const min = b.r + bm.r;
      if (d >= min || d === 0) continue;
      const n = { x: dx / d, y: dy / d };
      b.p.x = bm.p.x + n.x * min; b.p.y = bm.p.y + n.y * min;
      b.v = reflect(b.v, n, bm.e);
      b.v.x += n.x * bm.kick; b.v.y += n.y * bm.kick;
      hit('bumper', { x: bm.p.x, y: bm.p.y, id: bm.id, score: bm.score });
    }

    // ---- flippers (moving capsules) ----
    for (const f of flips) {
      const tip = { x: f.pivot.x + Math.cos(f.angle) * f.len, y: f.pivot.y + Math.sin(f.angle) * f.len };
      const cp = closestOnSeg(b.p, f.pivot, tip);
      const dx = b.p.x - cp.x, dy = b.p.y - cp.y;
      const d = Math.hypot(dx, dy);
      const min = b.r + f.r;
      if (d >= min || d === 0) continue;
      const n = { x: dx / d, y: dy / d };
      // surface velocity at the contact point (omega × radius)
      const rx = cp.x - f.pivot.x, ry = cp.y - f.pivot.y;
      const u = { x: -f.omega * ry, y: f.omega * rx };
      b.p.x = cp.x + n.x * min; b.p.y = cp.y + n.y * min;
      const relv = { x: b.v.x - u.x, y: b.v.y - u.y };
      const vn = relv.x * n.x + relv.y * n.y;
      if (vn < 0) {
        const nr = reflect(relv, n, FLIP_E);
        b.v.x = nr.x + u.x; b.v.y = nr.y + u.y;
        // guarantee a lively pop when the flipper is actively swinging up
        if (f.pressed && Math.abs(f.omega) > 4) { b.v.x += n.x * 120; b.v.y += n.y * 120; }
        hit('flip', { x: cp.x, y: cp.y, id: f.side });
      } else {
        // resting contact — keep the ball on the surface without sticking
        b.v.x += u.x * 0.2; b.v.y += u.y * 0.2;
      }
    }

    clampSpeed(b);
  }
}
