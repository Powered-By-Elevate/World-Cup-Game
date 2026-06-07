import { NATION, POT_KEYS } from '../data/nations';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry } from '../utils/scoring';
import { Flag } from '../components/Flag';
import { Avatar, teamGradient } from '../components/shared';

interface Props {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  standings: StandingEntry[];
  myTeam: Team | null;
}

export function Squads({ state, standings, myTeam }: Props) {
  const teams = state.teams || [];
  if (teams.length === 0) return (
    <div className="card" style={{ textAlign: "center" }}><div className="h2">No teams yet</div></div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="eyebrow" style={{ margin: "2px 4px" }}>
        {teams.length} teams - {teams.reduce((a, t) => a + (t.members?.length || 0), 0)} players
      </div>
      {teams.map(t => {
        const s = standings.find(x => x.team.id === t.id);
        const isMine = myTeam?.id === t.id;
        return (
          <div className="card" key={t.id} style={isMine ? { borderColor: "rgba(199,255,78,.4)" } : {}}>
            <div className="row" style={{ marginBottom: 12 }}>
              <span style={{ width: 8, height: 34, borderRadius: 4, background: teamGradient(t) }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {t.name} {isMine && <span className="pill on" style={{ background: "var(--lime)", color: "#0a0f08" }}>YOU</span>}
                </div>
                <div className="muted tiny">{(t.members || []).length} member{(t.members || []).length === 1 ? "" : "s"}</div>
              </div>
              {state.draftDone && s && (
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--disp)", fontSize: 20, color: "var(--lime)" }}>{s.total}</div>
                  <div className="eyebrow">pts</div>
                </div>
              )}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {(t.members || []).map(m => (
                <span className="member" key={m.id}>
                  <Avatar name={m.name} /> {m.name}
                  {m.id === state.commissioner && <span title="Commissioner"> &#128081;</span>}
                </span>
              ))}
              {(t.members || []).length === 0 && <span className="muted tiny">No one's joined yet</span>}
            </div>
            {t.picks ? (
              <div className="flagrow">
                {POT_KEYS.map(pk => (
                  <div className="fwrap" key={pk}>
                    <Flag id={t.picks![pk]} size={40} radius={6} />
                    <div className="fname">{NATION[t.picks![pk]].name}</div>
                    {state.draftDone && s && <span className="pill ft-badge">{s.per[pk]?.total ?? 0} pts</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted tiny">Nations assigned after the draft.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
