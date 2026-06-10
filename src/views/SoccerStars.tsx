/* ============================================================
   SOCCER STARS — a top-down, turn-based table-soccer mini-game.
   Landscape pitch, goals left & right. Pull back on one of your flag
   discs to aim, release to fire (longer pull = more power). Knock the
   ball into the CPU's goal; first to 3 wins. Pure 2D canvas physics —
   no deps — your nation's flag vs a rival's. Built for the whole family.

   Visual treatment: "Arcade chip" design lane (Claude Design hand-off) —
   stadium-at-night ambiance, poker-chip flag discs, broadcast HUD, a
   lime→gold→red aim redline, a GOAL! celebration, and a full-time card.
   Gameplay/physics are LOCKED; only the dressing changed.
   ============================================================ */
import { useRef, useEffect, useState, useCallback } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import type { Team } from '../data/types';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';

/* ---- world (logical, LANDSCAPE pitch). All physics in these units. ---- */
const W = 480, H = 300;
const GOAL_H = 110;                 // goal-mouth height (on the left/right edges)
const GT = (H - GOAL_H) / 2, GB = (H + GOAL_H) / 2;
const R_P = 18, R_B = 12;           // radii: player disc / ball
const MASS_P = 1.55, MASS_B = 0.78; // ball a touch lighter → zippier off a strike
const WALL_E = 0.72, HIT_E = 0.95;  // restitution: walls / disc-on-disc (bumper-car bounce)
const FRICTION = 0.971;             // per-frame velocity decay (snappier settle)
const STOP = 0.2;                   // settle threshold (speed) — ends turns sooner
const MAX_SPEED = 18.5;             // top shot speed (units/frame)
const MIN_PULL = 9, MAX_PULL = 118; // pull distance → power (full power easier to reach)
const WIN_GOALS = 3;
const SUBSTEPS = 5;

/* aim redline thresholds (engineering spec from the design) */
const PW_LO = 0.45, PW_HI = 0.78;
const colorForPower = (p: number) => (p < PW_LO ? '#C8F23C' : p < PW_HI ? '#FFB000' : '#FF2D2D');

/* pot accent colours (design palette) */
const POT_COLOR: Record<string, string> = { FAV: '#FFB000', UND: '#07C2C7', LNG: '#FF3D9A' };

type Kind = 'me' | 'cpu' | 'ball';
type Phase = 'me' | 'cpu' | 'sim' | 'goal' | 'over';
interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number; kind: Kind; keeper?: boolean; }

interface Props { team: Team; onClose: () => void; }

const RIVALS = ['BRA', 'ARG', 'FRA', 'ENG', 'GER', 'ESP', 'NED', 'POR', 'ITA'];

/** Deterministic "level" badge from a string (purely decorative). */
const levelOf = (s: string) => 12 + (Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % 11);

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

/* one-time decorative crowd bokeh (stadium ambiance) */
function buildBokeh() {
  const cols = ['#cfd6dd', '#7fe3e6', '#ffd27a', '#ff9ec6'];
  return Array.from({ length: 42 }, (_, i) => ({
    left: Math.random() * 100,
    top: Math.random() < 0.5 ? Math.random() * 22 : 78 + Math.random() * 22, // top/bottom stands (vh%)
    c: cols[i % 4],
    o: +(0.25 + Math.random() * 0.5).toFixed(2),
    s: +(0.6 + Math.random() * 1.1).toFixed(2),
  }));
}
/* one-time confetti pieces for the goal celebration */
function buildConfetti() {
  const cols = ['#C8F23C', '#FFB000', '#FFFFFF', '#9FC419', '#39E0FF'];
  return Array.from({ length: 64 }, (_, i) => ({
    left: Math.random() * 100,
    bg: cols[i % 5],
    d: +(1.1 + Math.random() * 1.1).toFixed(2),
    delay: +(Math.random() * 0.4).toFixed(2),
    rot: Math.round(Math.random() * 360),
  }));
}

export function SoccerStars({ team, onClose }: Props) {
  const shooterId = POT_KEYS.map(pk => team.picks?.[pk]).find(Boolean) || 'BRA';
  const cpuId = RIVALS.find(r => r !== shooterId) || 'GER';
  const me = NATION[shooterId], cpu = NATION[cpuId];
  const meColor = me?.c1 || '#2BD4D4', meAlt = me?.c2 || '#0E3C7A';
  const cpuColor = cpu?.c1 || '#E8552B', cpuAlt = cpu?.c2 || '#111';

  const myPot = POT_KEYS.find(pk => team.picks?.[pk] === shooterId) || me?.pot || 'FAV';
  const cpuPot = cpu?.pot || 'UND';
  const myPotColor = POT_COLOR[myPot] || '#FFB000';
  const cpuPotColor = POT_COLOR[cpuPot] || '#07C2C7';

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
  const [celebrate, setCelebrate] = useState<Kind | null>(null);   // 'me' | 'cpu' goal flash

  // decorative one-time visuals
  const [bokeh] = useState(buildBokeh);
  const [confetti] = useState(buildConfetti);

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
    // a bit of aim wobble so the family can win; widens when the CPU is ahead.
    const lead = Math.max(0, scoreRef.current.cpu - scoreRef.current.me);
    const wob = (((best.x * 7 + best.y * 13 + scoreRef.current.cpu) % 10) / 10 - 0.5) * (0.30 + lead * 0.06);
    const ca = Math.cos(wob), sa = Math.sin(wob);
    const fx = ax * ca - ay * sa, fy = ax * sa + ay * ca;
    const fl = Math.hypot(fx, fy) || 1;
    const power = MAX_SPEED * (0.70 + ((best.x % 5) / 5) * 0.16);
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
    setCelebrate(scorer);
    window.setTimeout(() => {
      setCelebrate(null);
      if (won) { setPhase('over'); return; }
      bodies.current = formation();
      setTurn(scorer === 'me' ? 'cpu' : 'me');         // conceding side kicks off
    }, 1250);
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

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (phaseRef.current === 'sim') step();
      draw(ctx, bodies.current, drag.current, sizeRef.current, phaseRef.current, t,
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
    setCelebrate(null); setTurn('me');
  };

  const won = phase === 'over' && score.me > score.cpu;
  const tokLabel =
    phase === 'me' ? 'Your turn'
    : phase === 'cpu' ? `${cpu?.name || 'CPU'}'s turn`
    : phase === 'over' ? 'Full time' : 'In play';
  const hint =
    phase === 'me' ? 'Pull back & release to shoot'
    : phase === 'cpu' ? `${cpu?.name || 'CPU'} is lining one up…`
    : 'Watch it play out…';

  // a player card for the HUD (pot-ring avatar + level + name)
  const Pcard = (o: { side: 'left' | 'right'; on: boolean; dim: boolean; flagId: string; ring: string; name: string; sub: string; lv: number }) => (
    <div className={`ss-pcard ${o.side === 'right' ? 'right' : ''} ${o.dim ? 'dim' : ''} ${o.on ? 'on' : ''}`}>
      <div className="ss-avatar" style={{ ['--pot' as string]: o.ring }}>
        <span className="ss-ring" />
        <span className="ss-face"><Flag id={o.flagId} size={31} ring="ink" shine={false} /></span>
        <span className="ss-lv">LV {o.lv}</span>
      </div>
      <div className="ss-pmeta">
        <div className="ss-pname">{o.name}</div>
        <div className="ss-psub">{o.sub}</div>
      </div>
    </div>
  );

  return (
    <div className="ss-arcade">
      {/* ===== stadium-at-night ambiance ===== */}
      <div className="ss-stadium" aria-hidden="true">
        <div className="ss-sky" />
        <div className="ss-stands top" />
        <div className="ss-stands bot" />
        <div className="ss-bokeh">
          {bokeh.map((b, i) => (
            <span key={i} style={{ left: `${b.left}%`, top: `${b.top}%`, ['--c' as string]: b.c, opacity: b.o, transform: `scale(${b.s})` }} />
          ))}
        </div>
        <div className="ss-flood l" /><div className="ss-flood r" />
        <div className="ss-flood bl" /><div className="ss-flood br" />
        <div className="ss-spot" />
        <div className="ss-drift" />
      </div>

      <button className="ss-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>

      {/* ===== HUD ===== */}
      <div className="ss-hud">
        {Pcard({ side: 'left', on: phase === 'me', dim: phase === 'cpu', flagId: shooterId, ring: myPotColor, name: team.name, sub: `You · ${myPot}`, lv: levelOf(team.name) })}
        <div className="ss-board">
          <div className="ss-score"><b>{score.me}</b><span className="sep">–</span><b>{score.cpu}</b></div>
          <div className="ss-tok"><span className="dot" />{tokLabel}</div>
        </div>
        {Pcard({ side: 'right', on: phase === 'cpu', dim: phase === 'me', flagId: cpuId, ring: cpuPotColor, name: cpu?.name || 'CPU', sub: `CPU · ${cpuPot}`, lv: levelOf(cpuId) })}
      </div>

      {/* ===== pitch (canvas) ===== */}
      <div className="ss-pitchwrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="ss-canvas"
          style={{ touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      {/* ===== turn hint ===== */}
      {phase !== 'over' && (
        <div className="ss-turnhint" data-on={phase === 'me' ? 'true' : 'false'}>
          <span className="pin" />{hint}
        </div>
      )}

      {/* ===== goal celebration ===== */}
      <div className={`ss-goalmoment ${celebrate ? 'show' : ''} ${celebrate === 'cpu' ? 'cpu' : ''}`} aria-hidden="true">
        <div className="flash" />
        <div className="shock" />
        {celebrate === 'me' && (
          <div className="confetti">
            {confetti.map((c, i) => (
              <i key={i} style={{ left: `${c.left}%`, background: c.bg, ['--d' as string]: `${c.d}s`, ['--delay' as string]: `${c.delay}s`, transform: `rotate(${c.rot}deg)` }} />
            ))}
          </div>
        )}
        <div className="word display">{celebrate === 'cpu' ? 'Goal' : 'Goal!'}</div>
        <div className="sub eyebrow">{(celebrate === 'cpu' ? cpu?.name : me?.name) || ''} strikes</div>
      </div>

      {/* ===== full-time card ===== */}
      {phase === 'over' && (
        <div className="ss-endcard show">
          <div className="ec-dim" />
          <div className="ec-panel">
            <div className="ec-eyebrow eyebrow">Full time</div>
            <div className="ss-ecdisc"><Flag id={won ? shooterId : cpuId} size={84} ring="pot" /></div>
            <div className="ec-headline display">{(won ? team.name : cpu?.name) || 'CPU'} wins</div>
            <div className="ec-score">{score.me} – {score.cpu}</div>
            <div className="ec-potm">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
              Player of the match · {(won ? me?.name : cpu?.name) || ''}
            </div>
            <div className="ec-actions">
              <button className="ec-btn ghost" onClick={onClose}>Done</button>
              <button className="ec-btn primary" onClick={replay}>Play again</button>
            </div>
          </div>
        </div>
      )}
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

/* ================= drawing ================= */
interface Palette {
  meColor: string; meAlt: string; cpuColor: string; cpuAlt: string;
  meId: string; cpuId: string; meImg: HTMLImageElement | null; cpuImg: HTMLImageElement | null;
}
function draw(
  ctx: CanvasRenderingContext2D, bs: Body[], drag: { i: number; px: number; py: number } | null,
  size: { w: number; h: number; dpr: number }, phase: Phase, t: number, pal: Palette,
) {
  const s = size.w / W, dpr = size.dpr;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  ctx.clearRect(0, 0, W, H);

  drawPitch(ctx);
  drawGoal(ctx, 7, true); drawGoal(ctx, W - 7, false);

  // discs
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.kind === 'ball') continue;
    const img = b.kind === 'me' ? pal.meImg : pal.cpuImg;
    const color = b.kind === 'me' ? pal.meColor : pal.cpuColor;
    const alt = b.kind === 'me' ? pal.meAlt : pal.cpuAlt;
    const code = b.kind === 'me' ? pal.meId : pal.cpuId;
    const active = (b.kind === 'me' && phase === 'me') || (b.kind === 'cpu' && phase === 'cpu');
    drawHalo(ctx, b, active, t);
    drawChip(ctx, b, img, color, alt, code, drag?.i === i);
  }

  drawBall(ctx, bs[bs.length - 1]);

  // aim (pull-back) redline preview
  if (drag && phase === 'me') drawAim(ctx, bs[drag.i], drag);
}

function drawPitch(ctx: CanvasRenderingContext2D) {
  // grass gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3FA84B'); g.addColorStop(0.55, '#2E8B3C'); g.addColorStop(1, '#247031');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // mow stripes (vertical)
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < W; i += 56) ctx.fillRect(i, 0, 28, H);
  // goalmouth wear (left & right)
  for (const wx of [0, W]) {
    const wear = ctx.createRadialGradient(wx, H / 2, 4, wx, H / 2, 60);
    wear.addColorStop(0, 'rgba(120,90,40,0.30)'); wear.addColorStop(1, 'rgba(120,90,40,0)');
    ctx.fillStyle = wear; ctx.fillRect(wx - 60, 0, 120, H);
  }
  // light bloom (off-centre)
  const bloom = ctx.createRadialGradient(W * 0.4, H * 0.3, 0, W * 0.4, H * 0.3, W * 0.55);
  bloom.addColorStop(0, 'rgba(255,255,255,0.16)'); bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);

  // chalk markings
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.beginPath(); ctx.moveTo(W / 2, 7); ctx.lineTo(W / 2, H - 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 44, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
  // penalty boxes (big + small, both ends)
  const bigH = 150, bigY = (H - bigH) / 2, bigW = 52;
  const smH = 66, smY = (H - smH) / 2, smW = 22;
  ctx.strokeRect(7, bigY, bigW, bigH); ctx.strokeRect(7, smY, smW, smH);
  ctx.strokeRect(W - 7 - bigW, bigY, bigW, bigH); ctx.strokeRect(W - 7 - smW, smY, smW, smH);

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,40,10,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

/** breathing turn-halo under the active side's discs (cyan = me, red = cpu) */
function drawHalo(ctx: CanvasRenderingContext2D, b: Body, active: boolean, t: number) {
  if (!active) return;
  const ph = (Math.sin(t / 382) + 1) / 2;               // 0..1 breathe
  const op = 0.42 + 0.45 * ph, rr = b.r + 7 + ph * 5;
  const gc = b.kind === 'me' ? '57,224,255' : '255,45,45';
  const rad = ctx.createRadialGradient(b.x, b.y, b.r * 0.4, b.x, b.y, rr);
  rad.addColorStop(0, `rgba(${gc},${op * 0.9})`); rad.addColorStop(0.62, `rgba(${gc},${op * 0.4})`); rad.addColorStop(1, `rgba(${gc},0)`);
  ctx.fillStyle = rad;
  ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();
}

/** metallic conic rim for a chip (silver / gold for keepers), with fallback */
function rimGradient(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, keeper: boolean) {
  let g: CanvasGradient;
  try { g = (ctx as unknown as { createConicGradient: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient(220 * Math.PI / 180, x, y); }
  catch { g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); }
  const silver: [number, string][] = [[0, '#fdfdfd'], [.18, '#b9bcc4'], [.34, '#8d9099'], [.5, '#eef0f3'], [.66, '#9a9da6'], [.82, '#d9dbe0'], [1, '#fdfdfd']];
  const gold: [number, string][] = [[0, '#fff3cf'], [.18, '#ffce5a'], [.34, '#e09a16'], [.5, '#fff0c4'], [.66, '#f0a91e'], [.82, '#ffd873'], [1, '#fff3cf']];
  for (const [o, c] of (keeper ? gold : silver)) g.addColorStop(o, c);
  return g;
}

/** A flag disc rendered as a physical poker chip. */
function drawChip(ctx: CanvasRenderingContext2D, b: Body, img: HTMLImageElement | null, color: string, alt: string, code: string, dragging: boolean) {
  const r = b.r;
  // contact shadow
  ctx.beginPath(); ctx.ellipse(b.x, b.y + r - 1, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fill();
  // keeper gold glow
  if (b.keeper) {
    const gl = ctx.createRadialGradient(b.x, b.y, r * 0.5, b.x, b.y, r + 7);
    gl.addColorStop(0, 'rgba(255,176,0,0.45)'); gl.addColorStop(1, 'rgba(255,176,0,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(b.x, b.y, r + 7, 0, Math.PI * 2); ctx.fill();
  }
  // metallic rim
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = rimGradient(ctx, b.x, b.y, r, !!b.keeper); ctx.fill();

  // flag face (clipped)
  const fr = r - 3.2;
  ctx.save();
  ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.clip();
  const ready = img && img.complete && img.naturalWidth > 0;
  if (ready) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max((fr * 2) / iw, (fr * 2) / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, b.x - dw / 2, b.y - dh / 2, dw, dh);
  } else {
    const grd = ctx.createLinearGradient(b.x - fr, b.y - fr, b.x + fr, b.y + fr);
    grd.addColorStop(0, color); grd.addColorStop(1, alt);
    ctx.fillStyle = grd; ctx.fillRect(b.x - fr, b.y - fr, fr * 2, fr * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `700 ${fr * 0.66}px Archivo, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(code, b.x, b.y + 0.5);
  }
  // inner depth (top light → bottom shadow) + gloss highlight
  const ish = ctx.createLinearGradient(b.x, b.y - fr, b.x, b.y + fr);
  ish.addColorStop(0, 'rgba(255,255,255,0.22)'); ish.addColorStop(0.5, 'rgba(255,255,255,0)'); ish.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = ish; ctx.fillRect(b.x - fr, b.y - fr, fr * 2, fr * 2);
  ctx.beginPath(); ctx.ellipse(b.x, b.y - fr * 0.42, fr * 0.78, fr * 0.42, 0, 0, Math.PI * 2);
  const gloss = ctx.createLinearGradient(b.x, b.y - fr, b.x, b.y);
  gloss.addColorStop(0, 'rgba(255,255,255,0.5)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.fill();
  ctx.restore();

  // seam between rim and flag
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.stroke();
  // brighter cyan ring while dragging the active disc
  if (dragging) {
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(57,224,255,0.9)';
    ctx.beginPath(); ctx.arc(b.x, b.y, r + 1.5, 0, Math.PI * 2); ctx.stroke();
  }
}

/** A proper soccer ball: radial body, central pentagon, seams. */
function drawBall(ctx: CanvasRenderingContext2D, ball: Body) {
  const r = ball.r, cx = ball.x, cy = ball.y;
  // shadow
  ctx.beginPath(); ctx.ellipse(cx, cy + r - 1, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
  // body
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f1f1ee'); g.addColorStop(1, '#c9cbc6');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 0.8; ctx.strokeStyle = '#9a9c98'; ctx.stroke();
  // central pentagon + seams
  const pr = r * 0.42;
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([cx + Math.cos(a) * pr, cy + Math.sin(a) * pr]); }
  ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
  ctx.fillStyle = '#1d1f22'; ctx.fill();
  ctx.strokeStyle = '#2b2d30'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); ctx.stroke();
  }
}

/** Aim redline: dashed pull + knob, power chevrons (2→6), power arc; lime→gold→red. */
function drawAim(ctx: CanvasRenderingContext2D, b: Body, drag: { px: number; py: number }) {
  const dx = b.x - drag.px, dy = b.y - drag.py;
  const pull = Math.hypot(dx, dy);
  if (pull <= MIN_PULL) return;
  const pw = Math.min(pull, MAX_PULL) / MAX_PULL;        // 0..1
  const ux = dx / pull, uy = dy / pull;                  // forward shot direction
  const cc = colorForPower(pw);

  // dashed pull line + knob (back toward the finger)
  ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,238,225,0.7)';
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(drag.px, drag.py); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(drag.px, drag.py, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(244,238,225,0.9)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,238,225,0.25)'; ctx.stroke();

  // forward chevrons (2 → 6 by power)
  const n = Math.round(2 + pw * 4);
  const a = Math.atan2(uy, ux), start = b.r + 5;
  for (let i = 0; i < n; i++) {
    const px = b.x + ux * (start + i * 7), py = b.y + uy * (start + i * 7);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.globalAlpha = 0.4 + 0.6 * (i + 1) / n; ctx.fillStyle = cc;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(6, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // power arc around the disc
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = cc; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawGoal(ctx: CanvasRenderingContext2D, x: number, left: boolean) {
  const d = 9, x0 = left ? x : x - d;                    // net region inside the mouth
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, GT, d, GOAL_H); ctx.clip();
  ctx.fillStyle = 'rgba(8,18,10,0.32)'; ctx.fillRect(x0, GT, d, GOAL_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  for (let yy = GT; yy <= GB; yy += 6) { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + d, yy); ctx.stroke(); }
  for (let xx = x0; xx <= x0 + d; xx += 6) { ctx.beginPath(); ctx.moveTo(xx, GT); ctx.lineTo(xx, GB); ctx.stroke(); }
  ctx.restore();
  // frame (goal line) + post caps + highlight
  ctx.strokeStyle = '#f6f7f4'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, GT); ctx.lineTo(x, GB); ctx.stroke();
  ctx.fillStyle = '#f6f7f4';
  ctx.fillRect(x - 2, GT - 3, 4, 6); ctx.fillRect(x - 2, GB - 3, 4, 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + (left ? 1 : -1), GT); ctx.lineTo(x + (left ? 1 : -1), GB); ctx.stroke();
}
