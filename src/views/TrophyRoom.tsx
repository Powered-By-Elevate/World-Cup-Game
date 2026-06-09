import type { Team } from '../data/types';
import type { Award } from '../utils/awards';
import { CUSTOM_AWARDS, sortAwards } from '../utils/awards';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';

interface Props {
  teams: Team[];                                   // in standings order
  awardsByTeam: Record<string, Award[]>;
  assigned: { teamId: string; awardId: string }[]; // commissioner's handed-out funny awards
  myTeamId?: string;
  isCommish: boolean;
  onToggleAward: (teamId: string, awardId: string) => void;
  onClose: () => void;
}

export function TrophyRoom({ teams, awardsByTeam, assigned, myTeamId, isCommish, onToggleAward, onClose }: Props) {
  const has = (teamId: string, awardId: string) => assigned.some(a => a.teamId === teamId && a.awardId === awardId);
  const totalTrophies = teams.reduce((n, t) => n + (awardsByTeam[t.id]?.length || 0), 0);
  // Commissioner sees every team (to hand out trophies); everyone else only
  // sees teams that have actually earned something — no empty clutter.
  const visibleTeams = isCommish ? teams : teams.filter(t => (awardsByTeam[t.id]?.length || 0) > 0);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 14px' }}>
          <div>
            <h2 className="display" style={{ fontSize: 26 }}>🏆 Trophy Room</h2>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {totalTrophies > 0 ? 'Every trophy earned across the pool' : 'Trophies appear here as the tournament unfolds'}
            </div>
          </div>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '0 18px 30px' }}>
          {visibleTeams.length === 0 && (
            <div className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No trophies handed out yet — they'll show up here as the tournament unfolds.
            </div>
          )}
          {visibleTeams.map(t => {
            const list = sortAwards(awardsByTeam[t.id] || []);
            return (
              <div key={t.id} className="card flat pad" style={{ marginBottom: 12, background: t.id === myTeamId ? 'rgba(200,242,60,.1)' : undefined }}>
                <div className="row" style={{ gap: 8, marginBottom: list.length || isCommish ? 10 : 0 }}>
                  <Avatar name={t.name} />
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{t.name}</div>
                  {t.id === myTeamId && <span className="badge you">You</span>}
                  <div style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: 12 }}>{list.length || 'no'} {list.length === 1 ? 'trophy' : 'trophies'}</span>
                </div>

                {list.length > 0 && (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {list.map(a => (
                      <span key={a.id} className="badge" title={a.detail || a.label}
                        style={{ background: a.kind === 'funny' ? 'var(--line-2)' : 'var(--lime)', fontSize: 11.5, padding: '4px 9px' }}>
                        {a.emoji} {a.label}{a.detail ? ` · ${a.detail}` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {isCommish && (
                  <div style={{ marginTop: list.length ? 12 : 0, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
                    <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Hand out a trophy</div>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {CUSTOM_AWARDS.map(ca => {
                        const on = has(t.id, ca.id);
                        return (
                          <button key={ca.id} className="badge" onClick={() => onToggleAward(t.id, ca.id)}
                            style={{ cursor: 'pointer', fontSize: 11.5, padding: '4px 9px', background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink)', border: '1.5px solid var(--line)' }}>
                            {ca.emoji} {ca.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
