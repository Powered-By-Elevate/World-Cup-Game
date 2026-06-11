/* ============================================================
   ARCADE — the minigames hub. One tab that gathers the family's
   between-match games: Penalty Streak (3D draw-to-shoot), Soccer
   Stars (table-soccer), and Daily Calls (Call of the Day board).
   The two action games open as full-screen overlays (handled by
   App); Daily Calls renders inline with a back button.
   ============================================================ */
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Icon } from '../components/Icon';
import { CallersBoard } from './CallOfDay';

type CallsProps = ComponentProps<typeof CallersBoard>;

interface Props extends CallsProps {
  onPlaySoccer: () => void;
  onPlayPenalty: () => void;
}

export function Arcade({ onPlaySoccer, onPlayPenalty, ...calls }: Props) {
  const [view, setView] = useState<'hub' | 'calls'>('hub');

  if (view === 'calls') {
    return (
      <div className="content">
        <button className="btn btn-sm" style={{ marginBottom: 14 }} onClick={() => setView('hub')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={14} /></span> Arcade
        </button>
        <CallersBoard {...calls} />
      </div>
    );
  }

  return (
    <div className="content">
      <div className="sec-head">
        <span className="eyebrow">🕹 Arcade</span>
        <span className="muted" style={{ fontSize: 12 }}>Family minigames</span>
      </div>

      <div className="arcade-grid">
        <button className="arcade-tile pen" onClick={onPlayPenalty}>
          <span className="at-art" aria-hidden="true">🥅</span>
          <span className="at-meta">
            <span className="at-name display">Penalty Streak</span>
            <span className="at-sub">Draw your shot — bend it, flick it, beat the keeper. How many in a row?</span>
          </span>
          <span className="at-go">Play <Icon name="chevron" size={14} /></span>
        </button>

        <button className="arcade-tile soc" onClick={onPlaySoccer}>
          <span className="at-art" aria-hidden="true">⚽</span>
          <span className="at-meta">
            <span className="at-name display">Soccer Stars</span>
            <span className="at-sub">Flick-physics table soccer — your nation's flag discs vs a random rival. First to 3.</span>
          </span>
          <span className="at-go">Play <Icon name="chevron" size={14} /></span>
        </button>

        <button className="arcade-tile calls" onClick={() => setView('calls')}>
          <span className="at-art" aria-hidden="true"><Icon name="bolt" size={26} /></span>
          <span className="at-meta">
            <span className="at-name display">Daily Calls</span>
            <span className="at-sub">Call the Match of the Day, climb the Best Caller board against your league.</span>
          </span>
          <span className="at-go">Open <Icon name="chevron" size={14} /></span>
        </button>
      </div>
    </div>
  );
}
