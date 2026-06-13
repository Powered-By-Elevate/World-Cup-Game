/* ============================================================
   WORLD CUP PINBALL — canvas renderer, ported from the Claude Design hand-off
   ("World Cup Pinball 2026", pinball-render.js). Data-driven: every element is
   painted at its real collider coordinate from scData (the Space Cadet dump).
   Painted FLAT in 2.5D so it reads 3D once the app applies rotateX().

   Split for performance: the static art (cabinet, turf, stands, ramps, chrome
   walls, part bases, decoration) is baked once into an offscreen canvas; the
   live state (pop bumpers, holes, spinner, flippers, balls, goal flash, gloss,
   particles) is drawn each frame from the engine `Scene`.
   ============================================================ */
import { SC_TW, SC_TH, SC_WALLS, SC_PARTS, type SCPart } from './scData';
import type { Segment, Bumper, Target, Goal, Flipper, Ball, Popup, Confetti, Spark, Hole, Spinner, Kickback } from './types';

const TW = SC_TW, TH = SC_TH;
type Ctx = CanvasRenderingContext2D;

const C = { gold: '#FFC400', red: '#D80000', purple: '#6000F0', blue: '#1769FF', lime: '#A8F000', emerald: '#00C060', maroon: '#781818', cyan: '#39E0FF', ink: '#05080f' };
const RES = 2;            // static supersample
const LX = 0.8, LY = 1.3; // single top-left light → shadows cast down-right
const BOUND = SC_WALLS[3];
const BUMP_COL = [C.red, C.purple, C.emerald, C.purple, C.red, C.emerald, C.purple];
const TAU = Math.PI * 2;

export type Aim = 'goal' | 'bumpers' | 'lanes' | 'spinner' | null;

export interface Scene {
  segs: Segment[]; bumpers: Bumper[]; targets: Target[]; goal: Goal;
  holes: Hole[]; spinner: Spinner; kickback: Kickback;
  flips: Flipper[]; balls: Ball[]; popups: Popup[]; confetti: Confetti[]; sparks: Spark[];
  charge: number; aim: Aim; t: number; flashGoal: number;
}

/* ---------------- shared primitives ---------------- */
function poly(ctx: Ctx, pts: number[][]) { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); }
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
  ctx.fillStyle = '#14181f';
  pent(ctx, x, y, r * .3, -90); ctx.fill();
  for (let k = 0; k < 5; k++) { const a = (-54 + k * 72) * Math.PI / 180; pent(ctx, x + Math.cos(a) * r * .72, y + Math.sin(a) * r * .72, r * .24, (-54 + k * 72) + 180); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(x - r * .35, y - r * .38, r * .28, r * .19, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.fill();
  ctx.restore();
}
function glowDot(ctx: Ctx, x: number, y: number, r: number, col: string, a?: number) { ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.shadowColor = col; ctx.shadowBlur = r * 1.8; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
function shadowEllipse(ctx: Ctx, x: number, y: number, rx: number) { ctx.save(); ctx.fillStyle = 'rgba(2,5,11,.5)'; ctx.beginPath(); ctx.ellipse(x + rx * .22, y + rx * .72, rx * 1.08, rx * 0.42, 0, 0, TAU); ctx.fill(); ctx.restore(); }
function mixWhite(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; r = Math.round(r + (255 - r) * a); g = Math.round(g + (255 - g) * a); b = Math.round(b + (255 - b) * a); return `rgb(${r},${g},${b})`; }

/* ---------------- static layers ---------------- */
function drawCabinet(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 360, 430);
  g.addColorStop(0, '#0a0f18'); g.addColorStop(1, '#05080f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 360, 430);
  drawHoarding(ctx, 8, 70, 78, 300);
  ctx.save(); ctx.globalAlpha = .5;
  for (let i = 0; i < 220; i++) { const x = 6 + ((i * 53) % 348), y = 4 + ((i * 17) % 30); if (x > 96 && x < 314) continue; ctx.fillStyle = ['#26324a', '#34405c', '#1c2742'][i % 3]; ctx.fillRect(x, y, 1.4, 1.4); }
  ctx.restore();
}
function drawHoarding(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.transform(1, .12, 0, 1, 0, 0); ctx.translate(-w / 2, -h / 2);
  const cols = [C.red, C.purple, C.lime, C.emerald, C.maroon], seg = h / 9;
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#0c1320' : '#10182a'; ctx.fillRect(0, i * seg, w, seg - 2);
    ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = .9; ctx.fillRect(0, i * seg, 3.5, seg - 2); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '700 6px Archivo'; ctx.save(); ctx.translate(7, i * seg + seg * .62); ctx.fillText('WORLD CUP 2026', 0, 0); ctx.restore();
  }
  ctx.strokeStyle = '#1b2742'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, w, h);
  ctx.restore();
}
function clipTurf(ctx: Ctx) { ctx.beginPath(); poly(ctx, BOUND); ctx.clip(); }
function drawTurf(ctx: Ctx) {
  ctx.save(); clipTurf(ctx);
  const g = ctx.createLinearGradient(0, 14, 0, 406);
  g.addColorStop(0, '#23854a'); g.addColorStop(.5, '#1a7a3c'); g.addColorStop(1, '#0f5022');
  ctx.fillStyle = g; ctx.fillRect(90, 10, 230, 400);
  ctx.globalAlpha = .05; ctx.fillStyle = '#fff';
  for (let y = 30; y < 406; y += 56) ctx.fillRect(90, y, 230, 28);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(234,246,255,.34)'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(100, 210); ctx.lineTo(312, 210); ctx.stroke();
  ctx.beginPath(); ctx.arc(205, 210, 30, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(205, 210, 1.8, 0, TAU); ctx.fillStyle = 'rgba(234,246,255,.4)'; ctx.fill();
  ctx.strokeRect(150, 14, 110, 50);
  ctx.beginPath(); ctx.arc(205, 64, 24, 0.15, Math.PI - 0.15); ctx.stroke();
  const v = ctx.createRadialGradient(205, 150, 30, 205, 220, 230);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(2,22,9,.72)');
  ctx.fillStyle = v; ctx.fillRect(90, 10, 230, 400);
  ctx.restore();
}
function drawGoalNet(ctx: Ctx) {
  const x0 = 176, x1 = 234, yt = 15, yb = 40;
  ctx.save();
  ctx.fillStyle = '#04101c'; ctx.fillRect(x0, yt, x1 - x0, yb - yt);
  ctx.strokeStyle = 'rgba(207,224,255,.5)'; ctx.lineWidth = .5;
  for (let i = -6; i < 14; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * 5, yt); ctx.lineTo(x0 + i * 5 + (yb - yt), yb); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x0 + i * 5, yt); ctx.lineTo(x0 + i * 5 - (yb - yt), yb); ctx.stroke(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0, yt); ctx.lineTo(x1, yt); ctx.lineTo(x1, yb); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 6; ctx.fillRect(x0 - 3, yt, 3, yb - yt); ctx.fillRect(x1, yt, 3, yb - yt);
  ctx.shadowBlur = 0; ctx.font = '700 8px Anton'; ctx.textAlign = 'center'; ctx.fillText('GOAL', 205, yt - 3);
  ctx.restore();
}
const wallClosed = (p: number[][]) => { const a = p[0], b = p[p.length - 1]; return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.3; };
const wallBig = (p: number[][]) => { let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9; p.forEach(q => { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }); return Math.max(mxx - mnx, mxy - mny); };
const PLASTIC = ['rgba(96,0,240,.2)', 'rgba(216,0,0,.18)', 'rgba(0,192,96,.18)', 'rgba(168,240,0,.16)'];
const STAND_BOXES: { p: Path2D; mnx: number; mny: number; mxx: number; mxy: number }[] = [];
function drawWalls(ctx: Ctx) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  let ci = 0;
  ctx.save(); ctx.shadowColor = 'rgba(2,5,11,.5)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = LX * 2.2; ctx.shadowOffsetY = LY * 2.2;
  const STAND: Record<number, string> = { 1: 'SKYBOX', 4: 'GRANDSTAND' }, SKIP_FILL: Record<number, number> = { 6: 1 };
  SC_WALLS.forEach((p, idx) => {
    if (idx === 3) return;
    if (STAND[idx] !== undefined) { drawStand(ctx, p, STAND[idx]); return; }
    if (SKIP_FILL[idx]) return;
    if (!wallClosed(p) || wallBig(p) <= 4) return;
    const pth = new Path2D(); p.forEach((pt, i) => i ? pth.lineTo(pt[0], pt[1]) : pth.moveTo(pt[0], pt[1])); pth.closePath();
    ctx.fillStyle = wallBig(p) > 13 ? PLASTIC[ci++ % PLASTIC.length] : 'rgba(206,216,233,.1)';
    ctx.fill(pth);
  });
  ctx.restore();
  const wp = new Path2D();
  SC_WALLS.forEach((p, idx) => { if (idx === 3 || wallBig(p) < 4) return; p.forEach((q, i) => i ? wp.lineTo(q[0], q[1]) : wp.moveTo(q[0], q[1])); });
  ctx.strokeStyle = 'rgba(150,178,220,.13)'; ctx.lineWidth = 4.6; ctx.stroke(wp);
  chromeWire(ctx, wp, 2.1);
  const bp = new Path2D(); BOUND.forEach((p, i) => i ? bp.lineTo(p[0], p[1]) : bp.moveTo(p[0], p[1]));
  chromeWire(ctx, bp, 2.9);
}
function drawStand(ctx: Ctx, p: number[][], label: string) {
  const pth = new Path2D(); p.forEach((pt, i) => i ? pth.lineTo(pt[0], pt[1]) : pth.moveTo(pt[0], pt[1])); pth.closePath();
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9, cx = 0, cy = 0;
  p.forEach(pt => { mnx = Math.min(mnx, pt[0]); mxx = Math.max(mxx, pt[0]); mny = Math.min(mny, pt[1]); mxy = Math.max(mxy, pt[1]); cx += pt[0]; cy += pt[1]; });
  cx /= p.length; cy /= p.length; const w = mxx - mnx, h = mxy - mny;
  STAND_BOXES.push({ p: pth, mnx, mny, mxx, mxy });
  ctx.save(); ctx.shadowColor = 'rgba(2,5,11,.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = LX * 2.6; ctx.shadowOffsetY = LY * 2.6; ctx.fillStyle = '#0c1422'; ctx.fill(pth); ctx.restore();
  ctx.save(); ctx.clip(pth);
  const bg = ctx.createLinearGradient(0, mny, 0, mxy); bg.addColorStop(0, '#0a1120'); bg.addColorStop(1, '#172236'); ctx.fillStyle = bg; ctx.fillRect(mnx - 2, mny - 2, w + 4, h + 4);
  const seat = ['#2b3850', '#3c4a66', '#34415c', '#414e6a'], fan = [C.red, C.purple, C.lime, C.emerald, C.gold, '#ffffff'];
  let y = mxy - 3, row = 0;
  while (y > mny + 2) {
    const rh = 2.2 + (y - mny) / h * 2.6;
    for (let x = mnx + 1; x < mxx; x += 2.9) {
      if (((x - mnx) % 13) < 1.5) continue;
      const rnd = ((x * 13 + row * 7) % 100) / 100;
      ctx.fillStyle = rnd < 0.07 ? fan[(x | 0) % 6] : seat[(row + (x | 0)) % 4];
      ctx.fillRect(x, y - rh * 0.55, 1.7, 1.35);
    }
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(mnx, y + 0.5, w, 0.7);
    y -= rh; row++;
  }
  for (let x = mnx + 3; x < mxx - 3; x += 8) { ctx.fillStyle = '#10192a'; ctx.fillRect(x, mny + 1.5, 5, 3.4); ctx.save(); ctx.shadowColor = 'rgba(255,224,150,.9)'; ctx.shadowBlur = 3; ctx.fillStyle = 'rgba(255,228,165,.9)'; ctx.fillRect(x + 0.7, mny + 2.1, 3.6, 2.1); ctx.restore(); }
  ctx.strokeStyle = 'rgba(168,184,212,.55)'; ctx.lineWidth = 1; ctx.stroke(pth);
  ctx.restore();
  ctx.save(); ctx.font = '700 7.5px Anton'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pw = ctx.measureText(label).width + 9;
  ctx.fillStyle = '#05080f'; ctx.fillRect(cx - pw / 2, cy - 6, pw, 12);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 0.7; ctx.strokeRect(cx - pw / 2, cy - 6, pw, 12);
  ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 4; ctx.fillText(label, cx, cy + 0.5);
  ctx.restore(); ctx.textBaseline = 'alphabetic';
}
function chromeWire(ctx: Ctx, p: Path2D, w: number) {
  ctx.save(); ctx.shadowColor = 'rgba(2,5,11,.5)'; ctx.shadowBlur = 2.2; ctx.shadowOffsetX = LX * 1.7; ctx.shadowOffsetY = LY * 1.7;
  ctx.strokeStyle = '#10172680'; ctx.lineWidth = w; ctx.stroke(p); ctx.restore();
  ctx.strokeStyle = '#1b2230'; ctx.lineWidth = w; ctx.stroke(p);
  ctx.save(); ctx.translate(-LX * w * 0.24, -LY * w * 0.24); ctx.strokeStyle = '#7c879c'; ctx.lineWidth = w * 0.7; ctx.stroke(p); ctx.restore();
  ctx.save(); ctx.translate(-LX * w * 0.4, -LY * w * 0.4); ctx.strokeStyle = '#c8d1e1'; ctx.lineWidth = w * 0.36; ctx.stroke(p); ctx.restore();
  ctx.save(); ctx.translate(-LX * w * 0.52, -LY * w * 0.52); ctx.strokeStyle = 'rgba(248,251,255,.92)'; ctx.lineWidth = w * 0.14; ctx.stroke(p); ctx.restore();
}
function pylon(ctx: Ctx, x: number, topY: number, dir: number) {
  ctx.save();
  ctx.strokeStyle = '#27303f'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x, topY + 26); ctx.lineTo(x, 416); ctx.stroke();
  ctx.strokeStyle = '#3a4658'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, topY + 26); ctx.lineTo(x, 416); ctx.stroke();
  ctx.translate(x, topY); ctx.rotate(dir * 0.26);
  ctx.fillStyle = '#0e1626'; ctx.strokeStyle = '#2a3344'; ctx.lineWidth = 1; ctx.fillRect(-13, -8, 26, 16); ctx.strokeRect(-13, -8, 26, 16);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.save(); ctx.shadowColor = 'rgba(255,250,220,.9)'; ctx.shadowBlur = 3.5; ctx.fillStyle = '#fff7d8'; ctx.beginPath(); ctx.arc(-9.5 + c * 6, -4.5 + r * 4.5, 1.5, 0, TAU); ctx.fill(); ctx.restore(); }
  const g = ctx.createRadialGradient(0, 6, 2, 0, 6, 46); g.addColorStop(0, 'rgba(255,250,220,.16)'); g.addColorStop(1, 'rgba(255,250,220,0)'); ctx.fillStyle = g; ctx.fillRect(-46, 2, 92, 70);
  ctx.restore();
}
const drawFloodlights = (ctx: Ctx) => { pylon(ctx, 86, 30, 0.5); pylon(ctx, 326, 30, -0.5); };
const DECOR: [number, number, string][] = [[232, 182, C.gold], [248, 250, C.cyan], [262, 205, C.emerald], [226, 300, C.red], [186, 322, C.lime], [244, 322, C.purple], [270, 252, C.gold], [210, 250, C.cyan]];
function drawPlayfieldArt(ctx: Ctx) {
  ctx.save(); clipTurf(ctx);
  ctx.save(); ctx.translate(205, 212); ctx.globalAlpha = .045; const rc = [C.purple, C.red, C.lime, C.emerald, C.gold, C.cyan];
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = rc[i % 6]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(178, -13); ctx.lineTo(178, 13); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.textAlign = 'center'; ctx.globalAlpha = .085; ctx.fillStyle = '#eaf2ff'; ctx.font = '700 22px Anton'; ctx.fillText('WORLD CUP', 205, 296);
  ctx.globalAlpha = .14; ctx.fillStyle = C.gold; ctx.font = '700 36px Anton'; ctx.fillText('2026', 205, 332); ctx.restore();
  ctx.save(); ctx.globalAlpha = .5; ctx.font = '700 5.5px Archivo'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfe0f5'; ctx.fillText('★ ATTACK ★', 240, 174); ctx.restore();
  DECOR.forEach(d => { ctx.save(); ctx.shadowColor = d[2]; ctx.shadowBlur = 4; ctx.globalAlpha = .5; ctx.fillStyle = d[2]; ctx.beginPath(); ctx.arc(d[0], d[1], 2.4, 0, TAU); ctx.fill(); ctx.globalAlpha = .9; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d[0] - .6, d[1] - .6, .9, 0, TAU); ctx.fill(); ctx.restore(); });
  ctx.restore();
}
function drawPitchMotif(ctx: Ctx) {
  ctx.save(); clipTurf(ctx);
  ctx.globalAlpha = .17;
  ctx.fillStyle = C.purple; ctx.beginPath(); ctx.moveTo(97, 14); ctx.lineTo(158, 14); ctx.lineTo(97, 80); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.emerald; ctx.beginPath(); ctx.moveTo(314, 14); ctx.lineTo(253, 14); ctx.lineTo(314, 80); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(97, 406); ctx.lineTo(158, 406); ctx.lineTo(97, 340); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.lime; ctx.beginPath(); ctx.moveTo(314, 406); ctx.lineTo(253, 406); ctx.lineTo(314, 340); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = .14; ctx.strokeStyle = '#fff'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.arc(205, 210, 13, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.14)'; pent(ctx, 205, 210, 4.2, -90); ctx.fill();
  for (let k = 0; k < 5; k++) { const a = (-54 + k * 72) * Math.PI / 180; pent(ctx, 205 + Math.cos(a) * 9, 210 + Math.sin(a) * 9, 2.6, (-54 + k * 72) + 180); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.restore();
}
function buntingRun(ctx: Ctx, x0: number, x1: number, y0: number, sag: number, cols: string[]) {
  const n = Math.max(4, Math.round((x1 - x0) / 9));
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = .5;
  ctx.beginPath(); for (let i = 0; i <= n; i++) { const f = i / n, tx = x0 + (x1 - x0) * f, ty = y0 + Math.sin(Math.PI * f) * sag; if (i) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); } ctx.stroke();
  for (let i = 0; i < n; i++) { const f = (i + .5) / n, tx = x0 + (x1 - x0) * f, ty = y0 + Math.sin(Math.PI * f) * sag; ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(tx - 2.3, ty); ctx.lineTo(tx + 2.3, ty); ctx.lineTo(tx, ty + 5); ctx.closePath(); ctx.fill(); }
}
function drawBunting(ctx: Ctx) {
  buntingRun(ctx, 100, 172, 14, 9, [C.red, C.purple, C.lime, C.emerald, C.gold]);
  buntingRun(ctx, 240, 313, 14, 9, [C.emerald, C.gold, C.purple, C.red, C.lime]);
}
function drawLighting(ctx: Ctx) {
  ctx.save(); clipTurf(ctx);
  const lg = ctx.createLinearGradient(97, 14, 314, 406);
  lg.addColorStop(0, 'rgba(255,255,238,.12)'); lg.addColorStop(.42, 'rgba(255,255,238,0)'); lg.addColorStop(1, 'rgba(0,8,4,.3)');
  ctx.fillStyle = lg; ctx.fillRect(90, 10, 230, 400);
  const v = ctx.createRadialGradient(205, 200, 60, 205, 210, 240);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(2,12,6,.4)');
  ctx.fillStyle = v; ctx.fillRect(90, 10, 230, 400);
  ctx.restore();
}

/* ---------------- ramps + decorative slings ---------------- */
const LANES = [
  { pts: [[120, 332], [109, 250], [112, 168], [128, 120], [164, 92]], col: C.lime, sp: 0.5 },
  { pts: [[300, 334], [300, 205], [296, 135], [280, 92], [250, 62]], col: C.cyan, sp: 0.42 },
];
function drawRamps(ctx: Ctx) {
  LANES.forEach(lane => {
    const p = new Path2D(); lane.pts.forEach((pt, i) => i ? p.lineTo(pt[0], pt[1]) : p.moveTo(pt[0], pt[1]));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = lane.col; ctx.globalAlpha = .08; ctx.lineWidth = 11; ctx.stroke(p);
    ctx.globalAlpha = .13; ctx.lineWidth = 6.5; ctx.stroke(p);
    ctx.translate(-LX * 1.4, -LY * 1.4); ctx.globalAlpha = .5; ctx.lineWidth = 1.2; ctx.stroke(p);
    ctx.restore();
  });
  ctx.save(); ctx.translate(291, 255); ctx.rotate(-Math.PI / 2); ctx.font = '700 6.5px Anton'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(57,224,255,.7)'; ctx.fillText('ON-RAMP', 0, 0); ctx.restore();
}
const SLING = [{ x: 151, y: 347, ang: -0.5 }, { x: 261, y: 347, ang: Math.PI + 0.5 }];
function drawSlingBase(ctx: Ctx, s: { x: number; y: number; ang: number }) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang);
  ctx.fillStyle = 'rgba(2,5,11,.45)'; ctx.beginPath(); ctx.moveTo(-5, -4.5 + 2); ctx.lineTo(-5, 4.5 + 2); ctx.lineTo(6.5, 2); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(-5, 0, 6.5, 0); g.addColorStop(0, '#5e8208'); g.addColorStop(1, C.lime);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.lineTo(6.5, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#eaffb0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -4.5); ctx.lineTo(6.5, 0); ctx.stroke();
  ctx.restore();
}

/* ---------------- part bases (non-bumper, baked into static) ---------------- */
function drawPartBase(ctx: Ctx, p: SCPart) {
  switch (p.type) {
    case 'kout': { const cyan = Math.abs(p.x - 152.4) < 1, col = cyan ? C.cyan : C.gold;
      glowDot(ctx, p.x, p.y, 9, col, .9); ctx.save(); ctx.fillStyle = '#03070e'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.arc(p.x, p.y - 0.4, 7, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      if (cyan) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2.5, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#d6ffff'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y - 1.4, 2.4, Math.PI, 0); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(p.x - 3, p.y - 1.4, 6, 5); ctx.fillStyle = '#03070e'; ctx.fillRect(p.x - .8, p.y, 1.6, 2.4); }
      ctx.font = '700 6px Anton'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 4; ctx.fillText(cyan ? 'TUNNEL' : 'LOCK', p.x, p.y + 16); ctx.restore(); break; }
    case 'sink': { glowDot(ctx, p.x, p.y, 4.2, C.gold, .85); ctx.save(); ctx.fillStyle = '#06101e'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill(); ctx.restore(); break; }
    case 'yTarget': { ctx.save();
      ctx.fillStyle = 'rgba(2,5,11,.45)'; ctx.beginPath(); ctx.ellipse(p.x + 1.2, p.y + 3, 4, 1.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1205'; ctx.fillRect(p.x - 4, p.y - 0.4, 8, 3.2);
      ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 5; ctx.fillRect(p.x - 3.6, p.y - 4.4, 7.2, 5); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(p.x - 3.6, p.y - 4.4, 7.2, 1.1);
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(p.x - 3.6, p.y - 0.2, 7.2, 1); ctx.restore(); break; }
    case 'rTarget': { ctx.save();
      ctx.fillStyle = 'rgba(2,5,11,.45)'; ctx.beginPath(); ctx.ellipse(p.x + 1.2, p.y + 3, 3.6, 1.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0c1018'; ctx.fillRect(p.x - 3.4, p.y - 0.4, 6.8, 3);
      ctx.fillStyle = '#eef2f8'; ctx.fillRect(p.x - 3, p.y - 4.6, 6, 5);
      ctx.fillStyle = C.red; ctx.fillRect(p.x - 3, p.y - 4.6, 6, 1.9);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(p.x - 3, p.y - 4.6, 6, .8); ctx.restore(); break; }
    case 'flag': { ctx.save(); ctx.strokeStyle = '#0c1320'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y + 7); ctx.lineTo(p.x, p.y - 8); ctx.stroke();
      ctx.fillStyle = '#0c1320'; ctx.beginPath(); ctx.arc(p.x, p.y + 7, 1.6, 0, TAU); ctx.fill(); ctx.restore(); break; }
    case 'kicker': { ctx.save(); glowDot(ctx, p.x, p.y, 6.5, C.lime, .9); ctx.strokeStyle = '#33490a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#0b2407'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 3.4); ctx.lineTo(p.x - 3, p.y + 1); ctx.lineTo(p.x + 3, p.y + 1); ctx.closePath(); ctx.fill();
      ctx.font = '700 4px Archivo'; ctx.textAlign = 'center'; ctx.fillStyle = '#0b2407'; ctx.fillText('VAR', p.x, p.y + 4.6); ctx.restore(); break; }
    case 'gate': { ctx.save(); ctx.strokeStyle = '#7d8696'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI); ctx.stroke(); ctx.restore(); break; }
    case 'oneway': { ctx.save(); ctx.fillStyle = 'rgba(200,242,60,.5)'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 2.4); ctx.lineTo(p.x - 2.2, p.y + 1.4); ctx.lineTo(p.x + 2.2, p.y + 1.4); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case 'trip': glowDot(ctx, p.x, p.y, 2.6, C.lime, .85); break;
    case 'roll': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.r) * Math.PI / 180); ctx.fillStyle = 'rgba(200,242,60,.85)'; ctx.shadowColor = C.lime; ctx.shadowBlur = 5; ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 2.4, 0, 0, TAU); ctx.fill(); ctx.restore(); break; }
    case 'rollG': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.r) * Math.PI / 180); ctx.fillStyle = 'rgba(255,196,0,.9)'; ctx.shadowColor = C.gold; ctx.shadowBlur = 6; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 2.8, 0, 0, TAU); ctx.fill(); ctx.restore(); break; }
    case 'bloc': { ctx.save(); shadowEllipse(ctx, p.x, p.y, 3); const gg = ctx.createRadialGradient(p.x - 1, p.y - 1.5, .5, p.x, p.y, 4); gg.addColorStop(0, '#fff'); gg.addColorStop(1, '#7d8696'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill(); ctx.restore(); break; }
    case 'rampHole': { ctx.save(); ctx.fillStyle = '#03070e'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 3.4, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c0c8d6'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); break; }
    case 'plunger': { ctx.save(); ctx.fillStyle = '#0a1019'; ctx.fillRect(p.x - 4, p.y - 16, 8, 36); ctx.restore(); break; }
  }
}

/* ---------------- live elements ---------------- */
function drawBumper(ctx: Ctx, x: number, y: number, col: string, h: number) {
  const r = 8, capY = y - r * 0.5 - h * 2.6;
  ctx.save(); ctx.fillStyle = 'rgba(2,5,11,.5)'; ctx.beginPath(); ctx.ellipse(x + r * 0.35, y + r * 0.8, r * 1.25 * (1 + h * 0.08), r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 9 + h * 16; ctx.fillStyle = h > 0.02 ? mixWhite(col, Math.min(0.85, h * 0.9)) : col;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.42, r * 1.2, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#070b12'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.34, r * 0.9, r * 0.38, 0, 0, TAU); ctx.fill();
  const sg = ctx.createLinearGradient(x - r, 0, x + r, 0); sg.addColorStop(0, '#070b12'); sg.addColorStop(.46, '#27313f'); sg.addColorStop(.6, '#2f3a4a'); sg.addColorStop(1, '#070b12');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x - r * 0.82, capY + r * 0.25); ctx.lineTo(x + r * 0.82, capY + r * 0.25); ctx.lineTo(x + r * 0.92, y + r * 0.34); ctx.lineTo(x - r * 0.92, y + r * 0.34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x, capY + r * 0.6, r * 0.85, r * 0.3, 0, 0, TAU); ctx.fill();
  const cr = r * (1 + h * 0.16);
  soccer(ctx, x, capY, cr);
  ctx.save(); ctx.strokeStyle = h > 0.3 ? '#ffffff' : col; ctx.shadowColor = col; ctx.shadowBlur = 10 + h * 14; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, capY + cr * 0.52, cr * 1.02, cr * 0.44, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x - cr * 0.34, capY - cr * 0.42, cr * 0.36, cr * 0.2, -0.5, 0, TAU); ctx.fill(); ctx.restore();
  if (h > 0.02) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const rr = cr + (1 - h) * 13; ctx.globalAlpha = h * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 1.8 + h; ctx.beginPath(); ctx.arc(x, capY, rr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = h * 0.5; const fg = ctx.createRadialGradient(x, capY, 1, x, capY, cr * 1.7); fg.addColorStop(0, '#fff'); fg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x, capY, cr * 1.7, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
function drawFlipperLive(ctx: Ctx, f: Flipper) {
  const col = f.side === 'L' ? C.red : C.purple, hi = f.side === 'L' ? '#ff8a82' : '#b78aff';
  const tx = f.pivot.x + Math.cos(f.angle) * f.len, ty = f.pivot.y + Math.sin(f.angle) * f.len;
  ctx.save(); ctx.fillStyle = 'rgba(2,5,11,.45)'; ctx.beginPath(); ctx.ellipse((f.pivot.x + tx) / 2, (f.pivot.y + ty) / 2 + 2.5, f.len / 2, f.r, f.angle, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = f.r * 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.pivot.x, f.pivot.y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = hi; ctx.lineWidth = f.r * .7; ctx.beginPath(); ctx.moveTo(f.pivot.x + Math.cos(f.angle) * 3, f.pivot.y + Math.sin(f.angle) * 3 - 1.4); ctx.lineTo(tx - Math.cos(f.angle) * 3, ty - Math.sin(f.angle) * 3 - 1.4); ctx.stroke();
  ctx.fillStyle = '#161b26'; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, f.r * .85, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a4150'; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, f.r * .4, 0, TAU); ctx.fill(); ctx.restore();
}
function drawBall(ctx: Ctx, x: number, y: number, r: number) {
  shadowEllipse(ctx, x, y, r);
  soccer(ctx, x, y, r);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .5;
  const g = ctx.createRadialGradient(x - r * .42, y - r * .46, .4, x, y, r); g.addColorStop(0, '#fff'); g.addColorStop(.4, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
}
function drawChevron(ctx: Ctx, x: number, y: number, a: number, col: string, lit: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = .22 + lit * .78;
  if (lit > 0.25) { ctx.shadowColor = col; ctx.shadowBlur = 5 + lit * 5; }
  ctx.strokeStyle = lit > 0.6 ? '#ffffff' : col; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-2.4, -3); ctx.lineTo(2.6, 0); ctx.lineTo(-2.4, 3); ctx.stroke(); ctx.restore();
}
function drawFlowArrows(ctx: Ctx, t: number) {
  LANES.forEach(lane => {
    const pts = lane.pts; const segs: { x: number; y: number; dx: number; dy: number; len: number; start: number }[] = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], len = Math.hypot(dx, dy); segs.push({ x: pts[i][0], y: pts[i][1], dx: dx / len, dy: dy / len, len, start: total }); total += len; }
    const chase = (t * lane.sp) % 1;
    for (let d = 8; d < total - 4; d += 15) {
      let s = segs[0]; for (let k = 0; k < segs.length; k++) if (d >= segs[k].start) s = segs[k];
      const x = s.x + s.dx * (d - s.start), y = s.y + s.dy * (d - s.start), a = Math.atan2(s.dy, s.dx), f = d / total;
      const fwd = ((f - chase + 1) % 1); const lit = Math.max(0, 1 - fwd * 7);
      drawChevron(ctx, x, y, a, lane.col, lit);
    }
  });
}
function drawGloss(ctx: Ctx, t: number) {
  ctx.save(); clipTurf(ctx); ctx.globalCompositeOperation = 'screen';
  const off = Math.sin(t * 0.3) * 26;
  const g = ctx.createLinearGradient(120 + off, 20, 300 + off, 360);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.46, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(205,228,255,.13)'); g.addColorStop(.54, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(90, 10, 230, 400);
  const r = ctx.createRadialGradient(150, 95, 8, 150, 95, 210); r.addColorStop(0, 'rgba(255,255,255,.09)'); r.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = r; ctx.fillRect(90, 10, 230, 400);
  ctx.restore();
}

/* ---------------- static cache + frame ---------------- */
let staticCv: HTMLCanvasElement | null = null;
function getStatic(): HTMLCanvasElement {
  if (staticCv) return staticCv;
  const cv = document.createElement('canvas'); cv.width = TW * RES; cv.height = TH * RES;
  const ctx = cv.getContext('2d')!; ctx.scale(RES, RES); STAND_BOXES.length = 0;
  drawCabinet(ctx); drawTurf(ctx); drawFloodlights(ctx); drawPitchMotif(ctx); drawPlayfieldArt(ctx); drawGoalNet(ctx); drawRamps(ctx); drawWalls(ctx);
  SC_PARTS.forEach(p => { if (p.type !== 'bumper' && p.type !== 'drain') drawPartBase(ctx, p); });
  SLING.forEach(s => drawSlingBase(ctx, s));
  drawLighting(ctx); drawBunting(ctx);
  staticCv = cv;
  return cv;
}

export function drawTable(ctx: Ctx, sc: Scene): void {
  const t = sc.t / 1000;
  ctx.drawImage(getStatic(), 0, 0, TW, TH);

  // live pop-bumpers (hit envelope from engine lit; lit≈0.28s on a hit)
  sc.bumpers.forEach((b, i) => drawBumper(ctx, b.p.x, b.p.y, BUMP_COL[i % BUMP_COL.length], Math.min(1, b.lit / 0.28)));

  // breathing inserts over the kickout holes + decor lenses
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const p of SC_PARTS) {
    if (p.type === 'kout') { const col = Math.abs(p.x - 152.4) < 1 ? C.cyan : C.gold; glowDot(ctx, p.x, p.y, 9 + pulse * 3, col, .25 + pulse * .35); }
    if (p.type === 'kicker') glowDot(ctx, p.x, p.y, 6 + pulse * 2, C.lime, .18 + pulse * .22);
  }
  DECOR.forEach((d, i) => { const pl = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.3); glowDot(ctx, d[0], d[1], 2 + pl * 2.4, d[2], .15 + pl * .4); });
  ctx.restore();

  // flow arrows chasing the orbits
  drawFlowArrows(ctx, t);

  // floodlight sweep
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const fx = 205 + Math.sin(t * 0.5) * 70;
  const fg = ctx.createRadialGradient(fx, 60, 4, fx, 60, 120);
  fg.addColorStop(0, 'rgba(255,255,255,.10)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fg; ctx.fillRect(90, 10, 230, 260);
  ctx.restore();

  // spinning corner flags (faster when the spinner has energy)
  const spinFast = sc.spinner.spin > 0;
  for (const p of SC_PARTS) {
    if (p.type !== 'flag') continue;
    ctx.save(); ctx.translate(p.x, p.y - 4.5);
    const s = Math.abs(Math.cos(t * (spinFast ? 7 : 2.2)));
    ctx.scale(s < .15 ? .15 : s, 1);
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(11, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(11, 0); ctx.lineTo(5.5, -1.7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // flippers (live angle) + balls
  for (const f of sc.flips) drawFlipperLive(ctx, f);
  for (const b of sc.balls) drawBall(ctx, b.p.x, b.p.y, b.r);

  // glossy clear-coat sheen
  drawGloss(ctx, t);

  // GOAL celebration when the engine flags a goal
  if (sc.flashGoal > 0) {
    const k = Math.min(1, sc.flashGoal / 0.8);
    ctx.save(); clipTurf(ctx); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = k * 0.22; ctx.fillStyle = [C.red, C.purple, C.lime, C.emerald, C.gold, C.cyan][Math.floor(t * 12) % 6]; ctx.fillRect(90, 10, 230, 400);
    ctx.globalAlpha = (Math.floor(t * 16) % 2) ? k * 0.16 : 0; ctx.fillStyle = '#fff'; ctx.fillRect(90, 10, 230, 400);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const f2 = ctx.createRadialGradient(205, 27, 2, 205, 27, 82);
    f2.addColorStop(0, `rgba(255,240,185,${0.6 * k})`); f2.addColorStop(1, 'rgba(255,240,185,0)');
    ctx.fillStyle = f2; ctx.fillRect(108, 0, 194, 135);
    ctx.restore();
  }

  // engine particles: sparks, confetti, score popups
  for (const s of sc.sparks) { ctx.globalAlpha = Math.max(0, s.life / s.ttl); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.p.x, s.p.y, 2, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const c of sc.confetti) { ctx.save(); ctx.translate(c.p.x, c.p.y); ctx.rotate(c.rot); ctx.fillStyle = c.color; ctx.globalAlpha = Math.min(1, c.life); ctx.fillRect(-2, -3.4, 4, 6.8); ctx.restore(); }
  ctx.globalAlpha = 1;
  for (const p of sc.popups) { ctx.globalAlpha = Math.min(1, p.life / 0.5); ctx.fillStyle = p.color; ctx.font = '800 13px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.p.x, p.p.y); }
  ctx.globalAlpha = 1;
}

export const TABLE_W = TW, TABLE_H = TH;
