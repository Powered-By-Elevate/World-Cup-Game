/* ============================================================
   SOCCER STARS — a top-down, turn-based table-soccer mini-game.
   Pull back on one of your discs to aim, release to fire (the longer
   the pull, the more power). Knock the ball into the CPU's goal.
   First to 3 goals wins. Pure 2D canvas physics — no deps, themed to
   your drafted team. Built for the whole family, no soccer skill needed.
   ============================================================ */
import { useRef, useEffect, useState, useCallback } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import type { Team } from '../data/types';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';

/* ---- world (logical, portrait pitch). All physics in these units. ---- */
const W = 300, H = 480;
const GOAL_W = 120;                 // goal-mouth width
const GL = (W - GOAL_W) / 2, GR = (W + GOAL_W) / 2;
const R_P = 15, R_B = 10.5;         // radii: player disc / ball
const MASS_P = 1.5, MASS_B = 0.85;
const WALL_E = 0.74, HIT_E = 0.94;  // restitution: walls / disc-on-disc
const FRICTION = 0.977;             // per-frame velocity decay
const STOP = 0.14;                  // settle threshold (speed)
const MAX_SPEED = 17;               // top shot speed (units/frame)
const MIN_PULL = 8, MAX_PULL = 120; // pull distance → power
const WIN_GOALS = 3;
const SUBSTEPS = 5;

type Kind = 'me' | 'cpu' | 'ball';
type Phase = 'me' | 'cpu' | 'sim' | 'goal' | 'over';
interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number; kind: Kind; keeper?: boolean; }

interface Props { team: Team; onClose: () => void; }

const RIVALS = ['BRA', 'ARG', 'FRA', 'ENG', 'GER', 'ESP', 'NED', 'POR', 'ITA'];

/** Kickoff formation — me defends the bottom goal, cpu the top. */
function formation(): Body[] {
  const mk = (x: number, y: number, kind: Kind, keeper = false): Body =>
    ({ x, y, vx: 0, vy: 0, r: kind === 'ball' ? R_B : R_P, m: kind === 'ball' ? MASS_B : MASS_P, kind, keeper });
  return [
    // me (bottom half)
    mk(W / 2, H * 0.93, 'me', true),
    mk(W * 0.26, H * 0.74, 'me'), mk(W * 0.74, H * 0.74, 'me'),
    mk(W * 0.37, H * 0.60, 'me'), mk(W * 0.63, H * 0.60, 'me'),
    // cpu (top half, mirrored)
    mk(W / 2, H * 0.07, 'cpu', true),
    mk(W * 0.26, H * 0.26, 'cpu'), mk(W * 0.74, H * 0.26, 'cpu'),
    mk(W * 0.37, H * 0.40, 'cpu'), mk(W * 0.63, H * 0.40, 'cpu'),
    // ball
    mk(W / 2, H / 2, 'ball'),
  ];
}

export function SoccerStars({ team, onClose }: Props) {
  const shooterId = POT_KEYS.map(pk => team.picks?.[pk]).find(Boolean) || 'BRA';
  const cpuId = RIVALS.find(r => r !== shooterId) || 'GER';
  const me = NATION[shooterId], cpu = NATION[cpuId];
  const meColor = me?.c1 || '#2BD4D4', meAlt = me?.c2 || '#0E3C7A';
  const cpuColor = cpu?.c1 || '#E8552B', cpuAlt = cpu?.c2 || '#111';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // simulation lives in refs (no re-render per frame); React state is HUD only.
  const bodies = useRef<Body[]>(formation());
  const phaseRef = useRef<Phase>('me');
  const lastMover = useRef<Kind>('cpu');
  const scoreRef = useRef({ me: 0, cpu: 0 });
  const drag = useRef<{ i: number; px: number; py: number } | null>(null);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });

  const [phase, setPhaseS] = useState<Phase>('me');
  const [score, setScore] = useState({ me: 0, cpu: 0 });
  const [toast, setToast] = useState<string | null>(null);

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseS(p); };

  const scheduleAI = useCallback(() => {
    window.setTimeout(() => { if (phaseRef.current === 'cpu') aiShoot(); }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTurn = useCallback((t: Kind) => {
    setPhase(t === 'cpu' ? 'cpu' : 'me');
    if (t === 'cpu') scheduleAI();
  }, [scheduleAI]);

  // ---- AI: pick the disc best placed to push the ball into the bottom goal ----
  const aiShoot = useCallback(() => {
    const bs = bodies.current;
    const ball = bs.find(b => b.kind === 'ball')!;
    const goal = { x: W / 2, y: H + 26 };                 // where cpu wants to score
    const dgx = goal.x - ball.x, dgy = goal.y - ball.y;
    const dg = Math.hypot(dgx, dgy) || 1;
    const gnx = dgx / dg, gny = dgy / dg;                 // ball → goal (downward)

    let best: Body | null = null, bestScore = -Infinity;
    for (const b of bs) {
      if (b.kind !== 'cpu') continue;
      const dx = ball.x - b.x, dy = ball.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const align = (dx / d) * gnx + (dy / d) * gny;      // is the disc behind the ball?
      const s = align - d / 700 - (b.keeper ? 0.6 : 0);   // prefer aligned, near, non-keeper
      if (s > bestScore) { bestScore = s; best = b; }
    }
    if (!best) { setTurn('me'); return; }

    // aim from the disc through the ball, biased toward the goal, with a little wobble.
    let ax = ball.x - best.x, ay = ball.y - best.y;
    const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    ax = ax * 0.7 + gnx * 0.3; ay = ay * 0.7 + gny * 0.3;
    const wob = (((best.x * 7 + best.y * 13 + scoreRef.current.cpu) % 10) / 10 - 0.5) * 0.22;
    const ca = Math.cos(wob), sa = Math.sin(wob);
    const fx = ax * ca - ay * sa, fy = ax * sa + ay * ca;
    const fl = Math.hypot(fx, fy) || 1;
    const power = MAX_SPEED * (0.72 + ((best.x % 5) / 5) * 0.2);
    best.vx = (fx / fl) * power; best.vy = (fy / fl) * power;

    lastMover.current = 'cpu';
    setPhase('sim');
  }, [setTurn]);

  // ---- goal / reset ----
  const handleGoal = useCallback((scorer: Kind) => {
    for (const b of bodies.current) { b.vx = 0; b.vy = 0; }
    const s = { ...scoreRef.current };
    if (scorer === 'me') s.me++; else s.cpu++;
    scoreRef.current = s; setScore(s);
    setPhase('goal');
    const won = s.me >= WIN_GOALS || s.cpu >= WIN_GOALS;
    setToast(scorer === 'me' ? 'GOAL!' : 'They scored');
    window.setTimeout(() => {
      setToast(null);
      if (won) { setPhase('over'); return; }
      bodies.current = formation();
      setTurn(scorer === 'me' ? 'cpu' : 'me');         // conceding side kicks off
    }, 1150);
  }, [setTurn]);

  // ---- physics step (called each frame while simulating) ----
  const step = useCallback(() => {
    const bs = bodies.current;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const b of bs) { b.x += b.vx / SUBSTEPS; b.y += b.vy / SUBSTEPS; }
      // walls
      for (const b of bs) {
        const inMouth = b.x > GL && b.x < GR;
        if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * WALL_E; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -b.vx * WALL_E; }
        if (b.kind === 'ball' && inMouth) continue;       // let the ball into the mouth
        if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * WALL_E; }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -b.vy * WALL_E; }
      }
      // pairwise collisions
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) collide(bs[i], bs[j]);
      // goal?
      const ball = bs[bs.length - 1];
      if (ball.x > GL && ball.x < GR) {
        if (ball.y < -ball.r) { handleGoal('me'); return; }   // top goal = my goal
        if (ball.y > H + ball.r) { handleGoal('cpu'); return; }
      }
    }
    // friction + settle
    let maxV = 0;
    for (const b of bs) { b.vx *= FRICTION; b.vy *= FRICTION; maxV = Math.max(maxV, Math.hypot(b.vx, b.vy)); }
    if (maxV < STOP) {
      for (const b of bs) { b.vx = 0; b.vy = 0; }
      setTurn(lastMover.current === 'me' ? 'cpu' : 'me');
    }
  }, [handleGoal, setTurn]);

  // ---- render + main loop ----
  useEffect(() => {
    const cv = canvasRef.current!, wrap = wrapRef.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const cw = wrap.clientWidth;
      const ch = cw * H / W;
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      cv.style.height = `${ch}px`;
      sizeRef.current = { w: cw, h: ch, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (phaseRef.current === 'sim') step();
      draw(ctx, bodies.current, drag.current, sizeRef.current, phaseRef.current,
        { meColor, meAlt, cpuColor, cpuAlt });
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ---- pointer (pull-back aim) ----
  const toWorld = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  const onDown = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'me') return;
    const p = toWorld(e);
    const bs = bodies.current;
    let pick = -1, bd = 1e9;
    for (let i = 0; i < bs.length; i++) {
      if (bs[i].kind !== 'me') continue;
      const d = Math.hypot(bs[i].x - p.x, bs[i].y - p.y);
      if (d < bs[i].r + 14 && d < bd) { bd = d; pick = i; }
    }
    if (pick < 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { i: pick, px: p.x, py: p.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toWorld(e);
    drag.current = { ...drag.current, px: p.x, py: p.y };
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    if (!d || phaseRef.current !== 'me') return;
    const b = bodies.current[d.i];
    const pull = Math.hypot(b.x - d.px, b.y - d.py);
    if (pull < MIN_PULL) return;                          // a tap, not a shot
    const power = Math.min(pull, MAX_PULL) / MAX_PULL * MAX_SPEED;
    const dx = b.x - d.px, dy = b.y - d.py, dl = Math.hypot(dx, dy) || 1;
    b.vx = dx / dl * power; b.vy = dy / dl * power;
    lastMover.current = 'me';
    setPhase('sim');
  };

  const replay = () => {
    bodies.current = formation();
    scoreRef.current = { me: 0, cpu: 0 }; setScore({ me: 0, cpu: 0 });
    setToast(null); setTurn('me');
  };

  const won = phase === 'over' && score.me > score.cpu;

  return (
    <div className="pk-overlay ss-overlay">
      <div className="ss-top">
        <button className="ins-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="ss-scoreline">
          <div className="ss-side"><Flag id={shooterId} size={26} ring="pot" /><span className="ss-num">{score.me}</span></div>
          <span className="ss-dash">–</span>
          <div className="ss-side"><span className="ss-num">{score.cpu}</span><Flag id={cpuId} size={26} /></div>
        </div>
        <div className="ss-first">first to {WIN_GOALS}</div>
      </div>

      <div className="ss-stagewrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="ss-canvas"
          style={{ touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {toast && <div className={`ss-toast ${toast === 'GOAL!' ? 'goal' : 'miss'}`}>{toast}</div>}

        {phase === 'over' && (
          <div className="ss-end">
            <div className="eyebrow" style={{ color: won ? 'var(--lime)' : 'var(--live)' }}>{won ? 'Full time' : 'Full time'}</div>
            <div className="display" style={{ fontSize: 56, color: 'var(--paper)', lineHeight: 1, margin: '4px 0' }}>{score.me}<span style={{ color: '#9C988C' }}>–</span>{score.cpu}</div>
            <div className="muted" style={{ color: '#CFCBBE', fontSize: 14, marginBottom: 16 }}>
              {won ? `${team.name} take the win! 🏆` : 'The CPU edged it — run it back.'}
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-ghost btn-block" style={{ color: 'var(--paper)', borderColor: 'rgba(255,255,255,.3)' }} onClick={onClose}>Done</button>
              <button className="btn btn-lime btn-block" onClick={replay}>Play again</button>
            </div>
          </div>
        )}
      </div>

      <div className="ss-controls">
        {phase === 'me' && <div className="pk-hint">Your turn — <b style={{ color: 'var(--lime)' }}>drag back</b> on one of your discs and release to shoot ⚽</div>}
        {phase === 'cpu' && <div className="pk-hint">{cpu?.name || 'CPU'} is taking their shot…</div>}
        {phase === 'sim' && <div className="pk-hint">&nbsp;</div>}
        {phase === 'goal' && <div className="pk-hint">&nbsp;</div>}
      </div>
    </div>
  );
}

/* ---- elastic collision with positional correction (impulse method) ---- */
function collide(a: Body, b: Body) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy); if (d === 0) d = 0.01;
  const min = a.r + b.r;
  if (d >= min) return;
  const nx = dx / d, ny = dy / d;
  const overlap = min - d, tot = a.m + b.m;
  a.x -= nx * overlap * (b.m / tot); a.y -= ny * overlap * (b.m / tot);
  b.x += nx * overlap * (a.m / tot); b.y += ny * overlap * (a.m / tot);
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn > 0) return;                                   // already separating
  const jimp = -(1 + HIT_E) * vn / (1 / a.m + 1 / b.m);
  a.vx -= jimp * nx / a.m; a.vy -= jimp * ny / a.m;
  b.vx += jimp * nx / b.m; b.vy += jimp * ny / b.m;
}

/* ---- drawing ---- */
interface Palette { meColor: string; meAlt: string; cpuColor: string; cpuAlt: string; }
function draw(
  ctx: CanvasRenderingContext2D, bs: Body[], drag: { i: number; px: number; py: number } | null,
  size: { w: number; h: number; dpr: number }, phase: Phase, pal: Palette,
) {
  const s = size.w / W, dpr = size.dpr;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // pitch
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1f7a3f'); g.addColorStop(1, '#176232');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // mowed stripes
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < H; i += 40) ctx.fillRect(0, i, W, 20);
  // markings
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.beginPath(); ctx.moveTo(6, H / 2); ctx.lineTo(W - 6, H / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 42, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  // boxes
  ctx.strokeRect((W - 150) / 2, 6, 150, 56);
  ctx.strokeRect((W - 150) / 2, H - 62, 150, 56);
  // goals
  drawGoal(ctx, 6, true); drawGoal(ctx, H - 6, false);

  // discs
  for (const b of bs) {
    if (b.kind === 'ball') continue;
    const fill = b.kind === 'me' ? pal.meColor : pal.cpuColor;
    const ring = b.kind === 'me' ? '#ffffff' : '#0c0c0c';
    const inner = b.keeper ? (b.kind === 'me' ? pal.meAlt : pal.cpuAlt) : fill;
    // shadow
    ctx.beginPath(); ctx.arc(b.x + 1.5, b.y + 2.5, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    // body
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke();
    // inner hub
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = inner; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
  }
  // ball
  const ball = bs[bs.length - 1];
  ctx.beginPath(); ctx.arc(ball.x + 1, ball.y + 2, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = '#f6f6f6'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#333'; ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 0.34, 0, Math.PI * 2); ctx.fill();

  // aim (pull-back) preview
  if (drag && phase === 'me') {
    const b = bs[drag.i];
    const dx = b.x - drag.px, dy = b.y - drag.py;
    const pull = Math.hypot(dx, dy);
    if (pull > MIN_PULL) {
      const pw = Math.min(pull, MAX_PULL) / MAX_PULL;     // 0..1
      const ux = dx / pull, uy = dy / pull;
      const len = 26 + pw * 78;
      // sling line (where you pulled to)
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(drag.px, drag.py); ctx.stroke();
      ctx.setLineDash([]);
      // shot arrow (opposite of pull)
      const tx = b.x + ux * len, ty = b.y + uy * len;
      const col = pw > 0.85 ? '#ff5630' : pw > 0.5 ? '#ffd166' : '#C8F23C';
      ctx.lineWidth = 4; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
      const ah = 7, aa = Math.atan2(uy, ux);
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx - ah * Math.cos(aa - 0.4), ty - ah * Math.sin(aa - 0.4));
      ctx.lineTo(tx - ah * Math.cos(aa + 0.4), ty - ah * Math.sin(aa + 0.4));
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      // power ring on the disc
      ctx.lineWidth = 3.5; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); ctx.stroke();
    }
  }
}

function drawGoal(ctx: CanvasRenderingContext2D, y: number, top: boolean) {
  ctx.save();
  // net
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(GL, top ? 0 : y, GOAL_W, 6);
  // posts
  ctx.fillStyle = '#f2f2f2';
  const ph = 7;
  ctx.fillRect(GL - 3, top ? 0 : y - ph + 6, 4, ph);
  ctx.fillRect(GR - 1, top ? 0 : y - ph + 6, 4, ph);
  // mouth line
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(GL, y); ctx.lineTo(GR, y); ctx.stroke();
  ctx.restore();
}
