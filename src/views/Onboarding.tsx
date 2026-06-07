import { useState } from 'react';
import type { AppState } from '../data/types';
import { teamGradient } from '../components/shared';

interface Props {
  state: AppState;
  defaultName: string;
  onJoin: (teamId: string, playerName: string) => void;
  onCreate: (teamName: string, playerName: string) => void;
}

export function Onboarding({ state, defaultName, onJoin, onCreate }: Props) {
  const [step, setStep] = useState(defaultName ? 1 : 0);
  const [name, setName] = useState(defaultName || "");
  const [teamName, setTeamName] = useState("");
  const teams = state.teams || [];

  return (
    <div style={{ paddingTop: 6 }}>
      <div className="hero" style={{ marginBottom: 16 }}>
        <div className="hero-glow" style={{ background: "linear-gradient(125deg,#C7FF4E 0%,#1fb6c0 55%,#FFC53D 100%)" }} />
        <div className="hero-grain" />
        <div className="eyebrow" style={{ color: "rgba(255,255,255,.85)" }}>USA . CANADA . MEXICO 2026</div>
        <div style={{ fontFamily: "var(--disp)", fontSize: 30, lineHeight: .92, textTransform: "uppercase", marginTop: 8 }}>
          Family<br />Draft
        </div>
        <div style={{ marginTop: 10, fontWeight: 600, maxWidth: 320, color: "rgba(255,255,255,.92)" }}>
          Draft 3 nations. Track every game. Last couple standing wins the World Cup.
        </div>
      </div>

      {step === 0 && (
        <div className="card">
          <div className="eyebrow">Step 1</div>
          <div className="h2" style={{ margin: "6px 0 12px" }}>What's your name?</div>
          <input
            className="input"
            placeholder="e.g. Matt"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && name.trim() && setStep(1)}
          />
          <div style={{ height: 12 }} />
          <button className="btn btn-lime" disabled={!name.trim()} onClick={() => setStep(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <>
          <div className="card">
            <div className="eyebrow">Step 2</div>
            <div className="h2" style={{ margin: "6px 0 4px" }}>Join your couple's team</div>
            <div className="muted tiny" style={{ marginBottom: 12 }}>
              Your partner joins the same team using the shared link.
            </div>
            {teams.length === 0 && (
              <div className="muted tiny" style={{ padding: "6px 0 12px" }}>
                No teams yet -- create the first one below.
              </div>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {teams.map(t => (
                <div key={t.id} className="row" style={{
                  background: "rgba(0,0,0,.22)",
                  border: "1px solid var(--line)",
                  borderRadius: 13,
                  padding: "10px 12px",
                }}>
                  <span style={{ width: 10, height: 28, borderRadius: 4, background: teamGradient(t) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{t.name}</div>
                    <div className="muted tiny">
                      {(t.members || []).map(m => m.name).join(", ") || "empty"}
                    </div>
                  </div>
                  <button className="chip on" onClick={() => onJoin(t.id, name.trim())}>Join</button>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Or start a new team</div>
            <div style={{ height: 8 }} />
            <input
              className="input"
              placeholder="Team name (e.g. Team Gill)"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
            />
            <div style={{ height: 10 }} />
            <button
              className="btn btn-ghost"
              disabled={!teamName.trim()}
              onClick={() => onCreate(teamName.trim(), name.trim())}
            >
              Create team & join
            </button>
          </div>
          <button
            className="chip"
            style={{ margin: "10px auto 0", display: "flex" }}
            onClick={() => setStep(0)}
          >
            &larr; change name
          </button>
        </>
      )}
    </div>
  );
}
