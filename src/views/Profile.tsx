import { useState } from 'react';
import type { MeState, Team } from '../data/types';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';

interface Props {
  me: MeState | null;
  myTeam: Team | null;
  isCommish: boolean;
  commishName: string | null;
  onClose: () => void;
  onRenameMe: (name: string) => void;
  onRenameTeam: (name: string) => void;
  onTeamInvite: () => void;
  onLeave: () => void;
  onClaim: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export function Profile({ me, myTeam, isCommish, commishName, onClose, onRenameMe, onRenameTeam, onTeamInvite, onLeave, onClaim, userEmail, onSignOut }: Props) {
  const [playerName, setPlayerName] = useState(me?.name || '');
  const [teamName, setTeamName] = useState(myTeam?.name || '');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 14px' }}>
          <h2 className="display" style={{ fontSize: 26 }}>You</h2>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '0 18px 30px' }}>
          {/* your name */}
          {me && (
            <>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Your name</div>
              <div className="card flat pad" style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Avatar name={playerName || me.name} />
                  <input className="ipt" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Your name" style={{ flex: 1 }} />
                  <button className="btn btn-ink btn-sm" style={{ height: 48 }}
                    disabled={!playerName.trim() || playerName.trim() === me.name}
                    onClick={() => { onRenameMe(playerName.trim()); onClose(); }}>Save</button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>How you show up on your team and the leaderboard.</div>
              </div>
            </>
          )}

          {/* account */}
          {userEmail && (
            <>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Account</div>
              <div className="card flat pad" style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, minWidth: 0 }}>
                  <Avatar name={userEmail} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
                    <div className="muted" style={{ fontSize: 12 }}>Signed in — your team follows you on every device</div>
                  </div>
                </div>
                {onSignOut && (
                  <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }}
                    onClick={() => { if (confirm('Sign out of this device?')) { onSignOut(); } }}>
                    <Icon name="refresh" size={16} /> Sign out
                  </button>
                )}
              </div>
            </>
          )}

          {/* league role */}
          <div className="eyebrow" style={{ marginBottom: 4 }}>Commissioner</div>
          <div className="between card flat pad" style={{ marginBottom: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              <Avatar name={commishName || '?'} />
              <div><div style={{ fontWeight: 800 }}>{commishName ? `${commishName} 👑` : 'No commissioner yet'}</div><div className="muted" style={{ fontSize: 12 }}>Runs the draft &amp; rules</div></div>
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
                <input className="ipt" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Team name" style={{ flex: 1 }} />
                <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!teamName.trim() || teamName.trim() === myTeam.name} onClick={() => { onRenameTeam(teamName.trim()); onClose(); }}>Save</button>
              </div>
              <button className="btn btn-ghost btn-block" style={{ marginBottom: 8 }} onClick={() => { onTeamInvite(); onClose(); }}><Icon name="users" size={16} /> Invite your partner</button>
              <button className="btn btn-ghost btn-block" style={{ color: 'var(--live)', borderColor: 'var(--live)' }}
                onClick={() => { if (confirm('Leave this team?')) { onLeave(); onClose(); } }}>Leave team</button>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
