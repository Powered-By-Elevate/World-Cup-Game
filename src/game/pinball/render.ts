/* ============================================================
   WORLD CUP PINBALL — canvas rendering. Draws the soccer-stadium table in
   logical units; the caller sets the transform that scales TW×TH to the
   device canvas. Soccer-ball bumpers, a netted goal mouth, boot-coloured
   flippers, flashing inserts, a sweeping stadium light, score popups and
   confetti — the Space-Cadet energy, World-Cup dressed.
   ============================================================ */
import type { Vec } from './vec';
import {
  TW, TH, type Segment, type Bumper, type Target, type Goal, type Flipper, type Ball,
  type Popup, type Confetti, type Spark, type Hole, type Spinner, type Kickback,
} from './types';
import { flipperTip, CHUTE } from './table';

const GOLD = '#FFC400', RED = '#E1342B', LIME = '#C8F23C';

export type Aim = 'goal' | 'bumpers' | 'lanes' | 'spinner' | null;

export interface Scene {
  segs: Segment[]; bumpers: Bumper[]; targets: Target[]; goal: Goal;
  holes: Hole[]; spinner: Spinner; kickback: Kickback;
  flips: Flipper[]; balls: Ball[]; popups: Popup[]; confetti: Confetti[]; sparks: Spark[];
  charge: number; aim: Aim; t: number; flashGoal: number;
}

export function drawTable(ctx: CanvasRenderingContext2D, sc: Scene): void {
  const t = sc.t;
  // ---- turf ----
  const g = ctx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, '#1f7a36'); g.addColorStop(0.5, '#176a2c'); g.addColorStop(1, '#125724');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < TW; i += 48) ctx.fillRect(i, 0, 24, TH);

  // chalk markings (center circle + penalty arc near goal)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(TW / 2, TH * 0.52, 60, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(TW / 2, TH * 0.52, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
  ctx.beginPath(); ctx.arc(TW / 2, 60, 70, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

  // ---- sweeping stadium light ----
  const sweep = (Math.sin(t / 1100) * 0.5 + 0.5) * TW;
  const lg = ctx.createRadialGradient(sweep, 120, 10, sweep, 120, 260);
  lg.addColorStop(0, 'rgba(255,255,255,0.10)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, TW, TH * 0.7);

  // ---- spinner (corner flag on the left orbit) ----
  drawSpinner(ctx, sc.spinner, sc.aim === 'spinner', t);

  // ---- kickback saver (left outlane) ----
  if (sc.kickback.armed) {
    const k = sc.kickback;
    ctx.fillStyle = hexA(LIME, 0.35 + (Math.sin(t / 160) * 0.5 + 0.5) * 0.4);
    ctx.beginPath(); ctx.arc(k.p.x, k.p.y, k.r * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a2a14'; ctx.font = '800 7px Archivo, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SAVE', k.p.x, k.p.y + 2.5);
  }

  // ---- goal mouth (net + posts), flashing when lit / aimed ----
  drawGoal(ctx, sc.goal, sc.aim === 'goal', t, sc.flashGoal);

  // ---- kickout holes (hyperspace + multiball lock) ----
  for (const h of sc.holes) drawHole(ctx, h, t);

  // ---- slingshot pads (under the kicking segments) ----
  drawSling(ctx, 112, 522, 154, 552, t);
  drawSling(ctx, 248, 522, 206, 552, t);

  // ---- walls ----
  for (const s of sc.segs) {
    if (s.kind === 'sling') continue;        // drawn as pads above
    ctx.strokeStyle = s.kind === 'metal' ? 'rgba(220,225,235,0.85)' : 'rgba(240,245,235,0.5)';
    ctx.lineWidth = s.kind === 'metal' ? 3 : 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
  }

  // ---- rollover lanes + target bank ----
  for (const tg of sc.targets) {
    const lit = tg.lit > 0 || tg.on;
    if (tg.kind === 'rollover') {
      ctx.beginPath(); ctx.arc(tg.p.x, tg.p.y, tg.r, 0, Math.PI * 2);
      ctx.fillStyle = lit ? LIME : 'rgba(255,255,255,0.14)';
      ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.save(); ctx.translate(tg.p.x, tg.p.y);
      ctx.fillStyle = lit ? GOLD : 'rgba(255,255,255,0.18)';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
      roundRect(ctx, -tg.r, -tg.r * 0.7, tg.r * 2, tg.r * 1.4, 3); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ---- bumpers as soccer balls with a coloured energy ring ----
  for (const b of sc.bumpers) {
    const flash = Math.max(b.lit, sc.aim === 'bumpers' ? (Math.sin(t / 140) * 0.5 + 0.5) * 0.5 : 0);
    ctx.beginPath(); ctx.arc(b.p.x, b.p.y, b.r + 5 + flash * 4, 0, Math.PI * 2);
    const ring = ctx.createRadialGradient(b.p.x, b.p.y, b.r, b.p.x, b.p.y, b.r + 9);
    ring.addColorStop(0, hexA(b.color, 0.2 + flash * 0.7)); ring.addColorStop(1, hexA(b.color, 0));
    ctx.fillStyle = ring; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = hexA(b.color, 0.6 + flash * 0.4);
    ctx.beginPath(); ctx.arc(b.p.x, b.p.y, b.r + 2.5, 0, Math.PI * 2); ctx.stroke();
    drawSoccerBall(ctx, b.p.x, b.p.y, b.r);
  }

  // ---- flippers (boot-coloured capsules) ----
  for (const f of sc.flips) drawFlipper(ctx, f);

  // ---- plunger (charge bar in the chute) ----
  drawPlunger(ctx, sc.charge);

  // ---- balls ----
  for (const b of sc.balls) {
    ctx.beginPath(); ctx.ellipse(b.p.x, b.p.y + b.r * 0.8, b.r * 0.9, b.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    drawSoccerBall(ctx, b.p.x, b.p.y, b.r);
  }

  // ---- sparks ----
  for (const s of sc.sparks) {
    ctx.globalAlpha = Math.max(0, s.life / s.ttl);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.p.x, s.p.y, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---- confetti ----
  for (const c of sc.confetti) {
    ctx.save(); ctx.translate(c.p.x, c.p.y); ctx.rotate(c.rot);
    ctx.fillStyle = c.color; ctx.globalAlpha = Math.min(1, c.life);
    ctx.fillRect(-3, -5, 6, 10); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ---- score popups ----
  for (const p of sc.popups) {
    ctx.globalAlpha = Math.min(1, p.life / 0.5);
    ctx.fillStyle = p.color;
    ctx.font = '800 16px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.p.x, p.p.y);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- pieces ---------------- */

function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal, aimed: boolean, t: number, flash: number) {
  const x = goal.p.x, y = goal.p.y, w = goal.w, h = goal.h;
  const blink = (Math.sin(t / 120) * 0.5 + 0.5);
  // glow
  if (aimed || flash > 0) {
    const a = Math.max(flash, aimed ? blink * 0.6 : 0);
    const gl = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w);
    gl.addColorStop(0, hexA(GOLD, 0.5 * a + 0.2)); gl.addColorStop(1, hexA(GOLD, 0));
    ctx.fillStyle = gl; ctx.fillRect(x - w / 2, y - h, w * 2, h * 3);
  }
  // net
  ctx.save(); ctx.beginPath(); roundRect(ctx, x, y, w, h, 4); ctx.clip();
  ctx.fillStyle = 'rgba(10,30,16,0.5)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
  for (let i = x; i <= x + w; i += 7) { ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i, y + h); ctx.stroke(); }
  for (let j = y; j <= y + h; j += 7) { ctx.beginPath(); ctx.moveTo(x, j); ctx.lineTo(x + w, j); ctx.stroke(); }
  ctx.restore();
  // posts + crossbar
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h);
  ctx.stroke();
  // "GOAL" inserts
  ctx.fillStyle = aimed ? GOLD : 'rgba(255,255,255,0.7)';
  ctx.font = '800 9px Archivo, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('⚽ GOAL', x + w / 2, y - 5);
}

function drawHole(ctx: CanvasRenderingContext2D, h: Hole, t: number) {
  const lock = h.kind === 'lock';
  const col = lock ? GOLD : '#39E0FF';
  const blink = (Math.sin(t / 130) * 0.5 + 0.5);
  // glow ring
  const gl = ctx.createRadialGradient(h.p.x, h.p.y, 2, h.p.x, h.p.y, h.r + 8);
  gl.addColorStop(0, hexA(col, 0.5 + h.lit * 0.4)); gl.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(h.p.x, h.p.y, h.r + 8, 0, Math.PI * 2); ctx.fill();
  // mouth
  ctx.beginPath(); ctx.arc(h.p.x, h.p.y, h.r, 0, Math.PI * 2);
  ctx.fillStyle = '#06120a'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = hexA(col, 0.7 + blink * 0.3); ctx.stroke();
  // label / lock pips
  ctx.fillStyle = hexA(col, 0.9); ctx.font = '800 7px Archivo, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(lock ? 'LOCK' : 'TUNNEL', h.p.x, h.p.y - h.r - 4);
  if (lock && h.locked > 0) {
    for (let i = 0; i < h.locked; i++) { ctx.beginPath(); ctx.arc(h.p.x - 6 + i * 6, h.p.y + h.r + 8, 2.5, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill(); }
  }
}

function drawSpinner(ctx: CanvasRenderingContext2D, sp: Spinner, aimed: boolean, t: number) {
  const mx = (sp.a.x + sp.b.x) / 2, my = (sp.a.y + sp.b.y) / 2;
  const w = Math.cos(sp.spin * 6) * 12;     // flag flips as it spins
  ctx.strokeStyle = aimed ? GOLD : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(mx, my - 12); ctx.lineTo(mx, my + 12); ctx.stroke();
  ctx.fillStyle = aimed ? RED : '#1769FF';
  ctx.beginPath(); ctx.moveTo(mx, my - 12); ctx.lineTo(mx + w, my - 8); ctx.lineTo(mx, my - 4); ctx.closePath(); ctx.fill();
  void t;
}

function drawSling(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, t: number) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const blink = (Math.sin(t / 200) * 0.5 + 0.5) * 0.3 + 0.4;
  ctx.strokeStyle = hexA(LIME, blink); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = hexA(LIME, 0.18);
  ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill();
}

function drawFlipper(ctx: CanvasRenderingContext2D, f: Flipper) {
  const tip = flipperTip(f);
  const col = f.side === 'L' ? RED : '#1769FF';
  ctx.strokeStyle = col; ctx.lineWidth = f.r * 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(f.pivot.x, f.pivot.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(f.pivot.x, f.pivot.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  ctx.fillStyle = '#0c0c0c'; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, f.r * 0.7, 0, Math.PI * 2); ctx.fill();
}

function drawPlunger(ctx: CanvasRenderingContext2D, charge: number) {
  const cx = (CHUTE.x0 + CHUTE.x1) / 2;
  const baseY = CHUTE.bottom - 2;
  // spring track
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, baseY - 46); ctx.stroke();
  // charge fill
  ctx.fillStyle = charge > 0.78 ? RED : charge > 0.45 ? GOLD : LIME;
  ctx.fillRect(cx - 6, baseY - charge * 44, 12, charge * 44);
}

function drawSoccerBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#f0f0ec'); g.addColorStop(1, '#c8cac5');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 0.7; ctx.strokeStyle = '#9a9c98'; ctx.stroke();
  const pr = r * 0.4;
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([cx + Math.cos(a) * pr, cy + Math.sin(a) * pr]); }
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = '#1d1f22'; ctx.fill();
  ctx.strokeStyle = '#2b2d30'; ctx.lineWidth = 0.9;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); ctx.stroke();
  }
}

/* ---------------- helpers ---------------- */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** "#rrggbb" + alpha → rgba() string. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const TABLE_W = TW, TABLE_H = TH;
export type { Vec };
