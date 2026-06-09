import { useState, useEffect } from 'react';
import type { AppState, Member, MeState } from '../data/types';
import type { Account } from '../utils/storage';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';

interface Props {
  state: AppState;
  me: MeState | null;
  onClose: () => void;
  onAddTeam: (name: string) => void;
  onRenameTeam: (teamId: string, name: string) => void;
  onRemoveTeam: (teamId: string) => void;
  onAddMember: (teamId: string, name: string, email?: string) => void;
  onRenameMember: (memberId: string, name: string) => void;
  onRemoveMember: (memberId: string) => void;
  onMoveMember: (memberId: string, toTeamId: string) => void;
  onSetCommissioner: (memberId: string) => void;
  onLoadAccounts?: () => Promise<Account[]>;
}

/* Compact relative time, e.g. "3d ago". Empty for missing/invalid input. */
function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/* One person in a team — view by default, expands to an editor on tap. */
function MemberRow({ mem, account, teams, teamId, commissioner, meId, onRename, onRemove, onMove, onSetCommish }: {
  mem: Member;
  account?: Account | null;
  teams: AppState['teams'];
  teamId: string;
  commissioner: string | null;
  meId?: string;
  onRename: (memberId: string, name: string) => void;
  onRemove: (memberId: string) => void;
  onMove: (memberId: string, toTeamId: string) => void;
  onSetCommish: (memberId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mem.name);
  const isCommish = commissioner === mem.id;
  const isMe = meId === mem.id;

  // Prefer the live account email (from /api/users) over the captured one.
  const email = account?.email || mem.email || '';
  const lastSeen = ago(account?.last_sign_in_at);
  const status = email
    ? email
    : (mem.uid ? 'Signed in' : 'Not signed in yet');

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
      <div className="between">
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <Avatar name={mem.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mem.name}{isCommish && <span title="Commissioner" style={{ marginLeft: 3 }}>👑</span>}
              {isMe && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>you</span>}
            </div>
            <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status}
            </div>
            {lastSeen && <div className="muted" style={{ fontSize: 11, opacity: 0.8 }}>Last seen {lastSeen}</div>}
          </div>
        </div>
        <button className="hdr-btn" title="Edit" style={{ border: '1.5px solid var(--line)' }}
          onClick={() => { setName(mem.name); setEditing(e => !e); }}>
          <Icon name={editing ? 'x' : 'edit'} size={15} />
        </button>
      </div>

      {editing && (
        <div className="fade-in" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="ipt" value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={{ flex: 1 }} />
            <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!name.trim() || name.trim() === mem.name}
              onClick={() => { onRename(mem.id, name.trim()); setEditing(false); }}>Save</button>
          </div>

          {teams.length > 1 && (
            <select className="ipt" value={teamId}
              onChange={e => { if (e.target.value !== teamId) onMove(mem.id, e.target.value); }}>
              {teams.map(t => <option key={t.id} value={t.id}>Move to: {t.name}</option>)}
            </select>
          )}

          <div className="row" style={{ gap: 8 }}>
            {!isCommish && (
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => onSetCommish(mem.id)}>
                <Icon name="trophy" size={14} /> Make commissioner
              </button>
            )}
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--live)', borderColor: 'var(--live)' }}
              onClick={() => { if (confirm(`Remove ${mem.name} from the pool?`)) onRemove(mem.id); }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* One team card — rename, manage its people, add a person, remove the team. */
function TeamCard({ team, teams, accounts, commissioner, meId, onRenameTeam, onRemoveTeam, onAddMember, onRenameMember, onRemoveMember, onMoveMember, onSetCommissioner }: {
  team: AppState['teams'][number];
  teams: AppState['teams'];
  accounts: Record<string, Account>;
  commissioner: string | null;
  meId?: string;
} & Pick<Props, 'onRenameTeam' | 'onRemoveTeam' | 'onAddMember' | 'onRenameMember' | 'onRemoveMember' | 'onMoveMember' | 'onSetCommissioner'>) {
  const [teamName, setTeamName] = useState(team.name);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const addPerson = () => {
    if (!newName.trim()) return;
    onAddMember(team.id, newName.trim(), newEmail.trim() || undefined);
    setNewName(''); setNewEmail('');
  };

  return (
    <div className="card flat pad" style={{ marginBottom: 14 }}>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input className="ipt" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Team name" style={{ flex: 1 }} />
        <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!teamName.trim() || teamName.trim() === team.name}
          onClick={() => onRenameTeam(team.id, teamName.trim())}>Save</button>
      </div>

      {(team.members || []).length === 0
        ? <div className="muted" style={{ fontSize: 12.5, padding: '4px 0 10px' }}>No one on this team yet.</div>
        : (team.members || []).map(mem => (
          <MemberRow key={mem.id} mem={mem} account={mem.uid ? accounts[mem.uid] : null} teams={teams} teamId={team.id} commissioner={commissioner} meId={meId}
            onRename={onRenameMember} onRemove={onRemoveMember} onMove={onMoveMember} onSetCommish={onSetCommissioner} />
        ))}

      {/* add a person — name required, email optional (reserves their slot) */}
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <input className="ipt" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a person — their name" />
        <div className="row" style={{ gap: 8 }}>
          <input className="ipt" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email (optional)" type="email" style={{ flex: 1 }} />
          <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!newName.trim()} onClick={addPerson}>
            <Icon name="plus" size={15} /> Add
          </button>
        </div>
        {newEmail.trim() && (
          <div className="muted" style={{ fontSize: 11.5 }}>
            We'll link this person automatically when they sign in with that email.
          </div>
        )}
      </div>

      <button className="btn btn-ghost btn-block" style={{ marginTop: 12, color: 'var(--live)', borderColor: 'var(--line)' }}
        onClick={() => { if (confirm(`Remove the team “${team.name}” and everyone on it?`)) onRemoveTeam(team.id); }}>
        Remove team
      </button>
    </div>
  );
}

export function Manage({ state, me, onClose, onAddTeam, onRenameTeam, onRemoveTeam, onAddMember, onRenameMember, onRemoveMember, onMoveMember, onSetCommissioner, onLoadAccounts }: Props) {
  const [addingTeam, setAddingTeam] = useState('');
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const teams = state.teams || [];

  // Pull the real accounts directory (emails + last login) once on open. Gated
  // server-side to the commissioner; silently no-ops when unavailable, leaving
  // the inline "lite" emails captured on sign-in.
  useEffect(() => {
    if (!onLoadAccounts) return;
    let alive = true;
    onLoadAccounts().then(list => {
      if (!alive) return;
      const map: Record<string, Account> = {};
      for (const a of list) map[a.id] = a;
      setAccounts(map);
    });
    return () => { alive = false; };
  }, [onLoadAccounts]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 14px' }}>
          <div>
            <h2 className="display" style={{ fontSize: 26 }}>Teams &amp; people</h2>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Commissioner controls — add teams, move people, manage profiles</div>
          </div>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '0 18px 30px' }}>
          {teams.length === 0 && (
            <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>No teams yet — add the first one below.</div>
          )}

          {teams.map(team => (
            <TeamCard key={team.id} team={team} teams={teams} accounts={accounts} commissioner={state.commissioner} meId={me?.id}
              onRenameTeam={onRenameTeam} onRemoveTeam={onRemoveTeam} onAddMember={onAddMember}
              onRenameMember={onRenameMember} onRemoveMember={onRemoveMember} onMoveMember={onMoveMember}
              onSetCommissioner={onSetCommissioner} />
          ))}

          {/* add a new team */}
          <div className="eyebrow" style={{ margin: '18px 0 4px' }}>Add a team</div>
          <div className="card flat pad">
            <div className="row" style={{ gap: 8 }}>
              <input className="ipt" value={addingTeam} onChange={e => setAddingTeam(e.target.value)} placeholder="New team name" style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && addingTeam.trim()) { onAddTeam(addingTeam.trim()); setAddingTeam(''); } }} />
              <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!addingTeam.trim()}
                onClick={() => { onAddTeam(addingTeam.trim()); setAddingTeam(''); }}>
                <Icon name="plus" size={15} /> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
