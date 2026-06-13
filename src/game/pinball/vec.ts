/* Tiny 2D vector helpers for the pinball engine (plain {x,y} objects, no class
   allocation churn in the hot loop — most ops return new objects but the step
   loop reuses primitives where it matters). */
export interface Vec { x: number; y: number; }

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec): Vec {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
}

/** Closest point on segment a→b to point p. */
export function closestOnSeg(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x, aby = b.y - a.y;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1);
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + abx * tc, y: a.y + aby * tc };
}

/** Reflect velocity vel about a surface with unit normal n, restitution e. */
export function reflect(vel: Vec, n: Vec, e: number): Vec {
  const vn = vel.x * n.x + vel.y * n.y;
  return { x: vel.x - (1 + e) * vn * n.x, y: vel.y - (1 + e) * vn * n.y };
}
