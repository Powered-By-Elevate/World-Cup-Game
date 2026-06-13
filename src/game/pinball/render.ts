/* ============================================================
   WORLD CUP PINBALL — renderer. Draws the playable table (geometry from the
   engine Scene) in the Claude Design "World Cup 2026" style: night-stadium
   surround, turf + chalk, chrome-wire rails, domed soccer-ball pop bumpers,
   cyan TUNNEL / gold LOCK saucers, a gold goal net, boot flippers and a glossy
   clear-coat. Static art is baked once into an offscreen canvas; live state
   (bumpers, holes, flippers, balls, goal flash, particles) draws each frame.
   ============================================================ */
import { TW, TH } from './types';
import type { Segment, Bumper, Target, Goal, Flipper, Ball, Popup, Confetti, Spark, Hole, Spinner, Kickback } from './types';

type Ctx = CanvasRenderingContext2D;
const C = { gold: '#FFC400', red: '#D80000', purple: '#6000F0', blue: '#1769FF', lime: '#A8F000', emerald: '#00C060', maroon: '#781818', cyan: '#39E0FF', ink: '#05080f' };
const RES = 2;
const LX = 0.8, LY = 1.3;
const TAU = Math.PI * 2;
const CENTER = { x: 180, y: 312 };

export type Aim = 'goal' | 'bumpers' | 'lanes' | 'spinner' | null;

export interface Scene {
  segs: Segment[]; bumpers: Bumper[]; targets: Target[]; goal: Goal;
  holes: Hole[]; spinner: Spinner; kickback: Kickback;
  flips: Flipper[]; balls: Ball[]; popups: Popup[]; confetti: Confetti[]; sparks: Spark[];
  charge: number; aim: Aim; t: number; flashGoal: number;
}

/* ---------------- primitives ---------------- */
function pent(ctx: Ctx, cx: number, cy: number, R: number, deg: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = (deg + i * 72) * Math.PI / 180, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath();
}
function soccer(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  const g = ctx.createRadialGradient(x - r * .34, y - r * .32, r * .1, x, y, r);
  g.addColorStop(0, '#fff'); g.addColorStop(.55, '#e7ecf3'); g.addColorStop(1, '#7d8696');
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.strokeStyle = '#9099a8'; ctx.lineWidth = r * .05;
  for (let k = 0; k < 5; k++) { const a = (-54 + k * 72) * Math.PI / 180; ctx.beginPath(); ctx.moveTo(x + Math.cos((-90 + k * 72) * Math.PI / 180) * r * .26, y + Math.sin((-90 + k * 72) * Math.PI / 180) * r * .26); ctx.lineTo(x + Math.cos(a) * r * .9, y + Math.sin(a) * r * .9); ctx.stroke(); }
  ctx.fillStyle = '#14181f'; pent(ctx, x, y, r * .3, -90); ctx.fill();
  for (let k = 0; k < 5; k++) { const a = (-54 + k * 72) * Math.PI / 180; pent(ctx, x + Math.cos(a) * r * .72, y + Math.sin(a) * r * .72, r * .24, (-54 + k * 72) + 180); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(x - r * .35, y - r * .38, r * .28, r * .19, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.fill();
  ctx.restore();
}
function glowDot(ctx: Ctx, x: number, y: number, r: number, col: string, a?: number) { ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.shadowColor = col; ctx.shadowBlur = r * 1.8; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
function shadowEllipse(ctx: Ctx, x: number, y: number, rx: number) { ctx.save(); ctx.fillStyle = 'rgba(2,5,11,.5)'; ctx.beginPath(); ctx.ellipse(x + rx * .22, y + rx * .72, rx * 1.05, rx * 0.4, 0, 0, TAU); ctx.fill(); ctx.restore(); }
function mixWhite(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; r = Math.round(r + (255 - r) * a); g = Math.round(g + (255 - g) * a); b = Math.round(b + (255 - b) * a); return `rgb(${r},${g},${b})`; }
function chromeWire(ctx: Ctx, p: Path2D, w: number) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(2,5,11,.5)'; ctx.shadowBlur = 2.2; ctx.shadowOffsetX = LX * 1.7; ctx.shadowOffsetY = LY * 1.7;
  ctx.strokeStyle = '#1b2230'; ctx.lineWidth = w; ctx.stroke(p); ctx.restore();
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.translate(-LX * w * 0.24, -LY * w * 0.24); ctx.strokeStyle = '#7c879c'; ctx.lineWidth = w * 0.7; ctx.stroke(p);
  ctx.translate(-LX * w * 0.16, -LY * w * 0.16); ctx.strokeStyle = '#c8d1e1'; ctx.lineWidth = w * 0.32; ctx.stroke(p);
  ctx.translate(-LX * w * 0.12, -LY * w * 0.12); ctx.strokeStyle = 'rgba(248,251,255,.9)'; ctx.lineWidth = w * 0.13; ctx.stroke(p);
  ctx.restore();
}
const clipPlay = (ctx: Ctx) => { ctx.beginPath(); ctx.rect(16, 14, TW - 32, TH - 14); ctx.clip(); };

/* ---------------- static ---------------- */
function drawStadium(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, TH); g.addColorStop(0, '#0a0f18'); g.addColorStop(1, '#05080f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
  // crowd speckle in the top margin + side rails
  ctx.save(); ctx.globalAlpha = .5;
  for (let i = 0; i < 260; i++) { const x = 4 + ((i * 47) % 352), y = 2 + ((i * 23) % 30); if (x > 22 && x < 338 && y > 12) continue; ctx.fillStyle = ['#26324a', '#34405c', '#1c2742'][i % 3]; ctx.fillRect(x, y, 1.5, 1.5); }
  ctx.restore();
  // bunting across the top
  const cols = [C.red, C.purple, C.lime, C.emerald, C.gold];
  for (const [x0, x1, pal] of [[40, 175, cols], [185, 320, [C.emerald, C.gold, C.purple, C.red, C.lime]]] as [number, number, string[]][]) {
    const n = Math.round((x1 - x0) / 11);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = .6; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const f = i / n, tx = x0 + (x1 - x0) * f, ty = 12 + Math.sin(Math.PI * f) * 8; if (i) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); } ctx.stroke();
    for (let i = 0; i < n; i++) { const f = (i + .5) / n, tx = x0 + (x1 - x0) * f, ty = 12 + Math.sin(Math.PI * f) * 8; ctx.fillStyle = pal[i % pal.length]; ctx.beginPath(); ctx.moveTo(tx - 2.4, ty); ctx.lineTo(tx + 2.4, ty); ctx.lineTo(tx, ty + 5.5); ctx.closePath(); ctx.fill(); }
  }
}
function drawTurf(ctx: Ctx) {
  ctx.save(); clipPlay(ctx);
  const g = ctx.createLinearGradient(0, 20, 0, TH); g.addColorStop(0, '#23854a'); g.addColorStop(.5, '#1a7a3c'); g.addColorStop(1, '#0e4a1f');
  ctx.fillStyle = g; ctx.fillRect(16, 14, TW - 32, TH);
  ctx.globalAlpha = .05; ctx.fillStyle = '#fff';
  for (let y = 30; y < TH; y += 60) ctx.fillRect(16, y, TW - 32, 30);
  ctx.globalAlpha = 1;
  // chalk: centre circle, halfway line, penalty arcs at both ends
  ctx.strokeStyle = 'rgba(234,246,255,.3)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(24, CENTER.y); ctx.lineTo(336, CENTER.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, 44, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(234,246,255,.16)'; pent(ctx, CENTER.x, CENTER.y, 6, -90); ctx.fill();
  ctx.strokeRect(135, 14, 90, 56);                  // top penalty box (the GOAL end)
  ctx.beginPath(); ctx.arc(CENTER.x, 70, 26, 0.15, Math.PI - 0.15); ctx.stroke();
  // faded WORLD CUP wordmark in the lower open turf
  ctx.save(); ctx.textAlign = 'center'; ctx.globalAlpha = .08; ctx.fillStyle = '#eaf2ff'; ctx.font = '700 24px Anton'; ctx.fillText('WORLD CUP', CENTER.x, 446);
  ctx.globalAlpha = .13; ctx.fillStyle = C.gold; ctx.font = '700 40px Anton'; ctx.fillText('2026', CENTER.x, 486); ctx.restore();
  // vignette
  const vg = ctx.createRadialGradient(CENTER.x, CENTER.y, 60, CENTER.x, CENTER.y, 360);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,18,8,.55)');
  ctx.fillStyle = vg; ctx.fillRect(16, 14, TW - 32, TH);
  ctx.restore();
}
function drawGoalNet(ctx: Ctx, g: Goal) {
  const x0 = g.p.x, x1 = g.p.x + g.w, yt = g.p.y, yb = g.p.y + g.h;
  ctx.save();
  ctx.fillStyle = '#04101c'; ctx.fillRect(x0, yt, g.w, g.h);
  ctx.strokeStyle = 'rgba(207,224,255,.45)'; ctx.lineWidth = .6;
  for (let i = -7; i < 16; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * 5, yt); ctx.lineTo(x0 + i * 5 + g.h, yb); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x0 + i * 5, yt); ctx.lineTo(x0 + i * 5 - g.h, yb); ctx.stroke(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0, yt); ctx.lineTo(x1, yt); ctx.lineTo(x1, yb); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 6; ctx.fillRect(x0 - 3, yt, 3, g.h); ctx.fillRect(x1, yt, 3, g.h);
  ctx.shadowBlur = 0; ctx.font = '700 9px Anton'; ctx.textAlign = 'center'; ctx.fillText('⚽ GOAL', CENTER.x, yt - 4);
  ctx.restore();
}
function drawHoleBase(ctx: Ctx, h: Hole) {
  const cyan = h.kind === 'hyper', col = cyan ? C.cyan : C.gold;
  glowDot(ctx, h.p.x, h.p.y, h.r, col, .85);
  ctx.save(); ctx.fillStyle = '#03070e'; ctx.beginPath(); ctx.arc(h.p.x, h.p.y, h.r - 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(h.p.x, h.p.y - 0.5, h.r - 3, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  ctx.font = '700 8px Anton'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 4;
  ctx.fillText(cyan ? 'TUNNEL' : 'LOCK', h.p.x, h.p.y + h.r + 9); ctx.restore();
}
function drawTargetBase(ctx: Ctx, t: Target) {
  ctx.save();
  if (t.kind === 'rollover') {
    glowDot(ctx, t.p.x, t.p.y, t.r * 0.7, C.lime, .35);
    ctx.strokeStyle = 'rgba(168,240,0,.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(t.p.x, t.p.y, t.r, 0, TAU); ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(2,5,11,.45)'; ctx.beginPath(); ctx.ellipse(t.p.x + 1.4, t.p.y + 3.4, t.r * .9, t.r * .4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1205'; ctx.fillRect(t.p.x - t.r, t.p.y - .4, t.r * 2, 3.4);
    ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 5; ctx.fillRect(t.p.x - t.r + .6, t.p.y - t.r - .6, t.r * 2 - 1.2, t.r + .8); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(t.p.x - t.r + .6, t.p.y - t.r - .6, t.r * 2 - 1.2, 1.2);
  }
  ctx.restore();
}
function drawSlingPad(ctx: Ctx, s: Segment) {
  const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(168,240,0,.85)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.shadowColor = C.lime; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(168,240,0,.18)'; ctx.beginPath(); ctx.arc(mx, my, 11, 0, TAU); ctx.fill();
  ctx.restore();
}

let staticCv: HTMLCanvasElement | null = null;
function getStatic(sc: Scene): HTMLCanvasElement {
  if (staticCv) return staticCv;
  const cv = document.createElement('canvas'); cv.width = TW * RES; cv.height = TH * RES;
  const ctx = cv.getContext('2d')!; ctx.scale(RES, RES);
  drawStadium(ctx); drawTurf(ctx); drawGoalNet(ctx, sc.goal);
  // walls as chrome rails
  const wp = new Path2D();
  for (const s of sc.segs) { if (s.kind === 'sling') continue; wp.moveTo(s.a.x, s.a.y); wp.lineTo(s.b.x, s.b.y); }
  ctx.save(); clipPlay(ctx); chromeWire(ctx, wp, 3.2); ctx.restore();
  // bases
  for (const s of sc.segs) if (s.kind === 'sling') drawSlingPad(ctx, s);
  for (const h of sc.holes) drawHoleBase(ctx, h);
  for (const t of sc.targets) drawTargetBase(ctx, t);
  // spinner post
  const spx = (sc.spinner.a.x + sc.spinner.b.x) / 2, spy = (sc.spinner.a.y + sc.spinner.b.y) / 2;
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(spx, spy - 12); ctx.lineTo(spx, spy + 12); ctx.stroke();
  staticCv = cv;
  return cv;
}

/* ---------------- live ---------------- */
function drawBumper(ctx: Ctx, x: number, y: number, r: number, col: string, h: number) {
  const capY = y - r * 0.45 - h * (r * 0.34);
  ctx.save(); ctx.fillStyle = 'rgba(2,5,11,.5)'; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.78, r * 1.2, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 + h * 18; ctx.fillStyle = h > 0.02 ? mixWhite(col, Math.min(0.85, h * 0.9)) : col;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.4, r * 1.16, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#070b12'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.32, r * 0.86, r * 0.36, 0, 0, TAU); ctx.fill();
  const sg = ctx.createLinearGradient(x - r, 0, x + r, 0); sg.addColorStop(0, '#070b12'); sg.addColorStop(.46, '#27313f'); sg.addColorStop(.6, '#2f3a4a'); sg.addColorStop(1, '#070b12');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x - r * 0.8, capY + r * 0.24); ctx.lineTo(x + r * 0.8, capY + r * 0.24); ctx.lineTo(x + r * 0.9, y + r * 0.32); ctx.lineTo(x - r * 0.9, y + r * 0.32); ctx.closePath(); ctx.fill();
  const cr = r * (0.92 + h * 0.12);
  soccer(ctx, x, capY, cr);
  ctx.save(); ctx.strokeStyle = h > 0.3 ? '#fff' : col; ctx.shadowColor = col; ctx.shadowBlur = 10 + h * 14; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(x, capY + cr * 0.5, cr * 1.02, cr * 0.42, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); ctx.restore();
  if (h > 0.02) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const rr = cr + (1 - h) * 16; ctx.globalAlpha = h * 0.8; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, capY, rr, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
function drawFlipperLive(ctx: Ctx, f: Flipper) {
  const col = f.side === 'L' ? C.red : C.purple, hi = f.side === 'L' ? '#ff8a82' : '#b78aff';
  const tx = f.pivot.x + Math.cos(f.angle) * f.len, ty = f.pivot.y + Math.sin(f.angle) * f.len;
  ctx.save(); ctx.fillStyle = 'rgba(2,5,11,.45)'; ctx.beginPath(); ctx.ellipse((f.pivot.x + tx) / 2, (f.pivot.y + ty) / 2 + 3, f.len / 2, f.r, f.angle, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = f.r * 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.pivot.x, f.pivot.y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = hi; ctx.lineWidth = f.r * .7; ctx.beginPath(); ctx.moveTo(f.pivot.x + Math.cos(f.angle) * 4, f.pivot.y + Math.sin(f.angle) * 4 - 2); ctx.lineTo(tx - Math.cos(f.angle) * 4, ty - Math.sin(f.angle) * 4 - 2); ctx.stroke();
  ctx.fillStyle = '#161b26'; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, f.r * .85, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a4150'; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, f.r * .4, 0, TAU); ctx.fill(); ctx.restore();
}
function drawBall(ctx: Ctx, x: number, y: number, r: number) {
  shadowEllipse(ctx, x, y, r);
  soccer(ctx, x, y, r);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .5;
  const g = ctx.createRadialGradient(x - r * .42, y - r * .46, .4, x, y, r); g.addColorStop(0, '#fff'); g.addColorStop(.4, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
}

export function drawTable(ctx: Ctx, sc: Scene): void {
  const t = sc.t / 1000;
  ctx.drawImage(getStatic(sc), 0, 0, TW, TH);
  ctx.save(); clipPlay(ctx);

  // breathing insert glows over the holes + kickback
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const h of sc.holes) { const col = h.kind === 'hyper' ? C.cyan : C.gold; glowDot(ctx, h.p.x, h.p.y, h.r + pulse * 3, col, .22 + pulse * .3 + h.lit * .4); }
  if (sc.kickback.armed) glowDot(ctx, sc.kickback.p.x, sc.kickback.p.y, 6 + pulse * 2, C.lime, .25 + pulse * .3);
  ctx.restore();

  // lit rollover lanes
  for (const tg of sc.targets) { if (tg.kind === 'rollover' && (tg.on || tg.lit > 0)) glowDot(ctx, tg.p.x, tg.p.y, tg.r, C.lime, .6); }

  // pop bumpers (hit envelope from engine lit)
  for (const b of sc.bumpers) drawBumper(ctx, b.p.x, b.p.y, b.r, b.color, Math.min(1, b.lit / 0.28));

  // spinning corner flag
  const spx = (sc.spinner.a.x + sc.spinner.b.x) / 2, spy = (sc.spinner.a.y + sc.spinner.b.y) / 2;
  ctx.save(); ctx.translate(spx, spy - 7); const s = Math.abs(Math.cos(t * (sc.spinner.spin > 0 ? 8 : 2.2)));
  ctx.scale(s < .15 ? .15 : s, 1);
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(12, 0); ctx.lineTo(0, 3.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(12, 0); ctx.lineTo(6, -1.8); ctx.closePath(); ctx.fill(); ctx.restore();

  // flippers (live) + balls
  for (const f of sc.flips) drawFlipperLive(ctx, f);
  for (const b of sc.balls) drawBall(ctx, b.p.x, b.p.y, b.r);

  // floodlight sweep + gloss
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const fx = CENTER.x + Math.sin(t * 0.5) * 90;
  const fg = ctx.createRadialGradient(fx, 80, 6, fx, 80, 150); fg.addColorStop(0, 'rgba(255,255,255,.09)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fg; ctx.fillRect(16, 14, TW - 32, 360);
  const off = Math.sin(t * 0.3) * 30;
  const gl = ctx.createLinearGradient(120 + off, 20, 300 + off, 520);
  gl.addColorStop(.46, 'rgba(255,255,255,0)'); gl.addColorStop(.5, 'rgba(205,228,255,.12)'); gl.addColorStop(.54, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(16, 14, TW - 32, TH);
  ctx.restore();

  // GOAL celebration
  if (sc.flashGoal > 0) {
    const k = Math.min(1, sc.flashGoal / 0.8);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = k * 0.2; ctx.fillStyle = [C.red, C.purple, C.lime, C.emerald, C.gold, C.cyan][Math.floor(t * 12) % 6]; ctx.fillRect(16, 14, TW - 32, TH);
    const f2 = ctx.createRadialGradient(CENTER.x, 40, 2, CENTER.x, 40, 90); f2.addColorStop(0, `rgba(255,240,185,${0.6 * k})`); f2.addColorStop(1, 'rgba(255,240,185,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = f2; ctx.fillRect(60, 0, 240, 180);
    ctx.restore();
  }
  ctx.restore();

  // particles
  for (const s2 of sc.sparks) { ctx.globalAlpha = Math.max(0, s2.life / s2.ttl); ctx.fillStyle = s2.color; ctx.beginPath(); ctx.arc(s2.p.x, s2.p.y, 2.4, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const c of sc.confetti) { ctx.save(); ctx.translate(c.p.x, c.p.y); ctx.rotate(c.rot); ctx.fillStyle = c.color; ctx.globalAlpha = Math.min(1, c.life); ctx.fillRect(-2.4, -4, 4.8, 8); ctx.restore(); }
  ctx.globalAlpha = 1;
  for (const p of sc.popups) { ctx.globalAlpha = Math.min(1, p.life / 0.5); ctx.fillStyle = p.color; ctx.font = '800 15px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.p.x, p.p.y); }
  ctx.globalAlpha = 1;
}

/** Reset the baked static art (call if geometry ever changes). */
export function resetStatic() { staticCv = null; }
export const TABLE_W = TW, TABLE_H = TH;
