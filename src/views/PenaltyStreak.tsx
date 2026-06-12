/* ============================================================
   PENALTY STREAK — React wrapper around the ported 3D game.
   Renders the #stage/#draw/#cards/#hud scaffold the vanilla
   controller drives, then mounts/tears it down with the view.
   The game itself (draw-to-shoot, curl, flick power, misses,
   random keeper dives, streak) lives in src/game/penaltyStreak.js
   over the Three.js scene in src/game/penaltyScene.js.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { initPenaltyStreak } from '../game/penaltyStreak.js';

interface Props { onClose: () => void; onScore?: (streak: number) => void; mode?: 'streak' | 'timed'; seconds?: number; }

export function PenaltyStreak({ onClose, onScore, mode = 'streak', seconds = 30 }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  // keep the latest callbacks without re-initialising the scene each render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const scoreRef = useRef(onScore);
  scoreRef.current = onScore;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dispose = initPenaltyStreak(root, {
      onClose: () => closeRef.current(),
      onScore: (s) => scoreRef.current && scoreRef.current(s),
      mode, seconds,
    });
    return () => dispose();
    // mode/seconds are fixed for a given launch; callbacks are read via refs so
    // the heavy scene mounts once per launch and never re-inits mid-game.
  }, [mode, seconds]);

  return (
    <div className="pen-overlay" ref={rootRef}>
      <div id="stage" />
      <canvas id="draw" className="off" />
      <div id="cards" />
      <div id="hud" className="pen-hud" />
    </div>
  );
}
