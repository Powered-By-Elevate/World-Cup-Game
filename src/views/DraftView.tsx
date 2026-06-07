import { useState, useEffect, useRef } from 'react';
import { NATION, NATIONS, POT_KEYS, POT_META } from '../data/nations';
import type { AppState } from '../data/types';
import { Flag } from '../components/Flag';
import { Icon, ICONS } from '../components/Icon';

function unassignedNations(pots: Record<string, string[]>) {
  return NATIONS.filter(n => !POT_KEYS.some(pk => (pots[pk] || []).includes(n.id))).map(n => n.id);
}

function PotMenu({ nationId, pots, onMove, onClose }: {
  nationId: string;
  pots: Record<string, string[]>;
  onMove: (target: string | null) => void;
  onClose: () => void;
}) {
  const cur = POT_KEYS.find(pk => (pots[pk] || []).includes(nationId));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <Flag id={nationId} size={30} radius={6} />
          <div className="h2">{NATION[nationId].name}</div>
          <button className="wc-hbtn" style={{ marginLeft: "auto" }} onClick={onClose}>&#10005;</button>
        </div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>{cur ? "Move to a different pot" : "Add to a pot"}</div>
        <div style={{ display: "grid", gap: 8 }}>
          {POT_KEYS.map(pk => (
            <button key={pk} className="btn btn-ghost" disabled={pk === cur}
              style={{ justifyContent: "flex-start", gap: 10, opacity: pk === cur ? .45 : 1 }}
              onClick={() => { onMove(pk); onClose(); }}>
              <span className="pill" style={{ background: POT_META[pk].accent, color: "#0a0f08" }}>{POT_META[pk].tag}</span>
              {POT_META[pk].label}{pk === cur ? " - current" : ""}
            </button>
          ))}
          {cur && (
            <button className="btn btn-ghost"
              style={{ color: "var(--live)", borderColor: "rgba(255,77,77,.4)", justifyContent: "flex-start" }}
              onClick={() => { onMove(null); onClose(); }}>
              Remove from the draft
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  state: AppState;
  isCommish: boolean;
  commishName: string | null;
  onRunDraft: () => void;
  onReset: () => void;
  onMovePot: (nationId: string, target: string | null) => void;
  toast: (msg: string) => void;
}

export function DraftView({ state, isCommish, commishName, onRunDraft, onReset, onMovePot }: Props) {
  const teams = state.teams || [];
  const board = state.board || [];
  const pots = state.pots;
  const [reveal, setReveal] = useState(state.draftDone ? 0 : -1);
  const [editPots, setEditPots] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const played = useRef(false);

  useEffect(() => {
    if (state.draftDone && board.length && !played.current) {
      played.current = true;
      setReveal(0);
      let n = 0;
      const iv = setInterval(() => {
        n++;
        setReveal(n);
        if (n >= board.length) clearInterval(iv);
      }, 620);
      return () => clearInterval(iv);
    }
    if (state.draftDone && played.current) setReveal(board.length);
  }, [state.draftDone, board.length]);

  const shown = reveal < 0 ? 0 : reveal;
  const current = board[shown];
  const minPot = Math.min(...POT_KEYS.map(pk => (pots[pk] || []).length));
  const enoughTeams = teams.length >= 1;
  const enoughNations = teams.length <= minPot;
  const canRun = isCommish && enoughTeams && enoughNations;
  const unassigned = unassignedNations(pots);

  if (!state.draftDone) {
    return (
      <div>
        <div className="card">
          <div className="eyebrow">The draw</div>
          <div className="h2" style={{ margin: "6px 0 8px" }}>Serpentine draft</div>
          <div className="muted tiny">
            Each team is randomly assigned <b style={{ color: "var(--txt)" }}>one nation from each pot</b>.
            Snake order means pick #1 in round one drafts last in round two -- luck of the draw, fair for everyone.
          </div>
          <div style={{ height: 14 }} />
          {isCommish ? (
            <>
              <button className="btn btn-lime" disabled={!canRun}
                onClick={() => { played.current = false; onRunDraft(); }}>
                <Icon d={ICONS.draft} size={18} />
                {!enoughTeams ? "Need at least 1 team" : !enoughNations
                  ? `A pot only has ${minPot} nations`
                  : `Run the draft \u00B7 ${teams.length} team${teams.length > 1 ? "s" : ""}`}
              </button>
              {enoughTeams && !enoughNations && (
                <div className="muted tiny" style={{ marginTop: 8, textAlign: "center" }}>
                  Each pot needs at least {teams.length} nations for {teams.length} teams.
                </div>
              )}
            </>
          ) : (
            <div className="onclock" style={{ padding: 16 }}>
              <div className="eyebrow">Locked</div>
              <div style={{ fontWeight: 700, marginTop: 6 }}>
                Only the commissioner{commishName ? <> (<b style={{ color: "var(--lime)" }}>{commishName}</b>)</> : ""} can start the draft.
              </div>
            </div>
          )}
          {teams.length > 0 && (
            <div className="muted tiny" style={{ marginTop: 10, textAlign: "center" }}>
              Drafting: {teams.map(t => t.name).join(" \u00B7 ")}
            </div>
          )}
        </div>

        {isCommish && (
          <button className="chip" style={{ margin: "0 auto 12px", display: "flex" }}
            onClick={() => setEditPots(v => !v)}>
            {editPots ? "Done editing pots" : "Customize pots"}
          </button>
        )}

        {POT_KEYS.map(pk => {
          const ids = pots[pk] || [];
          const short = ids.length < teams.length;
          return (
            <div className="card" key={pk}>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="pill" style={{ background: POT_META[pk].accent, color: "#0a0f08" }}>{POT_META[pk].tag}</span>
                <div className="h2">{POT_META[pk].label}</div>
                <span className="tiny" style={{ marginLeft: "auto", fontWeight: 800, color: short ? "var(--live)" : "var(--mut)" }}>
                  {ids.length} nations
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ids.map(id => (
                  <span key={id} className="member"
                    style={editPots ? { cursor: "pointer", borderColor: "var(--line2)" } : {}}
                    onClick={editPots ? () => setMenu(id) : undefined}>
                    <Flag id={id} size={18} /> {NATION[id].name}
                    {editPots && <span style={{ color: "var(--mut2)", fontWeight: 800 }}> ...</span>}
                  </span>
                ))}
                {ids.length === 0 && <span className="muted tiny">empty -- add nations below</span>}
              </div>
            </div>
          );
        })}

        {(editPots || unassigned.length > 0) && (
          <div className="card" style={{ borderStyle: "dashed" }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="h2" style={{ color: "var(--mut)" }}>Not in the draft</div>
              <span className="tiny muted" style={{ marginLeft: "auto", fontWeight: 800 }}>{unassigned.length}</span>
            </div>
            {unassigned.length === 0 ? (
              <div className="muted tiny">All 48 nations are in a pot.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {unassigned.map(id => (
                  <span key={id} className="member"
                    style={{ cursor: editPots ? "pointer" : "default", opacity: .8 }}
                    onClick={editPots ? () => setMenu(id) : undefined}>
                    <Flag id={id} size={18} /> {NATION[id].name}
                    {editPots && <span style={{ color: "var(--lime)", fontWeight: 800 }}> +</span>}
                  </span>
                ))}
              </div>
            )}
            {editPots && (
              <div className="muted tiny" style={{ marginTop: 10 }}>
                Tap any nation to move it between pots or pull it out of the draft.
              </div>
            )}
          </div>
        )}

        {menu && <PotMenu nationId={menu} pots={pots} onMove={(t) => onMovePot(menu, t)} onClose={() => setMenu(null)} />}
      </div>
    );
  }

  return (
    <div>
      {shown < board.length ? (
        <div className="onclock">
          <div className="eyebrow">{current ? `Pick ${current.pickNo} of ${board.length}` : "Starting..."}</div>
          {current && (
            <>
              <div className="big">{teams.find(t => t.id === current.teamId)?.name}</div>
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                <Flag id={current.nationId} size={40} radius={7} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{NATION[current.nationId].name}</div>
                  <span className="pill" style={{ background: POT_META[current.pot].accent, color: "#0a0f08" }}>
                    {POT_META[current.pot].tag} - {POT_META[current.pot].label}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28 }}>&#127881;</div>
          <div className="h2" style={{ margin: "4px 0" }}>Draft complete</div>
          <div className="muted tiny">Everyone's locked in. Head to Matches to start tracking.</div>
        </div>
      )}

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Draft board</div>
        <div style={{ display: "grid", gap: 8 }}>
          {board.slice(0, shown + 1).reverse().map(b => (
            <div className="tick" key={b.pickNo}>
              <span className="pno">{String(b.pickNo).padStart(2, "0")}</span>
              <Flag id={b.nationId} size={26} radius={5} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{NATION[b.nationId].name}</div>
                <div className="muted tiny">{teams.find(t => t.id === b.teamId)?.name}</div>
              </div>
              <span className="pill" style={{ background: POT_META[b.pot].accent, color: "#0a0f08" }}>{POT_META[b.pot].tag}</span>
            </div>
          ))}
        </div>
      </div>

      {isCommish && (
        <button className="chip" style={{ margin: "4px auto 0", display: "flex" }}
          onClick={() => { if (confirm("Re-draft? This clears the current assignments for everyone.")) { played.current = false; onReset(); } }}>
          Re-draft
        </button>
      )}
    </div>
  );
}
