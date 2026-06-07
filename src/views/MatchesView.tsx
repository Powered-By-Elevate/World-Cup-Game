import { useState } from 'react';
import { NATION, NATIONS, POT_KEYS } from '../data/nations';
import { MATCHES, KO_ROUNDS, KO_LABEL, KO_SORT_ORDER } from '../data/fixtures';
import type { KOMatch } from '../data/fixtures';
import type { AppState, ScoreEntry, Team } from '../data/types';
import { matchStatus } from '../utils/scoring';
import { Flag } from '../components/Flag';
import { uid, clamp, dayKeyOf, fmtDayLabel, fmtTime } from '../utils/helpers';

function MatchEditor({ m, ko, score, onSave, onClose }: {
  m: { h: string; a: string };
  ko?: KOMatch;
  score?: ScoreEntry | null;
  onSave: (v: { h: number; a: number; st: string; pk: string | null }) => void;
  onClose: () => void;
}) {
  const [h, setH] = useState(score?.h ?? 0);
  const [a, setA] = useState(score?.a ?? 0);
  const [stt, setStt] = useState(score?.st || "ft");
  const [pk, setPk] = useState(ko?.pk || m.h);
  const isKo = !!ko;
  const levelKo = isKo && ko!.round !== "3rd" && h === a && stt === "ft";

  return (
    <div className="card" style={{ marginTop: 7, borderColor: "var(--line2)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 7 }}><Flag id={m.h} size={20} /><b className="tiny">{NATION[m.h].name}</b></div>
        <div className="stepper">
          <button onClick={() => setH(clamp(h - 1, 0, 30))}>-</button><b>{h}</b>
          <button onClick={() => setH(clamp(h + 1, 0, 30))}>+</button>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 9 }}>
        <div className="row" style={{ gap: 7 }}><Flag id={m.a} size={20} /><b className="tiny">{NATION[m.a].name}</b></div>
        <div className="stepper">
          <button onClick={() => setA(clamp(a - 1, 0, 30))}>-</button><b>{a}</b>
          <button onClick={() => setA(clamp(a + 1, 0, 30))}>+</button>
        </div>
      </div>
      <div className="seg" style={{ marginTop: 12 }}>
        {[["sched", "Scheduled"], ["live", "Live"], ["ft", "Final"]].map(([v, lab]) => (
          <button key={v} className={stt === v ? "on" : ""} onClick={() => setStt(v)}>{lab}</button>
        ))}
      </div>
      {levelKo && (
        <div style={{ marginTop: 10 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Won on penalties</div>
          <div className="seg">
            <button className={pk === m.h ? "on" : ""} onClick={() => setPk(m.h)}>{NATION[m.h].name}</button>
            <button className={pk === m.a ? "on" : ""} onClick={() => setPk(m.a)}>{NATION[m.a].name}</button>
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-lime" onClick={() => onSave({ h, a, st: stt, pk: levelKo ? pk : null })}>Save score</button>
      </div>
    </div>
  );
}

function KnockoutPanel({ state, myNations, onAddKO, onSaveKO, onDelKO, toast }: {
  state: AppState;
  myNations: string[];
  onAddKO: (k: KOMatch) => void;
  onSaveKO: (id: string, v: any) => void;
  onDelKO: (id: string) => void;
  toast: (msg: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [round, setRound] = useState("R32");
  const [home, setHome] = useState("BRA");
  const [away, setAway] = useState("ARG");
  const [editing, setEditing] = useState<string | null>(null);
  const ko = state.ko || [];
  const sorted = [...ko].sort((a, b) => KO_SORT_ORDER.indexOf(a.round) - KO_SORT_ORDER.indexOf(b.round));

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="muted tiny">
          Knockouts begin <b style={{ color: "var(--txt)" }}>June 28</b>. As matchups are set, add them here -- round bonuses kick in automatically the moment a nation appears in a round.
        </div>
        <div style={{ height: 12 }} />
        {!adding ? (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>+ Add a knockout match</button>
        ) : (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Round</div>
            <select className="sel" value={round} onChange={e => setRound(e.target.value)}>
              {KO_ROUNDS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <select className="sel" value={home} onChange={e => setHome(e.target.value)}>
                {NATIONS.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <span className="mvs">v</span>
              <select className="sel" value={away} onChange={e => setAway(e.target.value)}>
                {NATIONS.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-lime" disabled={home === away}
                onClick={() => {
                  onAddKO({ id: uid(), round, h: home, a: away, h_s: null, a_s: null, st: "sched", pk: null });
                  setAdding(false);
                  toast("Match added");
                }}>Add match</button>
            </div>
          </div>
        )}
      </div>

      {sorted.length === 0 && (
        <div className="muted tiny" style={{ textAlign: "center", padding: 14 }}>No knockout matches yet.</div>
      )}
      {KO_SORT_ORDER.map(rid => {
        const list = sorted.filter(k => k.round === rid);
        if (!list.length) return null;
        return (
          <div key={rid}>
            <div className="daterow">
              <span className="dl">{KO_LABEL[rid]}</span>
              <span className="hr" />
              <span className="muted tiny">{KO_ROUNDS.find(r => r.id === rid)?.when}</span>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {list.map(k => {
                const done = (k.st === "ft" || k.st === "live") && k.h_s != null;
                const mine = myNations.includes(k.h) || myNations.includes(k.a);
                return (
                  <div key={k.id}>
                    <div className="mrow" onClick={() => setEditing(editing === k.id ? null : k.id)}
                      style={mine ? { borderColor: "rgba(199,255,78,.35)" } : {}}>
                      <div className="mside"><Flag id={k.h} size={22} /><span className="mname">{NATION[k.h].name}</span></div>
                      {done ? <span className="mscore">{k.h_s}</span> : <span className="mvs">-</span>}
                      {k.st === "live" ? <span className="pill live-badge">LIVE</span> : done ? <span className="pill ft-badge">FT{k.pk ? " (p)" : ""}</span> : <span className="mvs">vs</span>}
                      {done ? <span className="mscore">{k.a_s}</span> : <span className="mvs" style={{ minWidth: 12 }} />}
                      <div className="mside away"><Flag id={k.a} size={22} /><span className="mname">{NATION[k.a].name}</span></div>
                    </div>
                    {editing === k.id && (
                      <>
                        <MatchEditor m={{ h: k.h, a: k.a }} ko={k}
                          score={{ h: k.h_s, a: k.a_s, st: k.st }}
                          onClose={() => setEditing(null)}
                          onSave={(v) => { onSaveKO(k.id, { h_s: v.h, a_s: v.a, st: v.st, pk: v.pk }); setEditing(null); toast("Score saved"); }} />
                        <button className="chip" style={{ margin: "6px auto 0", display: "flex" }}
                          onClick={() => { if (confirm("Delete this match?")) { onDelKO(k.id); setEditing(null); } }}>
                          delete match
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  myTeam: Team | null;
  onSaveScore: (id: string, v: ScoreEntry) => void;
  onAddKO: (k: KOMatch) => void;
  onSaveKO: (id: string, v: any) => void;
  onDelKO: (id: string) => void;
  toast: (msg: string) => void;
}

export function MatchesView({ state, scores, myTeam, onSaveScore, onAddKO, onSaveKO, onDelKO, toast }: Props) {
  const [filter, setFilter] = useState<"all" | "mine" | "live">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [section, setSection] = useState<"group" | "ko">("group");
  const myNations = myTeam?.picks ? POT_KEYS.map(pk => myTeam.picks![pk]) : [];

  const filtered = MATCHES.filter(m => {
    if (filter === "mine") return myNations.includes(m.h) || myNations.includes(m.a);
    if (filter === "live") return matchStatus(m.d, scores[m.i]) === "live";
    return true;
  });

  const byDay: Record<string, typeof MATCHES> = {};
  filtered.forEach(m => { (byDay[dayKeyOf(m.d)] ||= []).push(m); });
  const days = Object.keys(byDay).sort();

  return (
    <div>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={section === "group" ? "on" : ""} onClick={() => setSection("group")}>Group stage</button>
        <button className={section === "ko" ? "on" : ""} onClick={() => setSection("ko")}>Knockouts</button>
      </div>

      {section === "group" && (
        <>
          <div className="row" style={{ gap: 7, marginBottom: 6 }}>
            {([["all", "All"], ["mine", "My nations"], ["live", "Live now"]] as const).map(([v, lab]) => (
              <span key={v} className={"chip " + (filter === v ? "on" : "")} onClick={() => setFilter(v)}>{lab}</span>
            ))}
          </div>
          {filter === "mine" && !myTeam?.picks && (
            <div className="muted tiny" style={{ padding: 8 }}>Draft first to filter your nations.</div>
          )}
          {days.map(key => (
            <div key={key}>
              <div className="daterow">
                <span className="dl">{fmtDayLabel(key)}</span>
                <span className="hr" />
              </div>
              <div style={{ display: "grid", gap: 7 }}>
                {byDay[key].map(m => {
                  const s = scores[m.i];
                  const stt = matchStatus(m.d, s);
                  const done = s && (s.st === "ft" || s.st === "live") && s.h != null;
                  const mine = myNations.includes(m.h) || myNations.includes(m.a);
                  return (
                    <div key={m.i}>
                      <div className="mrow" onClick={() => setEditing(editing === m.i ? null : m.i)}
                        style={mine ? { borderColor: "rgba(199,255,78,.35)" } : {}}>
                        <div className="mside"><Flag id={m.h} size={22} /><span className="mname">{NATION[m.h].name}</span></div>
                        {done ? <span className="mscore">{s.h}</span> : <span className="mvs">{fmtTime(m.d).replace(" ET", "")}</span>}
                        {stt === "live" ? <span className="pill live-badge">LIVE</span> : done ? <span className="pill ft-badge">FT</span> : <span className="mvs">vs</span>}
                        {done ? <span className="mscore">{s.a}</span> : <span className="mvs" style={{ minWidth: 12 }} />}
                        <div className="mside away"><Flag id={m.a} size={22} /><span className="mname">{NATION[m.a].name}</span></div>
                      </div>
                      {editing === m.i && (
                        <>
                          <MatchEditor m={m} score={s}
                            onClose={() => setEditing(null)}
                            onSave={(v) => { onSaveScore(m.i, { h: v.h, a: v.a, st: v.st }); setEditing(null); toast("Score saved"); }} />
                          <div className="muted tiny" style={{ textAlign: "center", marginTop: 4 }}>
                            {m.c} - Group {m.g} - {fmtTime(m.d)}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {section === "ko" && (
        <KnockoutPanel
          state={state}
          myNations={myNations as string[]}
          onAddKO={onAddKO}
          onSaveKO={onSaveKO}
          onDelKO={onDelKO}
          toast={toast}
        />
      )}
    </div>
  );
}
