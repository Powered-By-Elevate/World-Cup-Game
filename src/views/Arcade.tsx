/* ============================================================
   ARCADE — the minigames hub. Two sub-tabs:
     • Games  — launch each game (single-player or challenge a league
                member), plus your incoming/outgoing/settled challenges
                and the Daily Calls slate.
     • Boards — per-game leaderboards (top 5, one best score per person)
                plus the Best Caller standings.
   Action games open as full-screen overlays (App owns the launch);
   Daily Calls renders inline.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';
import { CallCard, BestCallers } from './CallOfDay';
import type { Common as CallsProps } from './CallOfDay';
import {
  GAMES, GAME_META, loadScores, leaderboard, loadChallenges,
  incoming, outgoing, settled, winnerOf,
} from '../utils/arcade';
import type { ArcadeGame, LaunchMode, ScoreEntry, Challenge } from '../utils/arcade';

interface Member { id: string; name: string; team: string; }

interface Props extends CallsProps {
  meId: string;
  members: Member[];                                   // everyone else in the league
  onLaunch: (game: ArcadeGame, mode: LaunchMode) => void;
}

export function Arcade({ meId, members, onLaunch, ...calls }: Props) {
  const [sub, setSub] = useState<'games' | 'boards'>('games');
  const [view, setView] = useState<'hub' | 'calls'>('hub');
  const [picker, setPicker] = useState<ArcadeGame | null>(null);   // Single/Multiplayer + member chooser
  const [scores, setScores] = useState<Record<string, ScoreEntry[]>>({});
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  // poll the shared score + challenge stores (same cadence as the rest of the app)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [s, c] = await Promise.all([loadScores(), loadChallenges()]);
      if (alive) { setScores(s); setChallenges(c); }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (view === 'calls') {
    return (
      <div className="content">
        <button className="btn btn-sm" style={{ marginBottom: 14 }} onClick={() => setView('hub')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={14} /></span> Arcade
        </button>
        <CallCard {...calls} meId={meId} onSeeBoard={() => { setView('hub'); setSub('boards'); }} />
      </div>
    );
  }

  const inc = incoming(challenges, meId);
  const out = outgoing(challenges, meId);
  const done = settled(challenges, meId).slice(0, 6);

  return (
    <div className="content">
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={'seg-b ' + (sub === 'games' ? 'on' : '')} onClick={() => setSub('games')}>Games</button>
        <button className={'seg-b ' + (sub === 'boards' ? 'on' : '')} onClick={() => setSub('boards')}>Leaderboards</button>
      </div>

      {sub === 'games' ? (
        <>
          <div className="arcade-grid">
            <button className="arcade-tile pen" onClick={() => setPicker('penalty')}>
              <span className="at-art" aria-hidden="true">🥅</span>
              <span className="at-meta">
                <span className="at-name display">Penalty Streak</span>
                <span className="at-sub">Draw your shot — bend it, flick it, beat the keeper. How many in a row?</span>
              </span>
              <span className="at-go">Play <Icon name="chevron" size={14} /></span>
            </button>

            <button className="arcade-tile soc" onClick={() => setPicker('soccer')}>
              <span className="at-art" aria-hidden="true">⚽</span>
              <span className="at-meta">
                <span className="at-name display">Soccer Stars</span>
                <span className="at-sub">Flick-physics table soccer — your nation's flag discs vs a rival. First to 3.</span>
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

          {(inc.length > 0 || out.length > 0 || done.length > 0) && (
            <>
              <div className="sec-head" style={{ marginTop: 22 }}><span className="eyebrow">⚔ Challenges</span></div>

              {inc.map(c => (
                <div key={c.id} className="card pad chal-row">
                  <span className="at-art sm" aria-hidden="true">{GAME_META[c.game].emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{c.fromName} challenged you</div>
                    <div className="muted" style={{ fontSize: 12 }}>{GAME_META[c.game].name} · they {GAME_META[c.game].verb} {c.fromScore}</div>
                  </div>
                  <button className="btn btn-lime btn-sm" onClick={() => onLaunch(c.game, { kind: 'respond', challengeId: c.id, oppName: c.fromName })}>Play</button>
                </div>
              ))}

              {out.map(c => (
                <div key={c.id} className="card pad chal-row">
                  <span className="at-art sm" aria-hidden="true">{GAME_META[c.game].emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>You challenged {c.toName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{GAME_META[c.game].name} · you {GAME_META[c.game].verb} {c.fromScore} · waiting…</div>
                  </div>
                  <span className="badge">Pending</span>
                </div>
              ))}

              {done.map(c => {
                const w = winnerOf(c);
                const iWon = w === meId;
                const label = w == null ? 'Draw' : iWon ? 'You won' : `${c.from === meId ? c.toName : c.fromName} won`;
                const opp = c.from === meId ? c.toName : c.fromName;
                return (
                  <div key={c.id} className="card pad chal-row">
                    <span className="at-art sm" aria-hidden="true">{GAME_META[c.game].emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>vs {opp} · {GAME_META[c.game].name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.fromScore}–{c.toScore}</div>
                    </div>
                    <span className={'badge ' + (iWon ? 'you' : '')}>{label}</span>
                  </div>
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          {GAMES.map(g => {
            const board = leaderboard(scores, g);
            return (
              <div key={g} style={{ marginBottom: 18 }}>
                <div className="sec-head">
                  <span className="eyebrow">{GAME_META[g].emoji} {GAME_META[g].name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{GAME_META[g].board} · top 5</span>
                </div>
                {board.length === 0 ? (
                  <div className="card pad" style={{ textAlign: 'center' }}>
                    <p className="muted" style={{ fontSize: 14, margin: 0 }}>No scores yet — be the first to put one on the board.</p>
                  </div>
                ) : (
                  <div className="card flat" style={{ overflow: 'hidden' }}>
                    {board.map((e, i) => (
                      <div key={e.memberId} className="caller-row" style={{ background: e.memberId === meId ? 'rgba(200,242,60,.1)' : 'transparent' }}>
                        <span className={`rank ${i < 3 ? 'r' + (i + 1) : ''}`} style={{ fontSize: 20, width: 28 }}>{i + 1}</span>
                        <Avatar name={e.name} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: 14 }}>{e.name}</span>
                          {e.memberId === meId && <span className="badge you" style={{ marginLeft: 6 }}>You</span>}
                        </div>
                        <div className="num" style={{ fontSize: 24, lineHeight: 1 }}>{e.score}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* Daily Calls standings — lives here with the rest of the boards */}
          <BestCallers {...calls} meId={meId} />
        </>
      )}

      {/* Single / Multiplayer + opponent chooser */}
      {picker && (
        <GameChooser
          game={picker}
          members={members}
          onClose={() => setPicker(null)}
          onSolo={() => { const g = picker; setPicker(null); onLaunch(g, { kind: 'solo' }); }}
          onChallenge={(m) => { const g = picker; setPicker(null); onLaunch(g, { kind: 'challenge', oppId: m.id, oppName: m.name }); }}
        />
      )}
    </div>
  );
}

/* ---- bottom-sheet chooser: Single Player vs Multiplayer (pick a member) ---- */
function GameChooser({ game, members, onClose, onSolo, onChallenge }: {
  game: ArcadeGame; members: Member[]; onClose: () => void;
  onSolo: () => void; onChallenge: (m: Member) => void;
}) {
  const [mp, setMp] = useState(false);
  const meta = GAME_META[game];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 12px' }}>
          <h2 className="display" style={{ fontSize: 24 }}>{meta.emoji} {meta.name}</h2>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>
        {!mp ? (
          <div style={{ padding: '0 18px 26px' }}>
            <button className="btn btn-ink btn-block" onClick={onSolo}>🎮 Single player</button>
            <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setMp(true)}>⚔ Challenge a league member</button>
            <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5, textAlign: 'center' }}>
              In a challenge you each play your own leg — high score wins. They get a notification to play theirs.
            </p>
          </div>
        ) : (
          <div style={{ padding: '0 18px 26px' }}>
            <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => setMp(false)}>
              <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={14} /></span> Back
            </button>
            {members.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>No one else in this league yet — invite someone to challenge them.</p>
            ) : (
              <div className="card flat" style={{ overflow: 'hidden' }}>
                {members.map(m => (
                  <button key={m.id} className="caller-row" style={{ width: '100%', background: 'transparent', cursor: 'pointer', textAlign: 'left' }} onClick={() => onChallenge(m)}>
                    <Avatar name={m.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{m.team}</div>
                    </div>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
