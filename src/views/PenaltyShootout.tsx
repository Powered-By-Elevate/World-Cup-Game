/* ============================================================
   PENALTY SHOOTOUT — a quick arcade mini-game, themed to your team.
   Aim at a zone, stop the power bar in the sweet spot, beat the keeper.
   5 shots → a score for the "Top Striker" leaderboard. No soccer skill,
   just tap-and-time — built for the whole family.
   ============================================================ */
import { useState, useEffect, useRef } from 'react';
import { POT_KEYS } from '../data/nations';
import type { Team } from '../data/types';
import type { StrikerEntry } from '../utils/storage';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';

const SHOTS = 5;
const ZONES = [
  { x: '17%', y: '32%' }, { x: '50%', y: '26%' }, { x: '83%', y: '32%' },
  { x: '20%', y: '64%' }, { x: '50%', y: '70%' }, { x: '80%', y: '64%' },
];

type Phase = 'aim' | 'power' | 'fly' | 'result' | 'done';
type Outcome = 'GOAL' | 'SAVED' | 'MISS';

interface Props {
  team: Team;
  board: StrikerEntry[];
  onClose: () => void;
  onFinish: (score: number) => void;
}

export function PenaltyShootout({ team, board, onClose, onFinish }: Props) {
  const shooterId = POT_KEYS.map(pk => team.picks?.[pk]).find(Boolean) || 'BRA';

  const [phase, setPhase] = useState<Phase>('aim');
  const [shot, setShot] = useState(0);
  const [goals, setGoals] = useState(0);
  const [aim, setAim] = useState<number | null>(null);
  const [keeper, setKeeper] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [results, setResults] = useState<Outcome[]>([]);
  const [power, setPower] = useState(0);
  const dir = useRef(1);

  // Power bar sweeps while aiming the strike.
  useEffect(() => {
    if (phase !== 'power') return;
    const iv = setInterval(() => {
      setPower(p => {
        let n = p + dir.current * 4;
        if (n >= 100) { n = 100; dir.current = -1; }
        if (n <= 0) { n = 0; dir.current = 1; }
        return n;
      });
    }, 16);
    return () => clearInterval(iv);
  }, [phase]);

  // Resolve the strike once the ball + keeper have flown.
  useEffect(() => {
    if (phase !== 'fly') return;
    const t = setTimeout(() => {
      setPhase('result');
      if (outcome) setResults(r => [...r, outcome]);
      if (outcome === 'GOAL') setGoals(g => g + 1);
    }, 850);
    return () => clearTimeout(t);
  }, [phase, outcome]);

  // Advance to the next shot (or finish) after showing the result.
  useEffect(() => {
    if (phase !== 'result') return;
    const t = setTimeout(() => {
      const nextShot = shot + 1;
      if (nextShot >= SHOTS) { setPhase('done'); onFinish(goals); }
      else { setShot(nextShot); setAim(null); setKeeper(null); setOutcome(null); setPower(0); dir.current = 1; setPhase('aim'); }
    }, 1300);
    return () => clearTimeout(t);
  }, [phase, shot, goals, onFinish]);

  const pickZone = (z: number) => { if (phase === 'aim') { setAim(z); setPhase('power'); } };

  const strike = () => {
    if (phase !== 'power' || aim == null) return;
    const p = power;
    let result: Outcome;
    let keeperZone = Math.floor(Math.random() * 6);
    if (p >= 93) { result = 'MISS'; keeperZone = (aim + 3) % 6; }     // blasted over
    else {
      const reaches = keeperZone === aim || (p < 33 && Math.random() < 0.4);
      if (reaches) { result = 'SAVED'; keeperZone = aim; }
      else result = 'GOAL';
    }
    setKeeper(keeperZone);
    setOutcome(result);
    setPhase('fly');
  };

  const ballPos = aim != null && phase !== 'aim'
    ? (outcome === 'MISS' ? { left: ZONES[aim].x, top: '-8%' } : { left: ZONES[aim].x, top: ZONES[aim].y })
    : { left: '50%', top: '92%' };
  const keeperPos = keeper != null ? { left: ZONES[keeper].x, top: ZONES[keeper].y } : { left: '50%', top: '52%' };

  const myBest = board.find(e => e.teamId === team.id)?.score;

  return (
    <div className="pk-overlay">
      {/* top bar */}
      <div className="pk-top">
        <button className="ins-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="pk-score">
          {Array.from({ length: SHOTS }).map((_, i) => {
            const r = results[i];
            const bg = r === 'GOAL' ? 'var(--lime)' : r ? 'var(--live)' : 'rgba(255,255,255,.14)';
            return <span key={i} className="pk-dot" style={{ background: bg }} />;
          })}
        </div>
        <div className="pk-goals"><span className="num">{goals}</span><span className="lbl">goals</span></div>
      </div>

      {phase !== 'done' ? (
        <>
          {/* pitch + goal */}
          <div className="pk-stage">
            <div className="pk-goal">
              <div className="pk-net" />
              {/* aim zones */}
              {ZONES.map((z, i) => (
                <button key={i} className={`pk-zone ${aim === i ? 'on' : ''}`} style={{ left: z.x, top: z.y }}
                  disabled={phase !== 'aim'} onClick={() => pickZone(i)}>
                  <Icon name="arrow" size={18} />
                </button>
              ))}
              {/* keeper */}
              <div className="pk-keeper" style={{ left: keeperPos.left, top: keeperPos.top, transition: phase === 'fly' || phase === 'result' ? 'all .5s cubic-bezier(.2,.8,.2,1)' : 'none' }} />
              {/* ball */}
              <div className="pk-ball" style={{
                left: ballPos.left, top: ballPos.top,
                transform: `translate(-50%,-50%) scale(${phase === 'aim' ? 1 : 0.5})`,
                transition: phase === 'fly' || phase === 'result' ? 'all .6s cubic-bezier(.3,.7,.4,1)' : 'none',
              }}>⚽</div>
              {/* result flash */}
              {phase === 'result' && outcome && (
                <div className={`pk-flash ${outcome === 'GOAL' ? 'goal' : 'miss'}`}>{outcome === 'GOAL' ? 'GOAL!' : outcome === 'SAVED' ? 'SAVED!' : 'MISS!'}</div>
              )}
            </div>
          </div>

          {/* controls */}
          <div className="pk-controls">
            <div className="row" style={{ gap: 8, justifyContent: 'center', marginBottom: 12 }}>
              <Flag id={shooterId} size={30} ring="pot" />
              <span style={{ fontFamily: 'Anton, sans-serif', textTransform: 'uppercase', color: 'var(--paper)', fontSize: 16 }}>{team.name}</span>
            </div>
            {phase === 'aim' && <div className="pk-hint">Tap where to aim ⬆</div>}
            {phase === 'power' && <>
              <div className="pk-power">
                <span className="pk-power-good" />
                <span className="pk-power-fill" style={{ width: `${power}%` }} />
              </div>
              <button className="btn btn-lime btn-block" onClick={strike}>SHOOT</button>
              <div className="pk-hint" style={{ marginTop: 8 }}>Stop it in the green — too hard and it flies over</div>
            </>}
            {(phase === 'fly' || phase === 'result') && <div className="pk-hint">&nbsp;</div>}
          </div>
        </>
      ) : (
        /* ---- results + Top Striker leaderboard ---- */
        <div className="pk-done">
          <div className="eyebrow" style={{ color: 'var(--lime)' }}>Full time</div>
          <div className="display" style={{ fontSize: 64, color: 'var(--paper)', lineHeight: 1, margin: '6px 0' }}>{goals}<span style={{ fontSize: 28, color: '#9C988C' }}>/{SHOTS}</span></div>
          <div className="muted" style={{ color: '#CFCBBE', fontSize: 13 }}>
            {goals === SHOTS ? 'Perfect! Ice in your veins. 🧊' : goals >= 3 ? 'Clinical finishing.' : goals >= 1 ? 'Got on the board.' : 'Rough day at the spot.'}
            {myBest != null && goals > myBest ? ' New personal best! 🎉' : myBest != null ? ` Your best: ${myBest}/${SHOTS}.` : ''}
          </div>

          <div className="pk-board">
            <div className="eyebrow" style={{ marginBottom: 8 }}>🥅 Top Striker</div>
            {board.length === 0 && <div className="muted" style={{ fontSize: 13, color: '#9C988C' }}>Be the first to post a score!</div>}
            {board.slice(0, 6).map((e, i) => (
              <div key={e.teamId} className="pk-board-row" style={{ background: e.teamId === team.id ? 'rgba(200,242,60,.14)' : 'transparent' }}>
                <span className="num" style={{ width: 22, color: i === 0 ? 'var(--gold)' : '#9C988C' }}>{i + 1}</span>
                <Avatar name={e.name} size={24} />
                <span style={{ flex: 1, fontWeight: 700, color: 'var(--paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                <span className="num" style={{ color: 'var(--lime)' }}>{e.score}<span style={{ color: '#9C988C', fontSize: 12 }}>/{SHOTS}</span></span>
              </div>
            ))}
          </div>

          <div className="row" style={{ gap: 10, marginTop: 18 }}>
            <button className="btn btn-ghost btn-block" style={{ color: 'var(--paper)', borderColor: 'rgba(255,255,255,.3)' }} onClick={onClose}>Done</button>
            <button className="btn btn-lime btn-block" onClick={() => { setShot(0); setGoals(0); setAim(null); setKeeper(null); setOutcome(null); setResults([]); setPower(0); dir.current = 1; setPhase('aim'); }}>Play again</button>
          </div>
        </div>
      )}
    </div>
  );
}
