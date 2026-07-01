import { useState } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import { MATCHES, KO_LABEL, KO_SORT_ORDER } from '../data/fixtures';
import type { KOMatch } from '../data/fixtures';
import type { ScoreEntry, Team } from '../data/types';
import { matchStatus } from '../utils/scoring';
import { dayKeyOf, fmtDayLabel, fmtTime, parseDate } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { isOverridden } from '../utils/overrides';
import type { Overrides } from '../utils/overrides';

interface Props {
  scores: Record<string, ScoreEntry>;
  ko: KOMatch[];
  myTeam: Team | null;
  /** Real kickoff dates from the live feed, keyed by fixture id (overrides our placeholder fixture dates). */
  dates?: Record<string, string>;
  /** Nation ids that entered some team's roster via the knockout re-draft. */
  redraftIds?: Set<string>;
  /** Commissioner-only score corrections (a safety valve over the feed). */
  isCommish?: boolean;
  overrides?: Overrides;
  onOverride?: (matchId: string, h: number, a: number, pk?: string) => void;
  onClearOverride?: (matchId: string) => void;
}

interface EditTarget { id: string; hId: string; aId: string; h: number; a: number; ko: boolean; overridden: boolean }

/** Commissioner score-correction dialog — the only place a score can be set by
 *  hand, and only when the feed is wrong. Layered, marked, and reversible. */
function ScoreEditor({ m, onSave, onClear, onClose }: {
  m: EditTarget; onSave: (h: number, a: number, pk?: string) => void; onClear: () => void; onClose: () => void;
}) {
  const [h, setH] = useState(String(m.h));
  const [a, setA] = useState(String(m.a));
  const [adv, setAdv] = useState<'h' | 'a'>('h');
  const hi = Math.max(0, parseInt(h, 10) || 0);
  const ai = Math.max(0, parseInt(a, 10) || 0);
  const drawKO = m.ko && hi === ai;
  const inputStyle = { width: 60, fontSize: 30, fontWeight: 800, textAlign: 'center' as const, border: '2px solid var(--ink)', borderRadius: 12, padding: '6px 0', background: 'var(--paper)' };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(21,18,12,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} className="card pad" style={{ maxWidth: 340, width: '100%', background: 'var(--paper)' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Correct the score</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>Overrides the live feed for this match. Clear it to hand the match back to the feed.</p>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <Flag id={m.hId} size={34} ring="ink" />
            <div style={{ fontWeight: 700, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{NATION[m.hId]?.name || m.hId}</div>
            <input type="number" inputMode="numeric" min={0} value={h} onChange={e => setH(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
          </div>
          <span style={{ fontWeight: 800, opacity: .4 }}>:</span>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <Flag id={m.aId} size={34} ring="ink" />
            <div style={{ fontWeight: 700, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{NATION[m.aId]?.name || m.aId}</div>
            <input type="number" inputMode="numeric" min={0} value={a} onChange={e => setA(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
          </div>
        </div>
        {drawKO && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Who advances (penalties)?</div>
            <div className="seg">
              <button className={adv === 'h' ? 'on' : ''} onClick={() => setAdv('h')}>{NATION[m.hId]?.name || 'Home'}</button>
              <button className={adv === 'a' ? 'on' : ''} onClick={() => setAdv('a')}>{NATION[m.aId]?.name || 'Away'}</button>
            </div>
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 18 }}>
          <button className="btn btn-block" style={{ background: 'var(--lime)' }} onClick={() => onSave(hi, ai, drawKO ? (adv === 'h' ? m.hId : m.aId) : undefined)}>Save correction</button>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          {m.overridden && <button className="btn btn-ghost btn-block" onClick={onClear}>Clear (use feed)</button>}
          <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Small "corrected" chip shown on a match the commissioner has overridden. */
function CorrectedBadge() {
  return <span className="badge" style={{ height: 16, fontSize: 8, background: 'var(--ink)', color: 'var(--paper)' }}><Icon name="edit" size={8} /> corrected</span>;
}

/** Pencil button the commissioner taps to correct a match's score. */
function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Correct this score" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--mut, #9C988C)', display: 'inline-flex' }}>
      <Icon name="edit" size={12} />
    </button>
  );
}

/** One side of a knockout row: a resolved nation, or a muted placeholder slot
 *  (e.g. "Winner Group A") while the draw hasn't filled it yet. */
function KOSide({ id, label, myIds, pen, away, redrafted }: { id: string; label?: string; myIds: string[]; pen?: boolean; away?: boolean; redrafted?: boolean }) {
  const penTag = pen ? <span style={{ fontSize: 11 }}>(P)</span> : null;
  const resolved = !!id && !!NATION[id];
  const flag = (
    <span style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
      <Flag id={id} size={30} ring={myIds.includes(id) ? 'pot' : 'ink'} />
      {redrafted && (
        <span title="Re-drafted nation" style={{ position: 'absolute', bottom: -3, right: -3, width: 14, height: 14, borderRadius: '50%', background: 'var(--ink)', color: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--paper)' }}>
          <Icon name="refresh" size={8} />
        </span>
      )}
    </span>
  );
  const body = resolved
    ? <>{flag}<span className="nm">{NATION[id].name}</span></>
    : <><span className="ko-slot" aria-hidden style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px dashed var(--hair, #C9C2B0)', display: 'inline-block', flex: '0 0 auto' }} /><span className="nm muted" style={{ fontStyle: 'italic' }}>{label || 'TBD'}</span></>;
  return <div className={`side${away ? ' away' : ''}`}>{away ? <>{penTag}{body}</> : <>{body}{penTag}</>}</div>;
}

export function MatchesView({ scores, ko, myTeam, dates = {}, redraftIds, isCommish, overrides, onOverride, onClearOverride }: Props) {
  const [mode, setMode] = useState<'group' | 'ko'>('group');
  const [filter, setFilter] = useState<'all' | 'mine' | 'live'>('all');
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const myIds = myTeam?.picks ? POT_KEYS.map(pk => myTeam.picks![pk]) : [];
  // Knockout highlighting follows the EFFECTIVE roster (re-drafted replacements).
  const koMyIds = myTeam?.picks ? POT_KEYS.map(pk => myTeam.replacements?.[pk] || myTeam.picks![pk]) : [];

  // prefer the live feed's real kickoff date over our placeholder fixture date
  const dOf = (f: { i: string; d: string }) => dates[f.i] || f.d;

  // always present the schedule in true kickoff order, grouped by ET day
  let fx = [...MATCHES].sort((a, b) => parseDate(dOf(a)).getTime() - parseDate(dOf(b)).getTime());
  if (filter === 'mine') fx = fx.filter(f => myIds.includes(f.h) || myIds.includes(f.a));
  if (filter === 'live') fx = fx.filter(f => matchStatus(dOf(f), scores[f.i]) === 'live');
  const days = [...new Set(fx.map(f => dayKeyOf(dOf(f))))].sort();

  return (
    <div className="content">
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}>Group stage</button>
        <button className={mode === 'ko' ? 'on' : ''} onClick={() => setMode('ko')}>Knockouts</button>
      </div>

      {mode === 'group' ? <>
        <div className="scroll-x" style={{ marginBottom: 8 }}>
          {([['all', 'All'], ['mine', 'My nations'], ['live', 'Live now']] as const).map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {k === 'live' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: filter === 'live' ? '#fff' : 'var(--live)' }} />}{l}
            </button>
          ))}
        </div>
        {filter === 'mine' && !myTeam?.picks && (
          <div className="card pad" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 13 }}>Draft first to see your nations.</div></div>
        )}
        {days.map(day => (
          <div key={day}>
            <div className="sec-head" style={{ margin: '18px 2px 9px' }}><span className="eyebrow">{fmtDayLabel(day)}</span></div>
            <div className="card flat" style={{ overflow: 'hidden' }}>
              {fx.filter(f => dayKeyOf(dOf(f)) === day).map(f => {
                const s = scores[f.i];
                const stt = matchStatus(dOf(f), s);
                const done = s && (s.st === 'ft' || s.st === 'live') && s.h != null;
                const mine = myIds.includes(f.h) || myIds.includes(f.a);
                return (
                  <div className={`mrow ${mine ? 'mine' : ''}`} key={f.i}>
                    <div className="side"><Flag id={f.h} size={30} ring={myIds.includes(f.h) ? 'pot' : 'ink'} /><span className="nm">{NATION[f.h].name}</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {done
                        ? <span className="scorebug">{s.h}<span style={{ opacity: .4 }}>:</span>{s.a}</span>
                        : <span className="scorebug sched">{fmtTime(dOf(f)).replace(' ET', '')}</span>}
                      {stt === 'live' && <span className="badge live" style={{ height: 16, fontSize: 8 }}><span className="dot" />LIVE</span>}
                      {done && stt !== 'live' && <span className="badge ft" style={{ height: 16, fontSize: 8 }}>FT</span>}
                      {isOverridden(f.i, overrides) && <CorrectedBadge />}
                      {isCommish && <EditBtn onClick={() => setEdit({ id: f.i, hId: f.h, aId: f.a, h: s?.h ?? 0, a: s?.a ?? 0, ko: false, overridden: isOverridden(f.i, overrides) })} />}
                    </div>
                    <div className="side away"><Flag id={f.a} size={30} ring={myIds.includes(f.a) ? 'pot' : 'ink'} /><span className="nm">{NATION[f.a].name}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {fx.length === 0 && <div className="card pad" style={{ textAlign: 'center' }}><div className="muted">No matches match this filter.</div></div>}
      </> : <>
        {ko.length === 0 && <div className="card pad" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 13 }}>The bracket forms once the group stage wraps.</div></div>}
        {KO_SORT_ORDER.map(rid => {
          const list = ko.filter(k => k.round === rid)
            .sort((a, b) => (a.dt || a.d || '').localeCompare(b.dt || b.d || ''));
          if (!list.length) return null;
          return (
            <div key={rid}>
              <div className="sec-head"><span className="eyebrow">{KO_LABEL[rid]}</span></div>
              <div className="card flat" style={{ overflow: 'hidden' }}>
                {list.map(k => {
                  const done = (k.st === 'ft' || k.st === 'live') && k.h_s != null;
                  const mine = (!!k.h && koMyIds.includes(k.h)) || (!!k.a && koMyIds.includes(k.a));
                  const when = k.dt || k.d;
                  return (
                    <div className={`mrow ${mine ? 'mine' : ''}`} key={k.id}>
                      <KOSide id={k.h} label={k.hRef} myIds={koMyIds} pen={k.pk === k.h} redrafted={!!k.h && redraftIds?.has(k.h)} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        {done
                          ? <span className="scorebug">{k.h_s}<span style={{ opacity: .4 }}>:</span>{k.a_s}</span>
                          : <span className="scorebug sched">{k.dt ? fmtTime(k.dt).replace(' ET', '') : 'vs'}</span>}
                        {!done && when && <span className="eyebrow" style={{ fontSize: 9, color: '#9C988C' }}>{fmtDayLabel(dayKeyOf(when))}</span>}
                        {k.st === 'live' && <span className="badge live" style={{ height: 16, fontSize: 8 }}><span className="dot" />LIVE</span>}
                        {isOverridden(k.id, overrides) && <CorrectedBadge />}
                        {isCommish && k.h && k.a && <EditBtn onClick={() => setEdit({ id: k.id, hId: k.h, aId: k.a, h: k.h_s ?? 0, a: k.a_s ?? 0, ko: true, overridden: isOverridden(k.id, overrides) })} />}
                      </div>
                      <KOSide id={k.a} label={k.aRef} myIds={koMyIds} pen={k.pk === k.a} redrafted={!!k.a && redraftIds?.has(k.a)} away />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>}

      {edit && (
        <ScoreEditor
          m={edit}
          onSave={(h, a, pk) => { onOverride?.(edit.id, h, a, pk); setEdit(null); }}
          onClear={() => { onClearOverride?.(edit.id); setEdit(null); }}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
