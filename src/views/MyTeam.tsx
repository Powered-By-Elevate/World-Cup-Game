import { NATION, POT_KEYS, POT_META } from '../data/nations';
import { GROUP_MATCHES_OF } from '../data/fixtures';
import type { Match, KOMatch } from '../data/fixtures';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry } from '../utils/scoring';
import { matchStatus } from '../utils/scoring';
import { Flag } from '../components/Flag';
import { Avatar, teamGradient, Countdown } from '../components/shared';
import { MONTHS, parseDate, dayKeyOf, fmtDayLabel, fmtTime } from '../utils/helpers';

interface Props {
  myTeam: Team;
  state: AppState;
  scores: Record<string, ScoreEntry>;
  standings: StandingEntry[];
  setTab: (tab: string) => void;
  toast: (msg: string) => void;
}

export function MyTeam({ myTeam, state, scores, standings, setTab }: Props) {
  const rank = standings.findIndex(s => s.team.id === myTeam.id) + 1;
  const me = standings.find(s => s.team.id === myTeam.id);
  const myNations = POT_KEYS.map(pk => myTeam.picks?.[pk]).filter(Boolean) as string[];

  type MatchRow = Match & { nid: string; ko?: false };
  type KORow = KOMatch & { nid: string; ko: true };
  type Row = MatchRow | KORow;
  const rows: Row[] = [];
  myNations.forEach(nid => (GROUP_MATCHES_OF[nid] || []).forEach(m => rows.push({ ...m, nid })));
  (state.ko || []).forEach(k => {
    if (myNations.includes(k.h) || myNations.includes(k.a))
      rows.push({ ko: true, ...k, nid: myNations.includes(k.h) ? k.h : k.a });
  });
  rows.sort((a, b) => (a.ko ? "Z" + a.id : a.d).localeCompare(b.ko ? "Z" + b.id : b.d));

  const next = rows.find((r): r is MatchRow =>
    !r.ko && matchStatus(r.d, scores[r.i]) !== "ft" && parseDate(r.d).getTime() > Date.now()
  );

  return (
    <div>
      <div className="hero">
        <div className="hero-glow" style={{ background: teamGradient(myTeam) }} />
        <div className="hero-grain" />
        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.8)" }}>Your team</div>
            <div style={{ fontFamily: "var(--disp)", fontSize: 25, lineHeight: 1, textTransform: "uppercase", marginTop: 5 }}>
              {myTeam.name}
            </div>
          </div>
          {state.draftDone && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--disp)", fontSize: 30, lineHeight: 1 }}>{me?.total ?? 0}</div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.8)" }}>{rank > 0 ? `#${rank} \u00B7 ` : ""}PTS</div>
            </div>
          )}
        </div>
        <div className="flagrow" style={{ marginTop: 16 }}>
          {POT_KEYS.map(pk => myTeam.picks?.[pk] ? (
            <div className="fwrap" key={pk}>
              <Flag id={myTeam.picks[pk]} size={46} radius={7} />
              <div className="fname">{NATION[myTeam.picks[pk]].name}</div>
              <div className="pill" style={{ background: "rgba(0,0,0,.35)", color: "rgba(255,255,255,.85)" }}>{POT_META[pk].tag}</div>
            </div>
          ) : (
            <div className="fwrap" key={pk}>
              <div style={{ width: 46, height: 31, borderRadius: 7, background: "rgba(255,255,255,.15)" }} />
              <div className="fname" style={{ opacity: .6 }}>?</div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16, gap: 6, flexWrap: "wrap" }}>
          {(myTeam.members || []).map(m => (
            <span className="member" key={m.id} style={{ background: "rgba(0,0,0,.3)" }}>
              <Avatar name={m.name} /> {m.name}
            </span>
          ))}
        </div>
      </div>

      {!state.draftDone && (
        <div className="card" style={{ textAlign: "center" }}>
          <div className="h2">The draft hasn't run yet</div>
          <div className="muted tiny" style={{ margin: "8px 0 14px" }}>
            Once everyone's in, run the serpentine draft to assign your 3 nations.
          </div>
          <button className="btn btn-lime" onClick={() => setTab("draft")}>Go to the draft &rarr;</button>
        </div>
      )}

      {state.draftDone && next && (
        <div className="card">
          <div className="row">
            <div className="eyebrow">Next up - {NATION[next.nid].name}</div>
            <div className="pill ft-badge" style={{ marginLeft: "auto" }}><Countdown to={next.d} /></div>
          </div>
          <div className="mrow" style={{ marginTop: 10, cursor: "default" }}>
            <div className="mside"><Flag id={next.h} size={24} /><span className="mname">{NATION[next.h].name}</span></div>
            <div className="mvs">vs</div>
            <div className="mside away"><Flag id={next.a} size={24} /><span className="mname">{NATION[next.a].name}</span></div>
          </div>
          <div className="muted tiny" style={{ marginTop: 8, textAlign: "center" }}>
            {fmtDayLabel(dayKeyOf(next.d))} - {fmtTime(next.d)} - {next.c} - Group {next.g}
          </div>
        </div>
      )}

      {state.draftDone && (
        <div className="card">
          <div className="row" style={{ marginBottom: 4 }}>
            <div className="h2">Your fixtures</div>
            <span className="muted tiny" style={{ marginLeft: "auto" }}>{rows.length} matches</span>
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
            {rows.map((r, idx) => {
              const s = r.ko ? { h: r.h_s, a: r.a_s, st: r.st } : scores[r.i];
              const done = s && (s.st === "ft" || s.st === "live") && s.h != null;
              return (
                <div className="mrow" key={idx} style={{ cursor: "default" }}>
                  <div style={{ width: 30 }}>
                    {r.ko ? (
                      <span className="pill ft-badge">{r.round}</span>
                    ) : (
                      <span className="tiny muted" style={{ fontWeight: 800 }}>
                        {MONTHS[parseDate(r.d).getMonth()]} {parseDate(r.d).getDate()}
                      </span>
                    )}
                  </div>
                  <div className="mside">
                    <Flag id={r.h} size={20} />
                    <span className="mname" style={{ fontWeight: r.h === r.nid ? 800 : 600 }}>{NATION[r.h].name}</span>
                  </div>
                  {done ? <span className="mscore">{s.h}</span> : <span className="mvs">-</span>}
                  {s?.st === "live" ? <span className="pill live-badge">LIVE</span> : done ? <span className="pill ft-badge">FT</span> : <span className="mvs">--</span>}
                  {done ? <span className="mscore">{s.a}</span> : <span className="mvs">-</span>}
                  <div className="mside away">
                    <Flag id={r.a} size={20} />
                    <span className="mname" style={{ fontWeight: r.a === r.nid ? 800 : 600 }}>{NATION[r.a].name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
