import { useState, useEffect, useRef } from 'react';
import { NATION, NATIONS, POT_KEYS } from '../data/nations';
import type { AppState } from '../data/types';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Confetti, PotTag, POT_OF } from '../components/shared';

interface Props {
  state: AppState;
  isCommish: boolean;
  commishName: string | null;
  onRunDraft: () => void;
  onReset: () => void;
  onMovePot: (nationId: string, target: string | null) => void;
  toast: (msg: string) => void;
}

function unassignedNations(pots: Record<string, string[]>) {
  return NATIONS.filter(n => !POT_KEYS.some(pk => (pots[pk] || []).includes(n.id))).map(n => n.id);
}

export function DraftView({ state, isCommish, commishName, onRunDraft, onReset, onMovePot }: Props) {
  const teams = state.teams || [];
  const board = state.board || [];
  const pots = state.pots;
  const [reveal, setReveal] = useState(state.draftDone ? board.length : 0);
  const [editPot, setEditPot] = useState<string | null>(null);
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
      }, 820);
      return () => clearInterval(iv);
    }
    if (state.draftDone && played.current) setReveal(board.length);
  }, [state.draftDone, board.length]);

  const teamName = (id: string) => teams.find(t => t.id === id)?.name || '';
  const minPot = Math.min(...POT_KEYS.map(pk => (pots[pk] || []).length));
  const canRun = isCommish && teams.length >= 1 && teams.length <= minPot;
  const unassigned = unassignedNations(pots);

  /* ---- RUNNING / DONE (draft is done) ---- */
  if (state.draftDone) {
    const running = reveal < board.length;
    const current = board[Math.min(reveal, board.length - 1)];
    return (
      <div className="content">
        {running ? (
          <div className="reveal-stage onclock">
            <div className="eyebrow" style={{ color: 'var(--lime)', letterSpacing: '.3em' }}>● On the clock</div>
            <div className="display" style={{ fontSize: 18, color: '#9C988C', marginTop: 14 }}>{teamName(current.teamId)}</div>
            <div className="pop" key={reveal} style={{ margin: '14px 0 4px' }}>
              <Flag id={current.nationId} size={104} ring="pot" />
            </div>
            <div className="display pop" key={'n' + reveal} style={{ fontSize: 40, color: 'var(--paper)', marginTop: 8 }}>{NATION[current.nationId].name}</div>
            <div style={{ marginTop: 10 }}><PotTag pot={current.pot} /></div>
            <div className="row" style={{ justifyContent: 'center', gap: 5, marginTop: 20, flexWrap: 'wrap' }}>
              {board.map((_, i) => <span key={i} style={{ width: i < reveal ? 18 : 7, height: 7, borderRadius: 4, background: i < reveal ? 'var(--lime)' : 'rgba(255,255,255,.2)', transition: 'all .3s' }} />)}
            </div>
          </div>
        ) : (
          <div className="card pad" style={{ textAlign: 'center', background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)', position: 'relative', overflow: 'hidden' }}>
            <Confetti />
            <div style={{ fontSize: 34 }}>🎉</div>
            <div className="display" style={{ fontSize: 28, color: 'var(--lime)', marginTop: 6 }}>Draft complete</div>
            <p className="muted" style={{ color: '#9C988C', fontSize: 14, margin: '8px 0 0' }}>Every couple has their three nations. Let the games begin.</p>
          </div>
        )}

        <div className="sec-head"><span className="eyebrow">{running ? 'Draft board' : 'Final board'}</span><span className="muted" style={{ fontSize: 12 }}>{reveal} / {board.length}</span></div>
        <div className="card flat" style={{ overflow: 'hidden' }}>
          {board.slice(0, reveal).reverse().map((p) => (
            <div className="tick" key={p.pickNo}>
              <span className="num" style={{ fontSize: 20, color: 'var(--mut-2)', width: 30 }}>{String(p.pickNo).padStart(2, '0')}</span>
              <Flag id={p.nationId} size={34} ring="pot" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{NATION[p.nationId].name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{teamName(p.teamId)}</div>
              </div>
              <PotTag pot={p.pot} />
            </div>
          ))}
        </div>

        {isCommish && !running && (
          <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }}
            onClick={() => { if (confirm('Re-draft? This clears the current assignments for everyone.')) { played.current = false; onReset(); } }}>
            Re-draft
          </button>
        )}
      </div>
    );
  }

  /* ---- PRE-DRAFT ---- */
  return (
    <div className="content">
      <div className="card pad">
        <div className="row" style={{ gap: 10, marginBottom: 10 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--lime)', border: '1.5px solid var(--ink)', display: 'grid', placeItems: 'center' }}><Icon name="bolt" size={22} /></span>
          <div><div className="eyebrow">The format</div><h2 className="h2" style={{ fontSize: 20 }}>Serpentine draft</h2></div>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 4px' }}>
          Each couple is randomly dealt <b>three nations</b> — one Favorite, one Underdog, one Longshot. The order snakes back and forth so it's fair. It's over in seconds, and it's the best 30 seconds of the tournament.
        </p>
        <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
          <span className="chip"><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--gold)' }} />Favorites</span>
          <span className="chip"><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--cyan)' }} />Underdogs</span>
          <span className="chip"><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--magenta)' }} />Longshots</span>
        </div>
        {teams.length > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>
            Drafting: {teams.map(t => t.name).join(' · ')}
          </div>
        )}
      </div>

      {isCommish ? (
        <button className="btn btn-lime btn-block" style={{ marginTop: 14, height: 62, fontSize: 17, boxShadow: '0 5px 0 var(--ink)' }}
          disabled={!canRun} onClick={() => { played.current = false; onRunDraft(); }}>
          <Icon name="bolt" size={22} />
          {teams.length < 1 ? 'Need at least 1 team' : teams.length > minPot ? `A pot only has ${minPot} nations` : 'Run the draft'}
        </button>
      ) : (
        <div className="card pad" style={{ marginTop: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
          <div style={{ fontWeight: 800 }}>Waiting for the commissioner</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{commishName ? `${commishName} 👑` : 'The commissioner'} runs the draft when everyone's in.</div>
        </div>
      )}

      {/* pot editor */}
      <div className="sec-head"><span className="eyebrow">The pots</span>{isCommish && <span className="muted" style={{ fontSize: 12 }}>tap a nation to move it</span>}</div>
      {POT_KEYS.map(pk => {
        const nats = pots[pk] || [];
        const short = nats.length < teams.length;
        return (
          <div key={pk} className="card flat pad" style={{ marginBottom: 10 }}>
            <div className="between" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8 }}><span className={`pot ${POT_OF[pk].cls}`}>{POT_OF[pk].tag}</span><span style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 16 }}>{POT_OF[pk].label}s</span></div>
              <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: short ? 'var(--live)' : 'var(--mut)' }}>{nats.length}</span>
            </div>
            {nats.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>empty — add nations below</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 6px' }}>
                {nats.map(id => (
                  <button key={id} onClick={() => isCommish && setEditPot(id)} style={{ border: 0, background: 'transparent', cursor: isCommish ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <Flag id={id} size={42} ring="pot" />
                    <span style={{ fontSize: 10.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{NATION[id].name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="card flat pad" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
        <div className="eyebrow">Not in the draft</div>
        {unassigned.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Every nation is in a pot.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 6px', marginTop: 12 }}>
            {unassigned.map(id => (
              <button key={id} onClick={() => isCommish && setEditPot(id)} style={{ border: 0, background: 'transparent', cursor: isCommish ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: .85 }}>
                <Flag id={id} size={42} ring="ink" />
                <span style={{ fontSize: 10.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{NATION[id].name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* move sheet */}
      {editPot && (
        <div className="modal-bg" onClick={() => setEditPot(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ padding: '0 18px 26px' }}>
            <div className="sheet-grab" />
            <div className="row" style={{ gap: 11, padding: '8px 0 16px' }}>
              <Flag id={editPot} size={52} ring="pot" />
              <div><div className="display" style={{ fontSize: 22 }}>{NATION[editPot].name}</div><div style={{ marginTop: 4 }}><PotTag pot={NATION[editPot].pot} /></div></div>
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{POT_KEYS.find(pk => pots[pk]?.includes(editPot)) ? 'Move to' : 'Add to a pot'}</div>
            {POT_KEYS.filter(p => !pots[p]?.includes(editPot)).map(p => (
              <button key={p} className="btn btn-ghost btn-block" style={{ marginBottom: 8, justifyContent: 'space-between' }}
                onClick={() => { onMovePot(editPot, p); setEditPot(null); }}>
                <span>{POT_OF[p].label}s</span><span className={`pot ${POT_OF[p].cls}`}>{POT_OF[p].tag}</span>
              </button>
            ))}
            {POT_KEYS.some(pk => pots[pk]?.includes(editPot)) && (
              <button className="btn btn-ghost btn-block" style={{ marginTop: 4, color: 'var(--live)', borderColor: 'var(--live)' }}
                onClick={() => { onMovePot(editPot, null); setEditPot(null); }}>Pull out of the draft</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
