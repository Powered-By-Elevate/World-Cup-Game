/* ============================================================
   SOCCER STARS — LIVE multiplayer match (turn-based, first to 3).

   Two players share one authoritative match (utils/soccerMatch) polled ~1.2s.
   On YOUR turn you pull back a disc and fire; the shot is simulated locally with
   the deterministic engine (game/soccerSim), the resting board is written as the
   source of truth, and the opponent REPLAYS your shot (same engine, same impulse)
   then snaps to your authoritative board. Side 'a' defends the left goal and
   plays the left ('me') discs; side 'b' the right ('cpu') discs. Same board
   orientation for both, which is what keeps the replay deterministic.

   First playable cut — drive a real two-device match to shake out feel/timing.
   ============================================================ */
import { useRef, useEffect, useState, useCallback } from 'react';
import { NATION } from '../data/nations';
import { Icon } from '../components/Icon';
import {
  W, H, GT, GB, R_P, R_B, MAX_PULL, formation, stepWorld, pullToVelocity,
  toWire, fromWire, type Body, type Kind,
} from '../game/soccerSim';
import {
  loadMatch, submitTurn, requestRematch, abandonMatch, WIN_GOALS,
  type SoccerMatch, type LastShot,
} from '../utils/soccerMatch';

const PW_LO = 0.45, PW_HI = 0.78;
const powerColor = (p: number) => (p < PW_LO ? '#C8F23C' : p < PW_HI ? '#FFB000' : '#FF2D2D');
const POLL_MS = 1200;

interface Props {
  matchId: string;
  side: 'a' | 'b';
  onClose: () => void;
}

/** The disc kind this side controls. */
const myKind = (side: 'a' | 'b'): Kind => (side === 'a' ? 'me' : 'cpu');

export function SoccerStarsMP({ matchId, side, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const bodies = useRef<Body[]>(formation());     // current rendered board
  const localSeq = useRef(0);                     // highest match.seq we've applied
  const animating = useRef(false);                // a shot/replay is playing out
  const drag = useRef<{ i: number; px: number; py: number } | null>(null);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const colorsRef = useRef<{ a: [string, string]; b: [string, string] }>({ a: ['#2BD4D4', '#0E3C7A'], b: ['#E8552B', '#111'] });
  const redrawRef = useRef<() => void>(() => {});

  const [match, setMatch] = useState<SoccerMatch | null>(null);
  const [myTurn, setMyTurn] = useState(false);
  const [flash, setFlash] = useState<'a' | 'b' | null>(null);   // goal celebration side
  const [busy, setBusy] = useState(false);                      // submitting a turn

  const oppSide = side === 'a' ? 'b' : 'a';
  const meName = match ? (side === 'a' ? match.a.name : match.b?.name) : 'You';
  const oppName = match ? (side === 'a' ? match.b?.name : match.a.name) : null;

  /* ---- world ⇄ screen ---- */
  const toScreen = (x: number, y: number) => {
    const { w, h } = sizeRef.current;
    return { sx: (x / W) * w, sy: (y / H) * h };
  };
  const toWorld = (sx: number, sy: number) => {
    const { w, h } = sizeRef.current;
    return { x: (sx / w) * W, y: (sy / h) * H };
  };

  /* ---- draw ---- */
  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // pitch
    ctx.fillStyle = '#0f3d23'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w / 2, h - 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, (40 / W) * w, 0, Math.PI * 2); ctx.stroke();
    // goal mouths (left/right)
    const gy0 = (GT / H) * h, gy1 = (GB / H) * h;
    ctx.strokeStyle = '#C8F23C'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(3, gy0); ctx.lineTo(3, gy1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 3, gy0); ctx.lineTo(w - 3, gy1); ctx.stroke();

    const cols = colorsRef.current;
    for (const b of bodies.current) {
      if (b.kind === 'ball') continue;
      const { sx, sy } = toScreen(b.x, b.y);
      const rr = (b.r / W) * w;
      const [c1, c2] = b.kind === 'me' ? cols.a : cols.b;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fillStyle = c1; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = c2; ctx.stroke();
      if (b.keeper) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, rr * 0.55, 0, Math.PI * 2); ctx.stroke(); }
    }
    // ball
    const ball = bodies.current[bodies.current.length - 1];
    const bp = toScreen(ball.x, ball.y);
    ctx.beginPath(); ctx.arc(bp.sx, bp.sy, (R_B / W) * w, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();

    // aim line while dragging
    if (drag.current) {
      const d = bodies.current[drag.current.i];
      const dw = toWorld(drag.current.px, drag.current.py);
      const v = pullToVelocity(d.x - dw.x, d.y - dw.y);
      const sp = Math.hypot(v.vx, v.vy);
      if (sp > 0) {
        const ds = toScreen(d.x, d.y);
        const len = (Math.min(Math.hypot(d.x - dw.x, d.y - dw.y), MAX_PULL) / MAX_PULL);
        const end = toScreen(d.x + (v.vx / sp) * 70 * len, d.y + (v.vy / sp) * 70 * len);
        ctx.strokeStyle = powerColor(len); ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ds.sx, ds.sy); ctx.lineTo(end.sx, end.sy); ctx.stroke();
      }
    }
  }, []);
  redrawRef.current = draw;

  /* ---- run the sim to rest, animating each frame; resolve when settled/scored ---- */
  const runSim = useCallback((onDone: (scored: Kind | null) => void) => {
    animating.current = true;
    let raf = 0;
    const tick = () => {
      const r = stepWorld(bodies.current);
      draw();
      if (r.scored || r.settled) {
        cancelAnimationFrame(raf);
        animating.current = false;
        onDone(r.scored);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }, [draw]);

  /* ---- apply a remote state (replay the opponent's shot, then snap) ---- */
  const applyMatch = useCallback((m: SoccerMatch) => {
    setMatch(m);
    if (m.b) colorsRef.current = {
      a: [NATION[m.a.nation]?.c1 || '#2BD4D4', NATION[m.a.nation]?.c2 || '#0E3C7A'],
      b: [NATION[m.b.nation]?.c1 || '#E8552B', NATION[m.b.nation]?.c2 || '#111'],
    };
    if (m.seq === localSeq.current || animating.current) {
      setMyTurn(m.status === 'active' && m.turn === side && !animating.current);
      draw();
      return;
    }
    const authoritative = m.bodies.length ? fromWire(m.bodies) : formation();
    const shot = m.lastShot;
    localSeq.current = m.seq;
    if (shot && shot.by === oppSide && bodies.current.length === authoritative.length) {
      // replay the opponent's shot from our pre-shot board, then snap to truth
      setMyTurn(false);
      const d = bodies.current[shot.disc];
      if (d) { d.vx = shot.vx; d.vy = shot.vy; }
      runSim((scored) => {
        if (scored) { setFlash(scored === 'me' ? 'a' : 'b'); window.setTimeout(() => setFlash(null), 1100); }
        bodies.current = authoritative;
        draw();
        setMyTurn(m.status === 'active' && m.turn === side);
      });
    } else {
      // our own echo, initial board, or a rematch reset — just snap
      bodies.current = authoritative;
      draw();
      setMyTurn(m.status === 'active' && m.turn === side);
    }
  }, [draw, oppSide, runSim, side]);

  /* ---- poll the match ---- */
  useEffect(() => {
    let alive = true;
    const pull = async () => { const m = await loadMatch(matchId); if (alive && m) applyMatch(m); };
    pull();
    const iv = setInterval(pull, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [matchId, applyMatch]);

  /* ---- canvas sizing ---- */
  useEffect(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const fit = () => {
      const cw = wrap.clientWidth;
      const ch = (cw / W) * H;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cw * dpr; cv.height = ch * dpr;
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      sizeRef.current = { w: cw, h: ch, dpr };
      draw();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [draw]);

  /* ---- leave: mark abandoned so the opponent isn't left hanging ---- */
  const leave = useCallback(() => { void abandonMatch(matchId, side); onClose(); }, [matchId, side, onClose]);

  /* ---- aiming (only on my turn, not mid-animation) ---- */
  const canShoot = myTurn && !animating.current && !busy;
  const ptDown = (e: React.PointerEvent) => {
    if (!canShoot) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const wpt = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const mine = myKind(side);
    let pick = -1, best = Infinity;
    bodies.current.forEach((b, i) => {
      if (b.kind !== mine) return;
      const dist = Math.hypot(b.x - wpt.x, b.y - wpt.y);
      if (dist < R_P * 1.6 && dist < best) { best = dist; pick = i; }
    });
    if (pick < 0) return;
    drag.current = { i: pick, px: e.clientX - rect.left, py: e.clientY - rect.top };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const ptMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = { ...drag.current, px: e.clientX - rect.left, py: e.clientY - rect.top };
    draw();
  };
  const ptUp = () => {
    const d = drag.current; drag.current = null;
    if (!d || !canShoot) { draw(); return; }
    const disc = bodies.current[d.i];
    const dw = toWorld(d.px, d.py);
    const v = pullToVelocity(disc.x - dw.x, disc.y - dw.y);
    if (!v.vx && !v.vy) { draw(); return; }
    disc.vx = v.vx; disc.vy = v.vy;
    const shot: LastShot = { by: side, disc: d.i, vx: v.vx, vy: v.vy };
    setMyTurn(false);
    runSim(async (scored) => {
      // score: 'me' goal = into right goal (a scores); 'cpu' goal = b scores
      const score = { ...(match?.score || { a: 0, b: 0 }) };
      let scoredSide: 'a' | 'b' | null = null;
      if (scored === 'me') { score.a++; scoredSide = 'a'; }
      else if (scored === 'cpu') { score.b++; scoredSide = 'b'; }
      if (scoredSide) { setFlash(scoredSide); window.setTimeout(() => setFlash(null), 1100); }
      // on a goal the board resets to a fresh formation (unless the game is won)
      const won = score.a >= WIN_GOALS || score.b >= WIN_GOALS;
      const finalBodies = scoredSide && !won ? formation() : bodies.current;
      bodies.current = finalBodies;
      draw();
      setBusy(true);
      const res = await submitTurn(matchId, localSeq.current, {
        bodies: toWire(finalBodies), lastShot: shot, score, scored: !!scoredSide,
      });
      setBusy(false);
      if (res) { localSeq.current = res.seq; applyMatch(res); }
      else { const m = await loadMatch(matchId); if (m) applyMatch(m); }   // lost the race — re-sync
    });
  };

  const rematch = async () => {
    const m = await requestRematch(matchId, side, toWire(formation()));
    if (m) { localSeq.current = m.seq - 1; applyMatch(m); }   // force re-apply of the reset board
  };

  /* ---- HUD ---- */
  const status = match?.status;
  const sa = match?.score.a ?? 0, sb = match?.score.b ?? 0;
  const myScore = side === 'a' ? sa : sb, oppScore = side === 'a' ? sb : sa;
  const iWon = status === 'over' && match?.winner === side;
  const banner =
    status === 'waiting' ? `Waiting for ${oppName || 'your opponent'} to join…`
    : status === 'abandoned' ? `${oppName || 'Opponent'} left — you win by default`
    : status === 'over' ? (iWon ? 'You win! 🏆' : `${oppName} wins`)
    : myTurn ? 'Your shot — pull back a disc and fire'
    : `Waiting for ${oppName || 'opponent'} to shoot…`;

  return (
    <div className="pen-overlay" style={{ position: 'fixed', inset: 0, background: '#0a0f0c', display: 'flex', flexDirection: 'column', zIndex: 60 }}>
      <div className="between" style={{ padding: '12px 16px', color: '#fff' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontWeight: 800 }}>
          <span>{meName} <span style={{ color: '#C8F23C' }}>{myScore}</span></span>
          <span style={{ opacity: .6 }}>vs</span>
          <span><span style={{ color: '#FFB000' }}>{oppScore}</span> {oppName || '…'}</span>
        </div>
        <button className="hdr-btn" onClick={leave} style={{ border: '1.5px solid rgba(255,255,255,.3)', color: '#fff' }}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ textAlign: 'center', color: myTurn ? '#C8F23C' : '#9C988C', fontSize: 13, fontWeight: 700, padding: '0 16px 8px', minHeight: 18 }}>
        {flash ? <span style={{ color: '#C8F23C', fontSize: 18 }}>GOAL!</span> : banner}
      </div>

      <div ref={wrapRef} style={{ padding: '0 12px', flex: 1, display: 'grid', placeItems: 'center' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={ptDown} onPointerMove={ptMove} onPointerUp={ptUp} onPointerCancel={ptUp}
          style={{ borderRadius: 12, touchAction: 'none', maxWidth: '100%', boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}
        />
      </div>

      <div style={{ padding: '12px 16px 22px', display: 'grid', gap: 10 }}>
        {(status === 'over' || status === 'abandoned') && (
          <div style={{ display: 'flex', gap: 10 }}>
            {status === 'over' && <button className="btn btn-lime btn-block" onClick={rematch}>{match?.rematch[oppSide] ? 'Accept rematch' : 'Rematch'}</button>}
            <button className="btn btn-block" onClick={onClose}>Leave</button>
          </div>
        )}
      </div>
    </div>
  );
}
