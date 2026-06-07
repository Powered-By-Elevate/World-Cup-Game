import { useState } from 'react';
import type { AppState, MeState, Scoring, Team } from '../data/types';
import { HAS_REAL } from '../utils/storage';
import { clamp } from '../utils/helpers';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';

interface Props {
  state: AppState;
  myTeam: Team | null;
  me: MeState | null;
  isCommish: boolean;
  commishName: string | null;
  onClose: () => void;
  onScoring: (sc: Scoring) => void;
  onLeave: () => void;
  onRename: (name: string) => void;
  onClaim: () => void;
  onResetApp: () => void;
  onTeamInvite: () => void;
  demo: boolean;
  onToggleDemo: (v: boolean) => void;
}

export function Settings({ state, myTeam, isCommish, commishName, onClose, onScoring, onLeave, onRename, onClaim, onResetApp, onTeamInvite, demo, onToggleDemo }: Props) {
  const sc = state.scoring;
  const [name, setName] = useState(myTeam?.name || '');

  const set = (k: 'win' | 'draw', v: number) => onScoring({ ...sc, [k]: clamp(v, 0, 9) });
  const setB = (k: string, v: number) => onScoring({ ...sc, b: { ...sc.b, [k]: clamp(v, 0, 50) } });

  const Stp = ({ label, val, dec, inc, gold }: { label: string; val: number; dec: () => void; inc: () => void; gold?: boolean }) => (
    <div className="between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
      <span style={{ fontWeight: 600, fontSize: 14, color: gold ? 'var(--gold)' : undefined }}>{label}</span>
      <div className="stepper"><button onClick={dec}>–</button><span className="val">{val}</span><button onClick={inc}>+</button></div>
    </div>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 14px' }}>
          <h2 className="display" style={{ fontSize: 26 }}>Settings</h2>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '0 18px 30px' }}>
          {/* sync */}
          <div className="between card flat pad" style={{ marginBottom: 14 }}>
            <div><div style={{ fontWeight: 800 }}>Family sync</div><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{HAS_REAL ? 'On — everyone sees live updates' : 'Preview — changes stay on this device'}</div></div>
            <span className={`status ${HAS_REAL ? 'live' : 'preview'}`}><span className="dot" />{HAS_REAL ? 'Live' : 'Preview'}</span>
          </div>

          {/* scoring */}
          <div className="eyebrow" style={{ marginBottom: 4 }}>Scoring</div>
          <div className="card flat pad" style={{ marginBottom: 14 }}>
            <Stp label="Points per win" val={sc.win} dec={() => set('win', sc.win - 1)} inc={() => set('win', sc.win + 1)} />
            <Stp label="Points per draw" val={sc.draw} dec={() => set('draw', sc.draw - 1)} inc={() => set('draw', sc.draw + 1)} />
            <div className="between" style={{ padding: '12px 0 4px' }}>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>Round bonuses</div><div className="muted" style={{ fontSize: 12 }}>Reward going deep in the knockouts</div></div>
              <div className={`toggle ${sc.bonuses ? 'on' : ''}`} onClick={() => onScoring({ ...sc, bonuses: !sc.bonuses })}><span className="knob" /></div>
            </div>
            {sc.bonuses && (
              <div className="fade-in" style={{ marginTop: 6, borderTop: '1px solid var(--line-2)', paddingTop: 4 }}>
                {([['R32', 'Reach Round of 32'], ['R16', 'Reach Round of 16'], ['QF', 'Reach Quarter-finals'], ['SF', 'Reach Semi-finals'], ['Final', 'Reach the Final']] as const).map(([k, l]) => (
                  <Stp key={k} label={l} val={sc.b[k]} dec={() => setB(k, sc.b[k] - 1)} inc={() => setB(k, sc.b[k] + 1)} />
                ))}
                <Stp label="🏆 Win it all" val={sc.b.CHAMP} dec={() => setB('CHAMP', sc.b.CHAMP - 1)} inc={() => setB('CHAMP', sc.b.CHAMP + 1)} gold />
              </div>
            )}
          </div>

          {/* commissioner */}
          <div className="eyebrow" style={{ marginBottom: 4 }}>Commissioner</div>
          <div className="between card flat pad" style={{ marginBottom: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              <Avatar name={commishName || '?'} />
              <div><div style={{ fontWeight: 800 }}>{commishName ? `${commishName} 👑` : 'No commissioner yet'}</div><div className="muted" style={{ fontSize: 12 }}>Runs the draft & rules</div></div>
            </div>
            {isCommish && commishName
              ? <span className="muted" style={{ fontSize: 12 }}>That's you</span>
              : <button className="btn btn-ghost btn-sm" onClick={() => { onClaim(); onClose(); }}>{commishName ? 'Take over' : 'Claim'}</button>}
          </div>

          {/* your team */}
          {myTeam && <>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Your team</div>
            <div className="card flat pad">
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <input className="ipt" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!name.trim()} onClick={() => { onRename(name.trim()); onClose(); }}>Save</button>
              </div>
              <button className="btn btn-ghost btn-block" style={{ marginBottom: 8 }} onClick={() => { onTeamInvite(); onClose(); }}><Icon name="users" size={16} /> Invite your partner</button>
              <button className="btn btn-ghost btn-block" style={{ color: 'var(--live)', borderColor: 'var(--live)' }}
                onClick={() => { if (confirm('Leave this team?')) { onLeave(); onClose(); } }}>Leave team</button>
            </div>
          </>}

          {/* results */}
          <div className="eyebrow" style={{ margin: '18px 0 4px' }}>Results</div>
          <div className="card flat pad" style={{ marginBottom: 14 }}>
            <div className="between">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Demo results</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{demo ? 'Showing a simulated full tournament so you can test scoring.' : 'Live scores come automatically from the real match feed — no entry.'}</div>
              </div>
              <div className={`toggle ${demo ? 'on' : ''}`} onClick={() => onToggleDemo(!demo)}><span className="knob" /></div>
            </div>
          </div>

          {/* testing */}
          <div className="eyebrow" style={{ margin: '18px 0 4px' }}>Testing</div>
          <div className="card flat pad">
            <div style={{ fontWeight: 800, marginBottom: 2 }}>Reset everything</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Wipes this league's pool and your local data, then starts fresh from onboarding. Use this to re-test from the beginning.</div>
            <button className="btn btn-ghost btn-block" style={{ color: 'var(--live)', borderColor: 'var(--live)' }}
              onClick={() => { if (confirm('Reset everything and start over? This clears this league’s teams, draft and your saved identity.')) onResetApp(); }}>
              <Icon name="refresh" size={16} /> Reset app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
