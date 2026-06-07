import { NATION, POT_KEYS } from '../data/nations';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry } from '../utils/scoring';
import { Flag } from '../components/Flag';
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

  return (
    <div className="content">
      <div className="sec-head"><span className="eyebrow">Everyone's teams</span><span className="muted" style={{ fontSize: 12 }}>{teams.length} couples</span></div>
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
                      const nid = t.picks![pot];
                      const pts = st?.per[pot]?.total ?? 0;
                      return (
                        <div key={pot} style={{ flex: 1, textAlign: 'center', background: 'var(--paper-3)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 4px 9px' }}>
                          <Flag id={nid} size={40} ring="pot" />
                          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{NATION[nid].name}</div>
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
