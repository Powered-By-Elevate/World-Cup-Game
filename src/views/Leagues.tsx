import { useState } from 'react';
import type { League } from '../utils/storage';
import { Icon } from '../components/Icon';

interface Props {
  leagues: League[];
  activeCode: string;
  leagueName: string;
  hasTeam: boolean;
  canRename: boolean;
  onSwitch: (code: string) => void;
  onCreate: (name: string) => void;
  onJoin: (input: string) => void;
  onRename: (name: string) => void;
  onRemove: (code: string) => void;
  onCopyLeagueLink: () => void;
  onCopyTeamLink: () => void;
  onClose: () => void;
}

export function Leagues({ leagues, activeCode, leagueName, hasTeam, canRename, onSwitch, onCreate, onJoin, onRename, onRemove, onCopyLeagueLink, onCopyTeamLink, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(leagueName || '');

  const startEdit = () => { setEditName(leagueName || ''); setEditing(true); };
  const saveEdit = () => { const v = editName.trim(); if (v) onRename(v); setEditing(false); };

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
            {editing ? (
              <div style={{ marginBottom: 12 }}>
                <div className="row" style={{ gap: 8 }}>
                  <input className="ipt" style={{ flex: 1 }} value={editName} autoFocus
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                    placeholder="League name" />
                  <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!editName.trim()} onClick={saveEdit}>Save</button>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            ) : (
              <div className="between" style={{ gap: 10, marginBottom: 12 }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--lime)', border: '1.5px solid var(--ink)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon name="globe" size={20} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leagueName || 'Unnamed league'}</div>
                    <div className="muted tnum" style={{ fontSize: 12 }}>code · {activeCode}</div>
                  </div>
                </div>
                {canRename && (
                  <button className="hdr-btn" onClick={startEdit} title="Rename league" style={{ flex: '0 0 auto' }}><Icon name="edit" size={16} /></button>
                )}
              </div>
            )}
            <button className="btn btn-ink btn-block" style={{ marginBottom: 8 }} onClick={onCopyLeagueLink}><Icon name="share" size={16} /> Copy league invite</button>
            {hasTeam && <button className="btn btn-lime btn-block" onClick={onCopyTeamLink}><Icon name="copy" size={16} /> Copy team invite</button>}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
              The <b>league invite</b> lets family join this pool and pick a team. The <b>team invite</b> drops someone straight onto your team.
            </p>
            <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12, color: 'var(--live)', borderColor: 'var(--line)' }}
              onClick={() => { if (confirm(`Leave “${leagueName || 'this league'}”? It stays for everyone else — you can rejoin any time with the invite link.`)) onRemove(activeCode); }}>
              <Icon name="x" size={15} /> Leave this league
            </button>
          </div>

          {/* switch */}
          {leagues.length > 1 && <>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Your leagues</div>
            <div className="card flat" style={{ overflow: 'hidden', marginBottom: 14 }}>
              {leagues.map((l, i) => (
                <div key={l.code} className="between" style={{ background: l.code === activeCode ? 'rgba(200,242,60,.16)' : 'transparent', borderBottom: i < leagues.length - 1 ? '1px solid var(--line-2)' : '0', padding: '7px 10px 7px 14px' }}>
                  <button onClick={() => onSwitch(l.code)} className="row" style={{ flex: 1, minWidth: 0, gap: 9, textAlign: 'left', border: 0, background: 'transparent', padding: '6px 0', cursor: 'pointer' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name || 'Unnamed league'}</div>
                      <div className="muted tnum" style={{ fontSize: 11 }}>{l.code}</div>
                    </div>
                  </button>
                  <div className="row" style={{ gap: 7, flex: '0 0 auto' }}>
                    {l.code === activeCode ? <span className="badge you">Active</span> : <Icon name="chevron" size={16} />}
                    <button className="hdr-btn" title="Remove from your list" onClick={() => { if (confirm(`Remove “${l.name || 'this league'}” from your list? You can rejoin with its invite link.`)) onRemove(l.code); }} style={{ border: '1.5px solid var(--line)', height: 32, width: 32 }}><Icon name="x" size={15} /></button>
                  </div>
                </div>
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
