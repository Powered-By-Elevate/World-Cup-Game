/* ============================================================
   SOCCER STARS — a top-down, turn-based table-soccer mini-game.
   Landscape pitch, goals left & right. Pull back on one of your flag
   discs to aim, release to fire (longer pull = more power). Knock the
   ball into the CPU's goal; first to 3 wins. Pure 2D canvas physics —
   no deps — your nation's flag vs a rival's. Built for the whole family.
   ============================================================ */
import { useRef, useEffect, useState, useCallback } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import type { Team } from '../data/types';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';

/* ---- world (logical, LANDSCAPE pitch). All physics in these units. ---- */
const W = 480, H = 300;
const GOAL_H = 100;                 // goal-mouth height (on the left/right edges)
const GT = (H - GOAL_H) / 2, GB = (H + GOAL_H) / 2;
const R_P = 18, R_B = 12;           // radii: player disc / ball
const MASS_P = 1.5, MASS_B = 0.8;
const WALL_E = 0.74, HIT_E = 0.94;  // restitution: walls / disc-on-disc
const FRICTION = 0.978;             // per-frame velocity decay
const STOP = 0.14;                  // settle threshold (speed)
const MAX_SPEED = 18;               // top shot speed (units/frame)
const MIN_PULL = 9, MAX_PULL = 135; // pull distance → power
const WIN_GOALS = 3;
const SUBSTEPS = 5;

type Kind = 'me' | 'cpu' | 'ball';
type Phase = 'me' | 'cpu' | 'sim' | 'goal' | 'over';
interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number; kind: Kind; keeper?: boolean; }

interface Props { team: Team; onClose: () => void; }

const RIVALS = ['BRA', 'ARG', 'FRA', 'ENG', 'GER', 'ESP', 'NED', 'POR', 'ITA'];

/** Kickoff formation — me defends the LEFT goal, cpu the RIGHT. */
function formation(): Body[] {
  const mk = (x: number, y: number, kind: Kind, keeper = false): Body =>
    ({ x, y, vx: 0, vy: 0, r: kind === 'ball' ? R_B : R_P, m: kind === 'ball' ? MASS_B : MASS_P, kind, keeper });
  return [
    // me (left half)
    mk(28, H / 2, 'me', true),
    mk(W * 0.20, H * 0.28, 'me'), mk(W * 0.20, H * 0.72, 'me'),
    mk(W * 0.38, H * 0.40, 'me'), mk(W * 0.38, H * 0.60, 'me'),
    // cpu (right half, mirrored)
    mk(W - 28, H / 2, 'cpu', true),
    mk(W * 0.80, H * 0.28, 'cpu'), mk(W * 0.80, H * 0.72, 'cpu'),
    mk(W * 0.62, H * 0.40, 'cpu'), mk(W * 0.62, H * 0.60, 'cpu'),
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
  const meImg = useRef<HTMLImageElement | null>(null);
  const cpuImg = useRef<HTMLImageElement | null>(null);

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
    window.setTimeout(() => { if (phaseRef.current === 'cpu') aiShoot(); }, 750);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTurn = useCallback((t: Kind) => {
    setPhase(t === 'cpu' ? 'cpu' : 'me');
    if (t === 'cpu') scheduleAI();
  }, [scheduleAI]);

  // ---- AI: pick the disc best placed to push the ball into the LEFT goal ----
  const aiShoot = useCallback(() => {
    const bs = bodies.current;
    const ball = bs.find(b => b.kind === 'ball')!;
    const goal = { x: -26, y: H / 2 };                    // where cpu wants to score (left)
    const dgx = goal.x - ball.x, dgy = goal.y - ball.y;
    const dg = Math.hypot(dgx, dgy) || 1;
    const gnx = dgx / dg, gny = dgy / dg;                 // ball → goal (leftward)

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
    const power = MAX_SPEED * (0.74 + ((best.x % 5) / 5) * 0.2);
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
        const inMouth = b.y > GT && b.y < GB;
        if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * WALL_E; }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -b.vy * WALL_E; }
        if (b.kind === 'ball' && inMouth) continue;       // let the ball into the mouth
        if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * WALL_E; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -b.vx * WALL_E; }
      }
      // pairwise collisions
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) collide(bs[i], bs[j]);
      // goal?
      const ball = bs[bs.length - 1];
      if (ball.y > GT && ball.y < GB) {
        if (ball.x < -ball.r) { handleGoal('cpu'); return; }   // left goal = my goal conceded
        if (ball.x > W + ball.r) { handleGoal('me'); return; } // right goal = I score
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

  // ---- preload flag images (drawn clipped into the discs) ----
  useEffect(() => {
    const load = (flag: string | undefined, ref: React.MutableRefObject<HTMLImageElement | null>) => {
      if (!flag) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `https://flagcdn.com/w160/${flag}.png`;
      ref.current = img;
    };
    load(me?.flag, meImg);
    load(cpu?.flag, cpuImg);
  }, [me?.flag, cpu?.flag]);

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
        { meColor, meAlt, cpuColor, cpuAlt, meId: shooterId, cpuId, meImg: meImg.current, cpuImg: cpuImg.current });
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
      if (d < bs[i].r + 16 && d < bd) { bd = d; pick = i; }
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
  const turnLabel =
    phase === 'me' ? 'Your turn — drag back on a disc & release ⚽'
    : phase === 'cpu' ? `${cpu?.name || 'CPU'} is lining one up…`
    : phase === 'over' ? '' : ' ';

  return (
    <div className="pk-overlay ss-overlay">
      <div className="ss-top">
        <button className="ins-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className={`ss-player ${phase === 'me' ? 'on' : ''}`}>
          <Flag id={shooterId} size={30} ring="pot" />
          <div className="ss-pmeta"><span className="ss-pname">{team.name}</span><span className="ss-psub">{me?.name || 'You'}</span></div>
        </div>
        <div className="ss-scoreboard">
          <span className="ss-snum">{score.me}</span>
          <span className="ss-vs">–</span>
          <span className="ss-snum">{score.cpu}</span>
        </div>
        <div className={`ss-player right ${phase === 'cpu' ? 'on' : ''}`}>
          <div className="ss-pmeta"><span className="ss-pname">{cpu?.name || 'CPU'}</span><span className="ss-psub">CPU</span></div>
          <Flag id={cpuId} size={30} />
        </div>
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
            <div className="eyebrow" style={{ color: won ? 'var(--lime)' : 'var(--live)' }}>Full time</div>
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

      <div className="ss-controls"><div className="pk-hint">{turnLabel || ' '}</div></div>
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
interface Palette {
  meColor: string; meAlt: string; cpuColor: string; cpuAlt: string;
  meId: string; cpuId: string; meImg: HTMLImageElement | null; cpuImg: HTMLImageElement | null;
}
function draw(
  ctx: CanvasRenderingContext2D, bs: Body[], drag: { i: number; px: number; py: number } | null,
  size: { w: number; h: number; dpr: number }, phase: Phase, pal: Palette,
) {
  const s = size.w / W, dpr = size.dpr;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // pitch
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a9b4e'); g.addColorStop(1, '#1c7a3c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // mowed vertical stripes
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let i = 0; i < W; i += 56) ctx.fillRect(i, 0, 28, H);
  // markings
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.beginPath(); ctx.moveTo(W / 2, 7); ctx.lineTo(W / 2, H - 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 44, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  // penalty boxes (left & right)
  const boxH = 150, by = (H - boxH) / 2, boxW = 52;
  ctx.strokeRect(7, by, boxW, boxH);
  ctx.strokeRect(W - 7 - boxW, by, boxW, boxH);
  // goals (left & right mouths)
  drawGoal(ctx, 7, true); drawGoal(ctx, W - 7, false);

  // discs
  for (const b of bs) {
    if (b.kind === 'ball') continue;
    const img = b.kind === 'me' ? pal.meImg : pal.cpuImg;
    const color = b.kind === 'me' ? pal.meColor : pal.cpuColor;
    const alt = b.kind === 'me' ? pal.meAlt : pal.cpuAlt;
    const code = b.kind === 'me' ? pal.meId : pal.cpuId;
    // glow halo under the side whose turn it is
    if ((b.kind === 'me' && phase === 'me') || (b.kind === 'cpu' && phase === 'cpu')) {
      const gc = b.kind === 'me' ? '57,224,255' : '255,107,107';
      const rad = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r + 9);
      rad.addColorStop(0, `rgba(${gc},0.55)`); rad.addColorStop(1, `rgba(${gc},0)`);
      ctx.fillStyle = rad;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 9, 0, Math.PI * 2); ctx.fill();
    }
    drawDisc(ctx, b, img, color, alt, code);
  }
  // ball
  const ball = bs[bs.length - 1];
  ctx.beginPath(); ctx.arc(ball.x + 1, ball.y + 2, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = '#f8f8f8'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#444'; ctx.stroke();
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
      const len = 30 + pw * 92;
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(drag.px, drag.py); ctx.stroke();
      ctx.setLineDash([]);
      const tx = b.x + ux * len, ty = b.y + uy * len;
      const col = pw > 0.85 ? '#ff5630' : pw > 0.5 ? '#ffd166' : '#C8F23C';
      ctx.lineWidth = 5; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
      const ah = 9, aa = Math.atan2(uy, ux);
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx - ah * Math.cos(aa - 0.4), ty - ah * Math.sin(aa - 0.4));
      ctx.lineTo(tx - ah * Math.cos(aa + 0.4), ty - ah * Math.sin(aa + 0.4));
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); ctx.stroke();
    }
  }
}

/** A flag disc: flag image clipped into a circle (falls back to kit colours). */
function drawDisc(ctx: CanvasRenderingContext2D, b: Body, img: HTMLImageElement | null, color: string, alt: string, code: string) {
  // shadow
  ctx.beginPath(); ctx.arc(b.x + 1.5, b.y + 2.5, b.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();

  const ready = img && img.complete && img.naturalWidth > 0;
  if (ready) {
    ctx.save();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.clip();
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max((b.r * 2) / iw, (b.r * 2) / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, b.x - dw / 2, b.y - dh / 2, dw, dh);
    ctx.restore();
  } else {
    const grd = ctx.createLinearGradient(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r);
    grd.addColorStop(0, color); grd.addColorStop(1, alt);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `bold ${b.r * 0.62}px Archivo, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(code, b.x, b.y + 0.5);
  }
  // white ring + keepers get a gold ring
  ctx.lineWidth = 3.2; ctx.strokeStyle = b.keeper ? '#FFC53D' : '#ffffff';
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.6, 0, Math.PI * 2); ctx.stroke();
}

function drawGoal(ctx: CanvasRenderingContext2D, x: number, left: boolean) {
  ctx.save();
  // net shading just inside the mouth
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(left ? 0 : x, GT, 7, GOAL_H);
  // posts
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(left ? 0 : x - 4, GT - 4, 5, 8);
  ctx.fillRect(left ? 0 : x - 4, GB - 4, 5, 8);
  // mouth line
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, GT); ctx.lineTo(x, GB); ctx.stroke();
  ctx.restore();
}
