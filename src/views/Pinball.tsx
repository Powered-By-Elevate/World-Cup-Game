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
  const plunge = (down: boolean) => (e: React.PointerEvent) => {
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

  return (
    <div className="pin-overlay">
      <div className="pin-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="pin-canvas" />

        {/* broadcast HUD */}
        {status === 'playing' && snap && (
          <div className="pin-hud">
            <div className="pin-hud-row">
              <div className="pin-stat"><span className="pl">SCORE</span><b>{fmt(snap.score)}</b></div>
              <div className="pin-stat r"><span className="pl">HIGH</span><b>{fmt(snap.high)}</b></div>
            </div>
            <div className="pin-hud-row sub">
              <span className="pin-chip">⚽ Ball {snap.ball}/{snap.balls}</span>
              <span className="pin-chip gold">×{snap.multiplier}</span>
              <span className="pin-chip">🏅 {snap.rank}</span>
              {snap.locks > 0 && <span className="pin-chip gold">LOCK {snap.locks}/2</span>}
              {snap.ballSave && <span className="pin-chip lime">SHOOT AGAIN</span>}
              {snap.kickback && <span className="pin-chip lime">KICKBACK</span>}
              {snap.inMultiball && <span className="pin-chip red">MULTIBALL</span>}
            </div>
            <div className="pin-mission">
              <span className="pl">{snap.missionActive ? 'MISSION' : 'NEXT'}</span>
              <b>{snap.mission}</b>
              <span className="pin-mhint">{snap.missionActive ? `${snap.missionDone}/${snap.missionNeed} · ${snap.missionHint}` : snap.missionHint}</span>
            </div>
          </div>
        )}

        {/* top-right controls */}
        <div className="pin-topbtns">
          {status === 'playing' && <button className="pin-ibtn" onClick={togglePause} aria-label="Pause">{paused ? '▶' : '⏸'}</button>}
          <button className="pin-ibtn" onClick={toggleMute} aria-label="Mute">{muted ? '🔇' : '🔊'}</button>
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

        {/* hold-to-kick-off button: prominent while a ball waits on the plunger,
            then fades translucent + out of the way once you've launched */}
        {status === 'playing' && !paused && (
          <button className={'pin-kickoff' + (launched ? ' spent' : '')}
            onPointerDown={plunge(true)} onPointerUp={plunge(false)} onPointerCancel={plunge(false)}>
            <span className="kc-lbl">{launched ? 'LAUNCHED' : 'HOLD TO KICK OFF'}</span>
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
    </div>
  );
}
