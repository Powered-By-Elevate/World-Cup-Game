import { useState } from 'react';
import type { AppState, MeState, Scoring, Team } from '../data/types';
import { HAS_REAL } from '../utils/storage';
import { clamp } from '../utils/helpers';

interface Props {
  state: AppState;
  myTeam: Team | null;
  me: MeState | null;
  isCommish: boolean;
  commishName: string | null;
  onClose: () => void;
  onScoring: (sc: Scoring) => void;
  onLeave: () => void;
  onRename: (name: string) => void;
  onClaim: () => void;
}

export function Settings({ state, myTeam, isCommish, commishName, onClose, onScoring, onLeave, onRename, onClaim }: Props) {
  const sc = state.scoring;
  const [name, setName] = useState(myTeam?.name || "");

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="h2">Settings</div>
          <button className="wc-hbtn" style={{ marginLeft: "auto" }} onClick={onClose}>&#10005;</button>
        </div>

        <div className="eyebrow">Scoring</div>
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>Win</span>
            <div className="stepper">
              <button onClick={() => onScoring({ ...sc, win: clamp(sc.win - 1, 0, 9) })}>-</button>
              <b>{sc.win}</b>
              <button onClick={() => onScoring({ ...sc, win: clamp(sc.win + 1, 0, 9) })}>+</button>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
            <span style={{ fontWeight: 700 }}>Draw</span>
            <div className="stepper">
              <button onClick={() => onScoring({ ...sc, draw: clamp(sc.draw - 1, 0, 9) })}>-</button>
              <b>{sc.draw}</b>
              <button onClick={() => onScoring({ ...sc, draw: clamp(sc.draw + 1, 0, 9) })}>+</button>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <div>
              <div style={{ fontWeight: 700 }}>Round bonuses</div>
              <div className="muted tiny">reward reaching R16, QF, SF...</div>
            </div>
            <span className={"chip " + (sc.bonuses ? "on" : "")} onClick={() => onScoring({ ...sc, bonuses: !sc.bonuses })}>
              {sc.bonuses ? "ON" : "OFF"}
            </span>
          </div>
          {sc.bonuses && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {([["R32", "Reach R32"], ["R16", "Reach R16"], ["QF", "Reach QF"], ["SF", "Reach SF"], ["Final", "Reach Final"], ["CHAMP", "Win the Cup"]] as const).map(([k, lab]) => (
                <div className="row" key={k} style={{ justifyContent: "space-between" }}>
                  <span className="tiny" style={{ fontWeight: 700 }}>{lab}</span>
                  <div className="stepper">
                    <button onClick={() => onScoring({ ...sc, b: { ...sc.b, [k]: clamp(sc.b[k] - 1, 0, 50) } })}>-</button>
                    <b>{sc.b[k]}</b>
                    <button onClick={() => onScoring({ ...sc, b: { ...sc.b, [k]: clamp(sc.b[k] + 1, 0, 50) } })}>+</button>
                  </div>
                </div>
              ))}
              <div className="muted tiny">Bonuses are cumulative milestones -- a nation that reaches the final earns every step up to it.</div>
            </div>
          )}
        </div>

        {myTeam && (
          <>
            <div className="eyebrow" style={{ marginTop: 18 }}>Commissioner</div>
            <div className="card" style={{ marginTop: 8 }}>
              <div className="tiny" style={{ fontWeight: 600 }}>
                {commishName ? "The commissioner runs the draft & edits the pots." : "No commissioner yet -- claim it to control the draft."}
              </div>
              {isCommish && commishName
                ? <div className="muted tiny" style={{ marginTop: 8 }}>That's you</div>
                : <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { onClaim(); onClose(); }}>
                    {commishName ? <>Take over from {commishName}</> : "Become commissioner"}
                  </button>
              }
            </div>

            <div className="eyebrow" style={{ marginTop: 18 }}>Your team</div>
            <div className="card" style={{ marginTop: 8 }}>
              <input className="input" value={name} onChange={e => setName(e.target.value)} />
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-ghost" onClick={() => { onRename(name.trim()); onClose(); }} disabled={!name.trim()}>
                  Rename team
                </button>
                <button className="btn btn-ghost" style={{ color: "var(--live)", borderColor: "rgba(255,77,77,.4)" }}
                  onClick={() => { if (confirm("Leave this team?")) { onLeave(); onClose(); } }}>
                  Leave team
                </button>
              </div>
            </div>
          </>
        )}

        <div className="muted tiny" style={{ marginTop: 18, textAlign: "center" }}>
          {HAS_REAL ? "Synced live for everyone with the link." : "Preview mode -- publish & share the link for live multiplayer."}
        </div>
      </div>
    </div>
  );
}
