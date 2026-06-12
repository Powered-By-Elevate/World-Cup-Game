/* ============================================================
   SOCCER STARS — LIVE multiplayer match (turn-based, first to 3).

   Two players share one authoritative match (utils/soccerMatch) polled ~1.2s.
   On YOUR turn you pull back a disc and fire; the shot is simulated locally with
   the deterministic engine (game/soccerSim), the resting board is written as the
   source of truth, and the opponent REPLAYS your shot (same engine, same impulse)
   then snaps to your authoritative board. Side 'a' defends the left goal and
   plays the left ('me') discs; side 'b' the right ('cpu') discs. Same board
   orientation for both, which is what keeps the replay deterministic.

   Presentation = the single-player "Arcade chip" design, verbatim: this view
   re-uses the LOCKED draw helpers exported by views/SoccerStars.tsx (poker-chip
   flag discs, stadium bokeh, redline aim, GOAL moment, end card, rotate gate),
   so a live match looks identical to the game the family already knows. Each
   player's pucks carry their OWN drafted nation (the App de-dupes nations when
   both players run the same team). The challenger waits in a spinner lobby that
   can be backed out of at any time (cancelling the invite).
   ============================================================ */
import { useRef, useEffect, useState, useCallback } from 'react';
import { NATION } from '../data/nations';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import {
  buildBokeh, buildConfetti, drawPitch, drawGoal, drawHalo, drawChip, drawBall, drawAim,
  POT_COLOR, levelOf,
} from './SoccerStars';
import {
  W, H, formation, stepWorld, pullToVelocity,
  toWire, fromWire, type Body, type Kind,
} from '../game/soccerSim';
import {
  loadMatch, submitTurn, requestRematch, abandonMatch, declineMatch, WIN_GOALS,
  type SoccerMatch, type LastShot,
} from '../utils/soccerMatch';

const POLL_MS = 1200;

interface Props {
  matchId: string;
  side: 'a' | 'b';
  /** Who we're playing (the App knows it before the match record has them seated). */
  oppName?: string;
  onClose: () => void;
}

/** The disc kind this side controls ('me' = left/A discs, 'cpu' = right/B discs). */
const myKind = (side: 'a' | 'b'): Kind => (side === 'a' ? 'me' : 'cpu');

interface Pal { meColor: string; meAlt: string; cpuColor: string; cpuAlt: string; meId: string; cpuId: string; }

export function SoccerStarsMP({ matchId, side, oppName: oppHint, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // simulation lives in refs (no re-render per frame); React state is HUD only.
  const bodies = useRef<Body[]>(formation());
  const localSeq = useRef(0);                     // highest match.seq we've applied
  const sim = useRef<{ running: boolean; onDone: ((scored: Kind | null) => void) | null }>({ running: false, onDone: null });
  const drag = useRef<{ i: number; px: number; py: number } | null>(null);   // world coords
  const busy = useRef(false);                     // a turn submit is in flight
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const matchRef = useRef<SoccerMatch | null>(null);
  const palRef = useRef<Pal>({ meColor: '#2BD4D4', meAlt: '#0E3C7A', cpuColor: '#E8552B', cpuAlt: '#111', meId: '', cpuId: '' });
  const imgs = useRef<{ key: string; me: HTMLImageElement | null; cpu: HTMLImageElement | null }>({ key: '', me: null, cpu: null });

  const [match, setMatch] = useState<SoccerMatch | null>(null);
  const [myTurn, setMyTurn] = useState(false);
  const [celebrate, setCelebrate] = useState<'a' | 'b' | null>(null);   // which SIDE scored
  const [inPlay, setInPlay] = useState(false);                          // a shot/replay is animating (HUD copy)

  // decorative one-time visuals (same builders as single player)
  const [bokeh] = useState(buildBokeh);
  const [confetti] = useState(buildConfetti);

  // landscape-only on touch devices: portrait shows a "rotate your phone" gate
  const [portrait, setPortrait] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    const fn = (e: MediaQueryListEvent) => setPortrait(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const oppSide = side === 'a' ? 'b' : 'a';
  const meP = match ? (side === 'a' ? match.a : match.b) : null;
  const oppP = match ? (side === 'a' ? match.b : match.a) : null;
  const oppName = oppP?.name || match?.invitee?.name || oppHint || 'your opponent';

  /* ---- flag images for the chips (re-keyed if a nation ever changes) ---- */
  const ensureImgs = (m: SoccerMatch) => {
    const key = `${m.a.nation}|${m.b?.nation || ''}`;
    if (imgs.current.key === key) return;
    const load = (nation: string | undefined) => {
      const flag = nation ? NATION[nation]?.flag : undefined;
      if (!flag) return null;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `https://flagcdn.com/w160/${flag}.png`;
      return img;
    };
    imgs.current = { key, me: load(m.a.nation), cpu: load(m.b?.nation) };
  };

  /* ---- run the sim to rest (the rAF loop steps it); resolve when settled/scored ---- */
  const runSim = useCallback((onDone: (scored: Kind | null) => void) => {
    sim.current = { running: true, onDone };
    setInPlay(true);
  }, []);

  /* ---- apply a remote state (replay the opponent's shot, then snap) ---- */
  const applyMatch = useCallback((m: SoccerMatch) => {
    matchRef.current = m;
    setMatch(m);
    palRef.current = {
      meColor: NATION[m.a.nation]?.c1 || '#2BD4D4', meAlt: NATION[m.a.nation]?.c2 || '#0E3C7A',
      cpuColor: (m.b && NATION[m.b.nation]?.c1) || '#E8552B', cpuAlt: (m.b && NATION[m.b.nation]?.c2) || '#111',
      meId: m.a.nation, cpuId: m.b?.nation || '',
    };
    ensureImgs(m);
    if (m.seq === localSeq.current || sim.current.running) {
      setMyTurn(m.status === 'active' && m.turn === side && !sim.current.running);
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
        setInPlay(false);
        if (scored) {
          const sc = scored === 'me' ? 'a' : 'b';
          setCelebrate(sc); window.setTimeout(() => setCelebrate(null), 1250);
        }
        bodies.current = authoritative;
        setMyTurn(m.status === 'active' && m.turn === side);
      });
    } else {
      // our own echo, initial board, or a rematch reset — just snap
      bodies.current = authoritative;
      setMyTurn(m.status === 'active' && m.turn === side);
    }
  }, [oppSide, runSim, side]);

  /* ---- poll the match ---- */
  useEffect(() => {
    let alive = true;
    const pull = async () => { const m = await loadMatch(matchId); if (alive && m) applyMatch(m); };
    pull();
    const iv = setInterval(pull, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [matchId, applyMatch]);

  /* ---- render + main loop (sizing + draw every frame, like single player) ---- */
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
      if (sim.current.running) {
        const r = stepWorld(bodies.current);
        if (r.scored || r.settled) {
          sim.current.running = false;
          const cb = sim.current.onDone; sim.current.onDone = null;
          cb?.(r.scored);
        }
      }
      // draw (identical dressing to single player via the shared helpers)
      const { w, dpr } = sizeRef.current;
      const s = w / W;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawPitch(ctx);
      drawGoal(ctx, 7, true); drawGoal(ctx, W - 7, false);
      const m = matchRef.current;
      const activeKind: Kind | null =
        m && m.status === 'active' && !sim.current.running ? (m.turn === 'a' ? 'me' : 'cpu') : null;
      const pal = palRef.current;
      const bs = bodies.current;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (b.kind === 'ball') continue;
        const mine = b.kind === 'me';
        drawHalo(ctx, b, b.kind === activeKind, t);
        drawChip(ctx, b, mine ? imgs.current.me : imgs.current.cpu,
          mine ? pal.meColor : pal.cpuColor, mine ? pal.meAlt : pal.cpuAlt,
          mine ? pal.meId : pal.cpuId, drag.current?.i === i);
      }
      drawBall(ctx, bs[bs.length - 1]);
      if (drag.current) drawAim(ctx, bs[drag.current.i], drag.current);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  /* ---- leave: cancel a pending invite, or concede an active match ---- */
  const leave = useCallback(() => {
    const st = matchRef.current?.status;
    if (st === 'waiting') void declineMatch(matchId);
    else if (st === 'active') void abandonMatch(matchId, side);
    onClose();
  }, [matchId, side, onClose]);

  /* ---- pointer (pull-back aim, world coords — same feel as single player) ---- */
  const toWorld = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  const canShoot = () => {
    const m = matchRef.current;
    return !!m && m.status === 'active' && m.turn === side && !sim.current.running && !busy.current;
  };
  const onDown = (e: React.PointerEvent) => {
    if (!canShoot()) return;
    const p = toWorld(e);
    const bs = bodies.current;
    const mine = myKind(side);
    let pick = -1, bd = 1e9;
    for (let i = 0; i < bs.length; i++) {
      if (bs[i].kind !== mine) continue;
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
    if (!d || !canShoot()) return;
    const disc = bodies.current[d.i];
    const v = pullToVelocity(disc.x - d.px, disc.y - d.py);
    if (!v.vx && !v.vy) return;                            // a tap, not a shot
    disc.vx = v.vx; disc.vy = v.vy;
    const shot: LastShot = { by: side, disc: d.i, vx: v.vx, vy: v.vy };
    setMyTurn(false);
    runSim(async (scored) => {
      setInPlay(false);
      // score in board orientation: 'me' goal = into the right goal → side A scores
      const score = { ...(matchRef.current?.score || { a: 0, b: 0 }) };
      let scoredSide: 'a' | 'b' | null = null;
      if (scored === 'me') { score.a++; scoredSide = 'a'; }
      else if (scored === 'cpu') { score.b++; scoredSide = 'b'; }
      if (scoredSide) { setCelebrate(scoredSide); window.setTimeout(() => setCelebrate(null), 1250); }
      // on a goal the board resets to a fresh formation (unless the game is won)
      const won = score.a >= WIN_GOALS || score.b >= WIN_GOALS;
      const finalBodies = scoredSide && !won ? formation() : bodies.current;
      bodies.current = finalBodies;
      busy.current = true;
      const res = await submitTurn(matchId, localSeq.current, {
        bodies: toWire(finalBodies), lastShot: shot, score, scored: !!scoredSide,
      });
      busy.current = false;
      if (res) { localSeq.current = res.seq; applyMatch(res); }
      else { const m = await loadMatch(matchId); if (m) applyMatch(m); }   // lost the race — re-sync
    });
  };

  const rematch = async () => {
    const m = await requestRematch(matchId, side, toWire(formation()));
    if (m) { localSeq.current = m.seq - 1; applyMatch(m); }   // force re-apply of the reset board
  };

  /* ---- HUD derived ---- */
  const status = match?.status;
  const sa = match?.score.a ?? 0, sb = match?.score.b ?? 0;
  const iWon = (status === 'over' || status === 'abandoned') && match?.winner === side;
  const aNat = match ? NATION[match.a.nation] : null;
  const bNat = match?.b ? NATION[match.b.nation] : null;
  const turnSide = match?.turn;

  const tokLabel =
    status === 'waiting' ? 'Waiting…'
    : status === 'over' || status === 'abandoned' ? 'Full time'
    : inPlay ? 'In play'
    : myTurn ? 'Your turn'
    : `${oppName}'s turn`;
  const hint =
    inPlay ? 'Watch it play out…'
    : myTurn ? 'Pull back & release to shoot'
    : `${oppName} is lining one up…`;

  // a player card for the HUD (pot-ring avatar + level + name) — single-player markup
  const Pcard = (o: { side: 'left' | 'right'; on: boolean; dim: boolean; flagId: string; ring: string; name: string; sub: string; lv: number }) => (
    <div className={`ss-pcard ${o.side === 'right' ? 'right' : ''} ${o.dim ? 'dim' : ''} ${o.on ? 'on' : ''}`}>
      <div className="ss-avatar" style={{ ['--pot' as string]: o.ring }}>
        <span className="ss-ring" />
        <span className="ss-face">{o.flagId ? <Flag id={o.flagId} size={31} ring="ink" shine={false} /> : <span style={{ fontSize: 18 }}>⚽</span>}</span>
        <span className="ss-lv">LV {o.lv}</span>
      </div>
      <div className="ss-pmeta">
        <div className="ss-pname">{o.name}</div>
        <div className="ss-psub">{o.sub}</div>
      </div>
    </div>
  );

  const scorerName = celebrate === 'a' ? (aNat?.name || match?.a.name) : (bNat?.name || match?.b?.name);
  const meIsLeft = side === 'a';
  const winnerName = match?.winner === 'a' ? match?.a.name : match?.b?.name;
  const winnerNation = match?.winner === 'a' ? match?.a.nation : match?.b?.nation;

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

      <button className="ss-close" onClick={leave} aria-label="Close"><Icon name="x" size={16} /></button>

      {/* ===== HUD — challenger (A) on the left, opponent (B) on the right ===== */}
      <div className="ss-hud">
        {Pcard({
          side: 'left', on: status === 'active' && turnSide === 'a', dim: status === 'active' && turnSide === 'b',
          flagId: match?.a.nation || '', ring: POT_COLOR[aNat?.pot || 'FAV'] || '#FFB000',
          name: match?.a.name || '…', sub: `${meIsLeft ? 'You' : 'Live'} · ${aNat?.name || ''}`, lv: levelOf(match?.a.name || 'A'),
        })}
        <div className="ss-board">
          <div className="ss-score"><b>{sa}</b><span className="sep">–</span><b>{sb}</b></div>
          <div className="ss-tok"><span className="dot" />{tokLabel}</div>
        </div>
        {Pcard({
          side: 'right', on: status === 'active' && turnSide === 'b', dim: status === 'active' && turnSide === 'a',
          flagId: match?.b?.nation || '', ring: POT_COLOR[bNat?.pot || 'UND'] || '#07C2C7',
          name: match?.b?.name || oppName, sub: match?.b ? `${meIsLeft ? 'Live' : 'You'} · ${bNat?.name || ''}` : 'Joining…', lv: levelOf(match?.b?.name || oppName),
        })}
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
      {status === 'active' && (
        <div className="ss-turnhint" data-on={myTurn ? 'true' : 'false'}>
          <span className="pin" />{hint}
        </div>
      )}

      {/* ===== goal celebration ===== */}
      <div className={`ss-goalmoment ${celebrate ? 'show' : ''} ${celebrate && celebrate !== side ? 'cpu' : ''}`} aria-hidden="true">
        <div className="flash" />
        <div className="shock" />
        {celebrate === side && (
          <div className="confetti">
            {confetti.map((c, i) => (
              <i key={i} style={{ left: `${c.left}%`, background: c.bg, ['--d' as string]: `${c.d}s`, ['--delay' as string]: `${c.delay}s`, transform: `rotate(${c.rot}deg)` }} />
            ))}
          </div>
        )}
        <div className="word display">{celebrate === side ? 'Goal!' : 'Goal'}</div>
        <div className="sub eyebrow">{scorerName || ''} strikes</div>
      </div>

      {/* ===== waiting lobby: spinner until the opponent joins, cancel any time ===== */}
      {status === 'waiting' && (
        <div className="ss-endcard show">
          <div className="ec-dim" />
          <div className="ec-panel">
            <div className="ec-eyebrow eyebrow">Live match</div>
            <span className="ss-spinner" aria-hidden="true" />
            <div className="ec-headline display" style={{ fontSize: 26, whiteSpace: 'normal' }}>Waiting on {oppName}</div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(244,238,225,.65)' }}>
              They've been sent a notification — one tap drops them straight in here.
            </p>
            <div className="ec-actions">
              <button className="ec-btn ghost" onClick={leave}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== full-time / abandoned / cancelled card ===== */}
      {(status === 'over' || status === 'abandoned' || status === 'declined') && (
        <div className="ss-endcard show">
          <div className="ec-dim" />
          <div className="ec-panel">
            <div className="ec-eyebrow eyebrow">{status === 'over' ? 'Full time' : status === 'abandoned' ? 'Match over' : 'Live match'}</div>
            {status === 'declined' ? (
              <>
                <div className="ec-headline display" style={{ fontSize: 28, whiteSpace: 'normal' }}>Match cancelled</div>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(244,238,225,.65)' }}>This live invite is no longer open.</p>
              </>
            ) : (
              <>
                <div className="ss-ecdisc"><Flag id={(iWon ? meP?.nation : winnerNation) || winnerNation || 'BRA'} size={84} ring="pot" /></div>
                <div className="ec-headline display">{iWon ? 'You win!' : `${winnerName || oppName} wins`}</div>
                <div className="ec-score">{sa} – {sb}</div>
                {status === 'abandoned' && (
                  <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(244,238,225,.65)' }}>
                    {iWon ? `${oppName} left — you win by default.` : 'You left the match.'}
                  </p>
                )}
              </>
            )}
            <div className="ec-actions">
              <button className="ec-btn ghost" onClick={onClose}>Leave</button>
              {status === 'over' && (
                <button className="ec-btn primary" onClick={rematch}>
                  {match?.rematch[oppSide] ? 'Accept rematch' : match?.rematch[side] ? 'Waiting…' : 'Rematch'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== portrait gate: rotate to landscape to play ===== */}
      {portrait && (
        <div className="ss-rotate">
          <div>
            <svg className="ph" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect x="22" y="10" width="20" height="38" rx="4" stroke="currentColor" strokeWidth="3" />
              <line x1="28" y1="43" x2="36" y2="43" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M50 24 A 22 22 0 0 1 50 44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M46 40 L50 46 L55 41" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="display" style={{ fontSize: 30, color: '#F4EEE1' }}>Rotate your phone</div>
            <div className="eyebrow" style={{ fontSize: 9.5, color: 'rgba(244,238,225,.6)', marginTop: 10 }}>Soccer Stars plays in landscape</div>
          </div>
        </div>
      )}
    </div>
  );
}
