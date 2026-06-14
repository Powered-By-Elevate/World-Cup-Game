/* ============================================================
   WORLD CUP PINBALL — React shell. Owns the responsive portrait canvas,
   multi-touch input (left/right flipper zones + a hold-to-charge plunger),
   the broadcast HUD, and the start / pause / full-time overlays. The game
   itself (physics, scoring, ranks, missions, multiball) lives in the
   src/game/pinball engine, which draws straight to the canvas.
   ============================================================ */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../components/Icon';
import { createPinball, type PinballControls } from '../game/pinball/engine';
import { createAudio, type PinAudio } from '../game/pinball/audio';
import type { Snapshot } from '../game/pinball/types';

interface Props { onClose: () => void; onScore?: (score: number) => void; }

const fmt = (n: number) => n.toLocaleString('en-US');

export function Pinball({ onClose, onScore }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<PinballControls | null>(null);
  const audioRef = useRef<PinAudio | null>(null);
  const scoredRef = useRef(false);

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  // ---- mount the engine once ----
  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const audio = createAudio(); audioRef.current = audio;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(wrap);

    const ctrl = createPinball(canvas, {
      play: (n) => audio.play(n),
      onState: (s) => setSnap(s),
      onGameEnd: (score) => { if (!scoredRef.current) { scoredRef.current = true; onScore?.(score); } },
    });
    ctrlRef.current = ctrl;

    // ---- keyboard (desktop) ----
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') { e.preventDefault(); ctrl.pressFlipper('L', true); }
      else if (k === 'arrowright' || k === 'd') { e.preventDefault(); ctrl.pressFlipper('R', true); }
      else if (k === ' ') { e.preventDefault(); audio.resume(); ctrl.plunger(true); }
      else if (k === 'p') togglePause();
      else if (k === 'm') toggleMute();
      else if (k === 'r') { scoredRef.current = false; ctrl.start(); }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') ctrl.pressFlipper('L', false);
      else if (k === 'arrowright' || k === 'd') ctrl.pressFlipper('R', false);
      else if (k === ' ') ctrl.plunger(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      ro.disconnect(); ctrl.destroy(); audio.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = () => audioRef.current?.resume();

  const flip = (side: 'L' | 'R', down: boolean) => (e: React.PointerEvent) => {
    e.preventDefault(); resume();
    if (down) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    ctrlRef.current?.pressFlipper(side, down);
  };
  // KICKOFF: press & hold to load power, release to kick the ball into play.
  const hold = (down: boolean) => (e: React.PointerEvent) => {
    e.preventDefault(); resume();
    if (down) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    ctrlRef.current?.plunger(down);
  };

  const startGame = useCallback(() => { resume(); scoredRef.current = false; ctrlRef.current?.start(); setPaused(false); }, []);
  const togglePause = useCallback(() => { ctrlRef.current?.togglePause(); setPaused(p => !p); }, []);
  const toggleMute = useCallback(() => setMuted(m => { const n = !m; audioRef.current?.setMuted(n); return n; }), []);

  const status = snap?.status ?? 'attract';
  // a ball is in play (kicked off) → the left/right screen-half flip taps are armed
  const launched = status === 'playing' && !paused && snap?.awaitingLaunch === false;

  // ---- backbox DMD readout (mirrors the Space-Cadet machine scoreboard) ----
  const playing = status === 'playing';
  const dmdMission = playing && snap
    ? (snap.missionActive
        ? `▸ ${snap.mission} — ${snap.missionDone}/${snap.missionNeed} · ${snap.missionHint}`
        : `NEXT ▸ ${snap.mission} · ${snap.missionHint}`)
    : 'PRESS KICK OFF ▸ HOLD LAUNCH TO SHOOT';

  return (
    <div className="pin-overlay">
      <div className="pin-cabinet">

        {/* BACKBOX — gold cup, title, color strip, DMD scoreboard */}
        <div className="pin-backbox">
          <div className="pin-flood pin-flood-l" /><div className="pin-flood pin-flood-r" />
          <div className="bb-title">
            <svg className="bb-trophy" viewBox="0 0 28 30" aria-hidden="true">
              <defs><linearGradient id="pinGoldG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffe69a" /><stop offset=".5" stopColor="#ffc400" /><stop offset="1" stopColor="#a87600" />
              </linearGradient></defs>
              <g fill="url(#pinGoldG)" stroke="#8a6200" strokeWidth=".6">
                <path d="M8 3 h12 v6.5 a6 6 0 0 1 -12 0 z" />
                <path d="M8 4.5 h-3.2 a3 3 0 0 0 0 6 h1.4" fill="none" stroke="#e8af14" strokeWidth="1.5" />
                <path d="M20 4.5 h3.2 a3 3 0 0 1 0 6 h-1.4" fill="none" stroke="#e8af14" strokeWidth="1.5" />
                <rect x="12.6" y="15" width="2.8" height="5" />
                <path d="M9 20 h10 l-1.6 4 h-6.8 z" /><rect x="7" y="24" width="14" height="2.6" rx="1.2" />
              </g>
            </svg>
            <span className="bb-badge">26</span> WORLD CUP <b>PINBALL</b>
          </div>
          <div className="bb-strip" />
          <div className="pin-dmd">
            <div className="dmd-glass">
              <div className="dmd-row">
                <div className="dmd-lbl">SCORE</div>
                <div className="dmd-score">{fmt(snap?.score ?? 0)}</div>
              </div>
              <div className="dmd-mid">
                <span className="dmd-tag">BALL <b>{snap?.ball ?? 1}</b>/{snap?.balls ?? 3}</span>
                <span className="dmd-tag gold">×<b>{snap?.multiplier ?? 1}</b></span>
                <span className="dmd-tag">{snap?.rank ?? 'Debut'}</span>
                <span className="dmd-tag dim">HIGH <b>{fmt(snap?.high ?? 0)}</b></span>
                {playing && snap && (<>
                  {snap.locks > 0 && <span className="dmd-tag gold">LOCK <b>{snap.locks}</b>/2</span>}
                  {snap.ballSave && <span className="dmd-tag lime">SHOOT AGAIN</span>}
                  {snap.kickback && <span className="dmd-tag lime">KICKBACK</span>}
                  {snap.inMultiball && <span className="dmd-tag red">MULTIBALL</span>}
                </>)}
              </div>
              <div className="dmd-mission">{dmdMission}</div>
            </div>
          </div>
        </div>

        {/* PLAYFIELD STAGE — the tilted 2.5D canvas + flat overlays */}
        <div className="pin-stage" ref={wrapRef}>
          <canvas ref={canvasRef} className="pin-canvas" />

        {/* top-right controls */}
        <div className="pin-topbtns">
          {status === 'playing' && <button className="pin-ibtn" onClick={togglePause} aria-label="Pause">{paused ? '▶' : '⏸'}</button>}
          <button className="pin-ibtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        {/* touch zones: tap the LEFT / RIGHT half of the whole screen to flip —
            only armed once the ball is launched. The plunger gets the taps while
            you're still waiting to kick off. */}
        {status === 'playing' && !paused && (
          <div className="pin-zones" data-armed={launched ? 'true' : 'false'}>
            <div className="pin-flipzone left"
              onPointerDown={launched ? flip('L', true) : undefined}
              onPointerUp={flip('L', false)} onPointerCancel={flip('L', false)} onPointerLeave={flip('L', false)}>
              {launched && <span className="pin-zhint">◀</span>}
            </div>
            <div className="pin-flipzone right"
              onPointerDown={launched ? flip('R', true) : undefined}
              onPointerUp={flip('R', false)} onPointerCancel={flip('R', false)} onPointerLeave={flip('R', false)}>
              {launched && <span className="pin-zhint">▶</span>}
            </div>
          </div>
        )}

        {/* LAUNCH plunger (right side): press & hold to load power, release to
            fire the ball up the right lane. Fades away once the ball's in play. */}
        {status === 'playing' && !paused && (
          <button className={'pin-kickoff' + (launched ? ' spent' : '')}
            onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)}>
            <span className="kc-title">LAUNCH</span>
            <span className="kc-sub">hold &amp; release</span>
            <span className="kc-bar"><i style={{ width: `${(snap?.charge ?? 0) * 100}%` }} /></span>
          </button>
        )}

        {/* attract / start */}
        {status === 'attract' && (
          <div className="pin-screen">
            <div className="pin-card">
              <div className="eyebrow">Arcade · World Cup 2026</div>
              <div className="pin-title display">WORLD CUP<br />PINBALL</div>
              <p className="pin-blurb">Space-Cadet pinball, World-Cup dressed. Work the bumpers, shoot the goal, lock the ball for <b>Trophy-Lift Multiball</b> and climb from Debut to <b>G.O.A.T.</b></p>
              <div className="pin-controls-help">
                <div><b>Phone</b> — tap the left/right sides to flip · hold <b>LAUNCH</b> to shoot</div>
                <div><b>Keys</b> — ◀ ▶ / A D flip · Space launch · P pause · M mute</div>
              </div>
              <button className="pin-play" onClick={startGame}>▶ Kick Off</button>
            </div>
          </div>
        )}

        {/* paused */}
        {status === 'playing' && paused && (
          <div className="pin-screen">
            <div className="pin-card">
              <div className="pin-title display" style={{ fontSize: 40 }}>PAUSED</div>
              <button className="pin-play" onClick={togglePause}>Resume</button>
              <button className="pin-leave" onClick={onClose}>Leave</button>
            </div>
          </div>
        )}

        {/* full time */}
        {status === 'over' && snap && (
          <div className="pin-screen">
            <div className="pin-card">
              <div className="eyebrow">Full time</div>
              <div className="pin-title display" style={{ fontSize: 34 }}>{snap.score >= snap.high ? 'NEW HIGH SCORE!' : 'FULL TIME'}</div>
              <div className="pin-final">{fmt(snap.score)}</div>
              <div className="pin-controls-help"><div>🏅 Reached <b>{snap.rank}</b> · High {fmt(snap.high)}</div></div>
              <button className="pin-play" onClick={startGame}>Play again</button>
              <button className="pin-leave" onClick={onClose}>Leave</button>
            </div>
          </div>
        )}
        </div>

        {/* LOCKDOWN BAR — flipper buttons + sound, like the real machine apron */}
        <div className="pin-lockbar">
          <button className="lb-btn"
            onPointerDown={flip('L', true)} onPointerUp={flip('L', false)}
            onPointerCancel={flip('L', false)} onPointerLeave={flip('L', false)}>◀ FLIP</button>
          <button className="lb-mid" onClick={toggleMute} aria-label="Sound">{muted ? '🔇' : '🔊'}</button>
          <button className="lb-btn"
            onPointerDown={flip('R', true)} onPointerUp={flip('R', false)}
            onPointerCancel={flip('R', false)} onPointerLeave={flip('R', false)}>FLIP ▶</button>
        </div>

      </div>
    </div>
  );
}
