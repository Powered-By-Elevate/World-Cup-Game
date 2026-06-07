import { useState } from 'react';
import type { League } from '../utils/storage';
import { Icon } from '../components/Icon';

interface Props {
  leagues: League[];
  activeCode: string;
  leagueName: string;
  hasTeam: boolean;
  onSwitch: (code: string) => void;
  onCreate: (name: string) => void;
  onJoin: (input: string) => void;
  onCopyLeagueLink: () => void;
  onCopyTeamLink: () => void;
  onClose: () => void;
}

export function Leagues({ leagues, activeCode, leagueName, hasTeam, onSwitch, onCreate, onJoin, onCopyLeagueLink, onCopyTeamLink, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 14px' }}>
          <h2 className="display" style={{ fontSize: 26 }}>Leagues</h2>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '0 18px 30px' }}>
          {/* current league + invites */}
          <div className="eyebrow" style={{ marginBottom: 4 }}>This league</div>
          <div className="card flat pad" style={{ marginBottom: 14 }}>
            <div className="row" style={{ gap: 10, marginBottom: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--lime)', border: '1.5px solid var(--ink)', display: 'grid', placeItems: 'center' }}><Icon name="globe" size={20} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 18 }}>{leagueName || 'Family League'}</div>
                <div className="muted tnum" style={{ fontSize: 12 }}>code · {activeCode}</div>
              </div>
            </div>
            <button className="btn btn-ink btn-block" style={{ marginBottom: 8 }} onClick={onCopyLeagueLink}><Icon name="share" size={16} /> Copy league invite</button>
            {hasTeam && <button className="btn btn-lime btn-block" onClick={onCopyTeamLink}><Icon name="copy" size={16} /> Copy team invite</button>}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
              The <b>league invite</b> lets family join this pool and pick a team. The <b>team invite</b> drops someone straight onto your team.
            </p>
          </div>

          {/* switch */}
          {leagues.length > 1 && <>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Your leagues</div>
            <div className="card flat" style={{ overflow: 'hidden', marginBottom: 14 }}>
              {leagues.map((l, i) => (
                <button key={l.code} onClick={() => onSwitch(l.code)}
                  className="between" style={{ width: '100%', textAlign: 'left', border: 0, background: l.code === activeCode ? 'rgba(200,242,60,.16)' : 'transparent', borderBottom: i < leagues.length - 1 ? '1px solid var(--line-2)' : '0', padding: '13px 14px', cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{l.name || 'Family League'}</div>
                    <div className="muted tnum" style={{ fontSize: 11 }}>{l.code}</div>
                  </div>
                  {l.code === activeCode ? <span className="badge you">Active</span> : <Icon name="chevron" size={16} />}
                </button>
              ))}
            </div>
          </>}

          {/* create */}
          <div className="eyebrow" style={{ marginBottom: 4 }}>Start a new league</div>
          <div className="card flat pad" style={{ marginBottom: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              <input className="ipt" style={{ flex: 1 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="League name (e.g. The Gill Family)" />
              <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!newName.trim()} onClick={() => { onCreate(newName.trim()); setNewName(''); }}>Create</button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 0 }}>A separate pool for a different part of the family.</p>
          </div>

          {/* join */}
          <div className="eyebrow" style={{ marginBottom: 4 }}>Join a league</div>
          <div className="card flat pad">
            <div className="row" style={{ gap: 8 }}>
              <input className="ipt" style={{ flex: 1 }} value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Paste invite link or code" />
              <button className="btn btn-lime btn-sm" style={{ height: 48 }} disabled={!joinCode.trim()} onClick={() => { onJoin(joinCode.trim()); setJoinCode(''); }}>Join</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
