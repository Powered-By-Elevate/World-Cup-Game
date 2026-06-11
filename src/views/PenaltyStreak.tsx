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

interface Props { onClose: () => void; }

export function PenaltyStreak({ onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  // keep the latest onClose without re-initialising the scene each render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dispose = initPenaltyStreak(root, { onClose: () => closeRef.current() });
    return () => dispose();
    // mount once — the scene is heavy; onClose is read via closeRef so [] is correct
  }, []);

  return (
    <div className="pen-overlay" ref={rootRef}>
      <div id="stage" />
      <canvas id="draw" className="off" />
      <div id="cards" />
      <div id="hud" className="pen-hud" />
    </div>
  );
}
