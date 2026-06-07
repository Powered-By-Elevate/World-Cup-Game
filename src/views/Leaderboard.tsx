import { Fragment, useState } from 'react';
import { NATION, POT_KEYS, POT_META } from '../data/nations';
import { GROUP_LETTERS } from '../data/fixtures';
import { GROUP_MATCHES_OF, MATCH_DATE } from '../data/fixtures';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry, MoversResult } from '../utils/scoring';
import { groupTable } from '../utils/scoring';
import { Flag } from '../components/Flag';
import { Icon, ICONS } from '../components/Icon';
import { TeamFlags, teamGradient } from '../components/shared';
import { fmtDayLabel } from '../utils/helpers';

function MoverCard({ movers, state, scores }: {
  movers: MoversResult;
  state: AppState;
  scores: Record<string, ScoreEntry>;
}) {
  if (!movers.mover || !movers.latest) return null;
  const t = movers.mover;
  const gained = movers.delta[t.id];
  const day = fmtDayLabel(movers.latest);
  const played: string[] = [];
  POT_KEYS.forEach(pk => {
    const nid = t.picks?.[pk]; if (!nid) return;
    (GROUP_MATCHES_OF[nid] || []).forEach(m => {
      if (MATCH_DATE[m.i] === movers.latest) {
        const s = scores[m.i];
        if (s && s.h != null) played.push(nid);
      }
    });
    (state.ko || []).forEach(k => {
      if (k.d === movers.latest && (k.h === nid || k.a === nid)) played.push(nid);
    });
  });

  return (
    <div className="hero" style={{ marginBottom: 14, padding: "16px 16px" }}>
      <div className="hero-glow" style={{ background: teamGradient(t) }} />
      <div className="hero-grain" />
      <div className="row">
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.85)" }}>Biggest mover - {day}</div>
          <div style={{ fontFamily: "var(--disp)", fontSize: 21, textTransform: "uppercase", marginTop: 5 }}>{t.name}</div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {[...new Set(played)].map(id => <Flag key={id} id={id} size={22} />)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: "var(--disp)", fontSize: 30, lineHeight: 1, color: "#0a0f08",
            background: "var(--lime)", borderRadius: 12, padding: "6px 12px", display: "inline-block",
          }}>+{gained}</div>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.85)", marginTop: 6 }}>points</div>
        </div>
      </div>
    </div>
  );
}

export function Leaderboard({ state, standings, delta }: {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  standings: StandingEntry[];
  delta?: Record<string, number>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (!state.draftDone) return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="h2">No standings yet</div>
      <div className="muted tiny" style={{ marginTop: 8 }}>Run the draft first, then results roll in here live.</div>
    </div>
  );

  return (
    <div>
      <div className="row" style={{ margin: "2px 4px 12px" }}>
        <div className="eyebrow">Live standings</div>
        <span className="muted tiny" style={{ marginLeft: "auto" }}>PTS - GD - GF tiebreak</span>
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {standings.map((s, i) => {
          const expanded = open === s.team.id;
          return (
            <div key={s.team.id}>
              <div className="lb-row" onClick={() => setOpen(expanded ? null : s.team.id)}
                style={expanded ? { borderColor: "var(--line2)", background: "var(--panel2)" } : {}}>
                <span className={"lb-rank " + (i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "")}>{i + 1}</span>
                <span style={{ width: 6, height: 38, borderRadius: 3, background: teamGradient(s.team) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, display: "flex", alignItems: "center", gap: 7 }}>
                    {s.team.name} {i === 0 && <Icon d={ICONS.trophy} size={14} />}
                  </div>
                  <div style={{ marginTop: 5 }}><TeamFlags team={s.team} size={18} /></div>
                </div>
                <div className="statbox"><b style={{ color: "var(--lime)" }}>{s.total}</b><span>pts</span></div>
                <div className="statbox"><b>{s.gd > 0 ? "+" + s.gd : s.gd}</b><span>gd</span></div>
                <div className="statbox"><b>{s.gf}</b><span>gf</span></div>
                {delta && delta[s.team.id] > 0 && (
                  <span className="pill" style={{ background: "rgba(199,255,78,.16)", color: "var(--lime)", border: "1px solid rgba(199,255,78,.4)" }}>
                    &#x25B2;{delta[s.team.id]}
                  </span>
                )}
              </div>
              {expanded && (
                <div className="card" style={{ marginTop: 6 }}>
                  <div className="row tiny" style={{ color: "var(--mut)", marginBottom: 8 }}>
                    <span>Record {s.w}-{s.d}-{s.l}</span>
                    {state.scoring.bonuses && (
                      <span style={{ marginLeft: "auto", color: "var(--gold)", fontWeight: 800 }}>+{s.bonus} round bonus</span>
                    )}
                  </div>
                  {POT_KEYS.map(pk => {
                    const ns = s.per[pk]; if (!ns) return null;
                    const nid = s.team.picks![pk];
                    return (
                      <div key={pk} style={{ padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                        <div className="row">
                          <Flag id={nid} size={22} />
                          <b style={{ fontSize: 13.5 }}>{NATION[nid].name}</b>
                          <span className="pill ft-badge">{POT_META[pk].tag}</span>
                          <span style={{ marginLeft: "auto", fontFamily: "var(--disp)", fontSize: 15 }}>{ns.total}</span>
                        </div>
                        <div className="muted tiny" style={{ marginTop: 5 }}>
                          {ns.played} GP - {ns.w}W {ns.d}D {ns.l}L - {ns.gf}-{ns.ga} - {ns.pts} match
                          {state.scoring.bonuses && ns.bonus ? ` +${ns.bonus} bonus` : ""}
                          {ns.champ ? " - CHAMPION" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="muted tiny" style={{ textAlign: "center", marginTop: 16 }}>Tap a team to see each nation's contribution.</div>
    </div>
  );
}

export function TableView({ state, scores, standings, movers, myTeam }: {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  standings: StandingEntry[];
  movers: MoversResult;
  myTeam: Team | null;
}) {
  const [mode, setMode] = useState<"couples" | "groups">("couples");
  const myNations = myTeam?.picks ? POT_KEYS.map(pk => myTeam.picks![pk]) : [];
  return (
    <div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={mode === "couples" ? "on" : ""} onClick={() => setMode("couples")}>Couples</button>
        <button className={mode === "groups" ? "on" : ""} onClick={() => setMode("groups")}>Groups</button>
      </div>
      {mode === "couples"
        ? <><MoverCard movers={movers} state={state} scores={scores} /><Leaderboard state={state} scores={scores} standings={standings} delta={movers.delta} /></>
        : <GroupStandings scores={scores} myNations={myNations as string[]} />}
    </div>
  );
}

function GroupStandings({ scores, myNations }: { scores: Record<string, ScoreEntry>; myNations: string[] }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="muted tiny" style={{ margin: "2px 4px" }}>
        Live World Cup tables - top 2 advance (green), plus the 8 best 3rd-place teams (amber).
      </div>
      {GROUP_LETTERS.map(g => {
        const rows = groupTable(g, scores);
        return (
          <div className="card" key={g} style={{ padding: 14 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="pill" style={{ background: "rgba(255,255,255,.12)", color: "var(--txt)" }}>GROUP {g}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "18px 1fr repeat(5,22px) 30px", gap: 4, alignItems: "center", fontSize: 12 }}>
              <span className="eyebrow" style={{ fontSize: 8 }}></span>
              <span className="eyebrow" style={{ fontSize: 8 }}>TEAM</span>
              {["P", "W", "D", "L", "GD"].map(h => <span key={h} className="eyebrow" style={{ fontSize: 8, textAlign: "center" }}>{h}</span>)}
              <span className="eyebrow" style={{ fontSize: 8, textAlign: "center" }}>PTS</span>
              {rows.map((r, i) => {
                const mine = myNations && myNations.includes(r.id);
                const col = i < 2 ? "var(--lime)" : i === 2 ? "var(--gold)" : "var(--mut2)";
                return (
                  <Fragment key={r.id}>
                    <span style={{ width: 4, height: 18, borderRadius: 2, background: col, justifySelf: "center" }} />
                    <span className="row" style={{ gap: 6, minWidth: 0 }}>
                      <Flag id={r.id} size={17} />
                      <span style={{
                        fontWeight: mine ? 800 : 600,
                        color: mine ? "var(--lime)" : "var(--txt)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12.5,
                      }}>{NATION[r.id].name}</span>
                    </span>
                    <span style={{ textAlign: "center", color: "var(--mut)" }}>{r.p}</span>
                    <span style={{ textAlign: "center", color: "var(--mut)" }}>{r.w}</span>
                    <span style={{ textAlign: "center", color: "var(--mut)" }}>{r.d}</span>
                    <span style={{ textAlign: "center", color: "var(--mut)" }}>{r.l}</span>
                    <span style={{ textAlign: "center", color: "var(--mut)" }}>{r.gd > 0 ? "+" + r.gd : r.gd}</span>
                    <span style={{ textAlign: "center", fontFamily: "var(--disp)", fontSize: 14 }}>{r.pts}</span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
