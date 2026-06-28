import { NATION, POT_KEYS } from '../data/nations';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry } from '../utils/scoring';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Member, teamGradient } from '../components/shared';

interface Props {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  standings: StandingEntry[];
  myTeam: Team | null;
}

export function Squads({ state, standings, myTeam }: Props) {
  const teams = state.teams || [];
  if (teams.length === 0) return (
    <div className="content">
      <div className="card pad" style={{ textAlign: 'center' }}><div className="h2">No teams yet</div></div>
    </div>
  );

  const anyRedraft = teams.some(t => t.replacements && Object.keys(t.replacements).length > 0);

  return (
    <div className="content">
      <div className="sec-head"><span className="eyebrow">Everyone's teams</span><span className="muted" style={{ fontSize: 12 }}>{teams.length} couples</span></div>
      {anyRedraft && (
        <div className="row" style={{ gap: 7, alignItems: 'center', margin: '-4px 2px 10px', color: 'var(--mut)', fontSize: 11 }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--ink)', color: 'var(--lime)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <Icon name="refresh" size={9} />
          </span>
          <span>Re-drafted — a group-stage nation was eliminated and replaced for the knockouts.</span>
        </div>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {teams.map(t => {
          const st = standings.find(s => s.team.id === t.id);
          const mine = t.id === myTeam?.id;
          return (
            <div key={t.id} className="card" style={{ overflow: 'hidden', border: mine ? '2px solid var(--ink)' : '1.5px solid var(--ink)' }}>
              <div style={{ height: 7, background: teamGradient(t) }} />
              <div style={{ padding: '13px 14px 14px' }}>
                <div className="between">
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    {mine && <span className="badge you">You</span>}
                  </div>
                  {state.draftDone && st && (
                    <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 24, lineHeight: 1 }}>{st.total}</div><div className="eyebrow" style={{ fontSize: 8 }}>PTS</div></div>
                  )}
                </div>
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  {(t.members || []).map((m, i) => <Member key={m.id} name={m.name} idx={i} commish={m.id === state.commissioner} />)}
                  {(t.members || []).length === 0 && <span className="muted" style={{ fontSize: 12 }}>No one's joined yet</span>}
                </div>
                {t.picks ? (
                  <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
                    {POT_KEYS.map(pot => {
                      const orig = t.picks![pot];
                      const repl = t.replacements?.[pot];
                      const nid = repl || orig;
                      const redrafted = !!repl && repl !== orig;
                      const pts = st?.per[pot]?.total ?? 0;
                      return (
                        <div key={pot} style={{ flex: 1, textAlign: 'center', background: 'var(--paper-3)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 4px 9px' }}>
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <Flag id={nid} size={40} ring="pot" />
                            {redrafted && (
                              <span title={`Re-drafted — replaced ${NATION[orig]?.name || 'an eliminated nation'}`}
                                style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--ink)', color: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--paper-3)' }}>
                                <Icon name="refresh" size={10} />
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{NATION[nid].name}</div>
                          {redrafted && (
                            <div className="eyebrow" style={{ fontSize: 8, color: 'var(--mut)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <span style={{ textDecoration: 'line-through' }}>{NATION[orig]?.name}</span>
                            </div>
                          )}
                          {state.draftDone && <div className="num" style={{ fontSize: 16, marginTop: 2 }}>{pts}<span style={{ fontSize: 9, fontFamily: 'Archivo, sans-serif', fontWeight: 800, marginLeft: 2, color: 'var(--mut)' }}>PT</span></div>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>Nations assigned after the draft.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
