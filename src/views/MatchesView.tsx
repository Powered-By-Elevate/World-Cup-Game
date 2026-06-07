import { useState } from 'react';
import { NATION, NATIONS, POT_KEYS } from '../data/nations';
import { MATCHES, KO_ROUNDS, KO_LABEL, KO_SORT_ORDER } from '../data/fixtures';
import type { Match, KOMatch } from '../data/fixtures';
import type { AppState, ScoreEntry, Team } from '../data/types';
import { matchStatus } from '../utils/scoring';
import { uid, clamp, dayKeyOf, fmtDayLabel, fmtTime } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';

function Stepper({ v, set }: { v: number; set: (n: number) => void }) {
  return (
    <div className="stepper">
      <button onClick={() => set(clamp(v - 1, 0, 30))}>–</button>
      <span className="val">{v}</span>
      <button onClick={() => set(clamp(v + 1, 0, 30))}>+</button>
    </div>
  );
}

interface Props {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  myTeam: Team | null;
  onSaveScore: (id: string, v: ScoreEntry) => void;
  onAddKO: (k: KOMatch) => void;
  onSaveKO: (id: string, v: Partial<KOMatch>) => void;
  onDelKO: (id: string) => void;
  toast: (msg: string) => void;
}

export function MatchesView({ state, scores, myTeam, onSaveScore, onAddKO, onSaveKO, onDelKO, toast }: Props) {
  const [mode, setMode] = useState<'group' | 'ko'>('group');
  const [filter, setFilter] = useState<'all' | 'mine' | 'live'>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const myIds = myTeam?.picks ? POT_KEYS.map(pk => myTeam.picks![pk]) : [];

  let fx = MATCHES;
  if (filter === 'mine') fx = fx.filter(f => myIds.includes(f.h) || myIds.includes(f.a));
  if (filter === 'live') fx = fx.filter(f => matchStatus(f.d, scores[f.i]) === 'live');
  const days = [...new Set(fx.map(f => dayKeyOf(f.d)))].sort();

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
          <div className="card pad" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 13 }}>Draft first to filter your nations.</div></div>
        )}
        {days.map(day => (
          <div key={day}>
            <div className="sec-head" style={{ margin: '18px 2px 9px' }}><span className="eyebrow">{fmtDayLabel(day)}</span></div>
            <div className="card flat" style={{ overflow: 'hidden' }}>
              {fx.filter(f => dayKeyOf(f.d) === day).map(f => (
                <EditableMatch key={f.i} f={f} myIds={myIds} score={scores[f.i]} open={editing === f.i}
                  onToggle={() => setEditing(editing === f.i ? null : f.i)}
                  onSave={(v) => { onSaveScore(f.i, v); setEditing(null); toast('Score saved'); }} />
              ))}
            </div>
          </div>
        ))}
        {fx.length === 0 && <div className="card pad" style={{ textAlign: 'center' }}><div className="muted">No matches match this filter.</div></div>}
      </> : (
        <KnockoutTab state={state} myIds={myIds} editing={editing} setEditing={setEditing}
          onAddKO={onAddKO} onSaveKO={onSaveKO} onDelKO={onDelKO} toast={toast} />
      )}
    </div>
  );
}

/* group match row + inline editor */
function EditableMatch({ f, myIds, score, open, onToggle, onSave }: {
  f: Match; myIds: string[]; score?: ScoreEntry | null; open: boolean;
  onToggle: () => void; onSave: (v: ScoreEntry) => void;
}) {
  const [hs, setHs] = useState(score?.h ?? 0);
  const [as, setAs] = useState(score?.a ?? 0);
  const [status, setStatus] = useState(score?.st || 'ft');
  const mine = myIds.includes(f.h) || myIds.includes(f.a);
  const stt = matchStatus(f.d, score);
  const done = score && (score.st === 'ft' || score.st === 'live') && score.h != null;

  return (
    <div style={{ borderBottom: '1px solid var(--line-2)', background: mine ? 'rgba(200,242,60,.1)' : 'transparent' }}>
      <div className="mrow" onClick={onToggle} style={{ cursor: 'pointer', borderBottom: 0 }}>
        <div className="side"><Flag id={f.h} size={30} ring={myIds.includes(f.h) ? 'pot' : 'ink'} /><span className="nm">{NATION[f.h].name}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {done
            ? <span className="scorebug">{score.h}<span style={{ opacity: .4 }}>:</span>{score.a}</span>
            : <span className="scorebug sched">{fmtTime(f.d).replace(' ET', '')}</span>}
          {stt === 'live' && <span className="badge live" style={{ height: 16, fontSize: 8 }}><span className="dot" />LIVE</span>}
          {done && stt !== 'live' && <span className="badge ft" style={{ height: 16, fontSize: 8 }}>FT</span>}
        </div>
        <div className="side away"><Flag id={f.a} size={30} ring={myIds.includes(f.a) ? 'pot' : 'ink'} /><span className="nm">{NATION[f.a].name}</span></div>
      </div>
      {open && (
        <div className="fade-in" style={{ padding: '4px 14px 16px' }}>
          <div className="row" style={{ justifyContent: 'center', gap: 18, padding: '8px 0 14px' }}>
            <div style={{ textAlign: 'center' }}><Flag id={f.h} size={36} ring="ink" /><div style={{ marginTop: 8 }}><Stepper v={hs} set={setHs} /></div></div>
            <span className="num" style={{ fontSize: 24, color: 'var(--mut-2)', alignSelf: 'center' }}>:</span>
            <div style={{ textAlign: 'center' }}><Flag id={f.a} size={36} ring="ink" /><div style={{ marginTop: 8 }}><Stepper v={as} set={setAs} /></div></div>
          </div>
          <div className="seg" style={{ borderWidth: 1 }}>
            {([['sched', 'Scheduled'], ['live', 'Live'], ['ft', 'Final']] as const).map(([k, l]) => (
              <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>
            ))}
          </div>
          <button className="btn btn-lime btn-block" style={{ marginTop: 12 }} onClick={() => onSave({ h: hs, a: as, st: status })}>Save score</button>
          <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 10 }}>{f.c} · Group {f.g} · {fmtTime(f.d)}</div>
        </div>
      )}
    </div>
  );
}

/* knockouts */
function KnockoutTab({ state, myIds, editing, setEditing, onAddKO, onSaveKO, onDelKO, toast }: {
  state: AppState; myIds: string[]; editing: string | null; setEditing: (id: string | null) => void;
  onAddKO: (k: KOMatch) => void; onSaveKO: (id: string, v: Partial<KOMatch>) => void; onDelKO: (id: string) => void;
  toast: (msg: string) => void;
}) {
  const [round, setRound] = useState('R16');
  const [home, setHome] = useState('BRA');
  const [away, setAway] = useState('ARG');
  const ko = state.ko || [];
  const sc = state.scoring;

  return <>
    <div className="card pad" style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Add a knockout matchup</div>
      <div className="row" style={{ gap: 8 }}>
        <select className="ipt" style={{ flex: 1 }} value={round} onChange={e => setRound(e.target.value)}>
          {KO_ROUNDS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={home === away}
          onClick={() => { onAddKO({ id: uid(), round, h: home, a: away, h_s: null, a_s: null, st: 'sched', pk: null }); toast('Match added'); }}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <select className="ipt" style={{ flex: 1 }} value={home} onChange={e => setHome(e.target.value)}>{NATIONS.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
        <span className="num" style={{ fontSize: 18, color: 'var(--mut-2)' }}>v</span>
        <select className="ipt" style={{ flex: 1 }} value={away} onChange={e => setAway(e.target.value)}>{NATIONS.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
      </div>
    </div>

    {ko.length === 0 && <div className="card pad" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 13 }}>No knockout matches yet.</div></div>}

    {KO_SORT_ORDER.map(rid => {
      const list = ko.filter(k => k.round === rid);
      if (!list.length) return null;
      const bonus = sc.bonuses ? sc.b[rid] : undefined;
      return (
        <div key={rid}>
          <div className="sec-head"><span className="eyebrow">{KO_LABEL[rid]}</span>{bonus ? <span className="badge" style={{ background: 'var(--lime)' }}>bonus +{bonus}</span> : null}</div>
          <div className="card flat" style={{ overflow: 'hidden' }}>
            {list.map(k => (
              <KoMatch key={k.id} k={k} myIds={myIds} open={editing === k.id}
                onToggle={() => setEditing(editing === k.id ? null : k.id)}
                onSave={(v) => { onSaveKO(k.id, v); setEditing(null); toast('Score saved'); }}
                onDelete={() => { if (confirm('Delete this match?')) { onDelKO(k.id); setEditing(null); } }} />
            ))}
          </div>
        </div>
      );
    })}
  </>;
}

function KoMatch({ k, myIds, open, onToggle, onSave, onDelete }: {
  k: KOMatch; myIds: string[]; open: boolean; onToggle: () => void;
  onSave: (v: Partial<KOMatch>) => void; onDelete: () => void;
}) {
  const [hs, setHs] = useState(k.h_s ?? 0);
  const [as, setAs] = useState(k.a_s ?? 0);
  const [status, setStatus] = useState(k.st || 'ft');
  const [pens, setPens] = useState(k.pk);
  const done = (k.st === 'ft' || k.st === 'live') && k.h_s != null;
  const level = hs === as && status !== 'sched' && k.round !== '3rd';

  return (
    <div style={{ borderBottom: '1px solid var(--line-2)' }}>
      <div className="mrow" onClick={onToggle} style={{ cursor: 'pointer', borderBottom: 0 }}>
        <div className="side"><Flag id={k.h} size={30} ring={myIds.includes(k.h) ? 'pot' : 'ink'} /><span className="nm">{NATION[k.h].name}</span>{k.pk === k.h && <span style={{ fontSize: 11 }}>(P)</span>}</div>
        {done
          ? <span className="scorebug">{k.h_s}<span style={{ opacity: .4 }}>:</span>{k.a_s}</span>
          : <span className="scorebug sched">vs</span>}
        <div className="side away">{k.pk === k.a && <span style={{ fontSize: 11 }}>(P)</span>}<Flag id={k.a} size={30} ring={myIds.includes(k.a) ? 'pot' : 'ink'} /><span className="nm">{NATION[k.a].name}</span></div>
      </div>
      {open && (
        <div className="fade-in" style={{ padding: '4px 14px 16px' }}>
          <div className="row" style={{ justifyContent: 'center', gap: 18, padding: '8px 0 12px' }}>
            <div style={{ textAlign: 'center' }}><Flag id={k.h} size={36} ring="ink" /><div style={{ marginTop: 8 }}><Stepper v={hs} set={setHs} /></div></div>
            <span className="num" style={{ fontSize: 24, color: 'var(--mut-2)', alignSelf: 'center' }}>:</span>
            <div style={{ textAlign: 'center' }}><Flag id={k.a} size={36} ring="ink" /><div style={{ marginTop: 8 }}><Stepper v={as} set={setAs} /></div></div>
          </div>
          <div className="seg" style={{ borderWidth: 1, marginBottom: 10 }}>
            {([['sched', 'Scheduled'], ['live', 'Live'], ['ft', 'Final']] as const).map(([kk, l]) => (
              <button key={kk} className={status === kk ? 'on' : ''} onClick={() => setStatus(kk)}>{l}</button>
            ))}
          </div>
          {level && (
            <div className="between soft" style={{ padding: '10px 12px', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Won on penalties?</span>
              <div className="row" style={{ gap: 6 }}>
                <button className={`chip ${pens === k.h ? 'on' : ''}`} onClick={() => setPens(k.h)}>{NATION[k.h].id}</button>
                <button className={`chip ${pens === k.a ? 'on' : ''}`} onClick={() => setPens(k.a)}>{NATION[k.a].id}</button>
              </div>
            </div>
          )}
          <button className="btn btn-lime btn-block" onClick={() => onSave({ h_s: hs, a_s: as, st: status, pk: level ? pens : null })}>Save score</button>
          <button className="chip" style={{ margin: '10px auto 0', display: 'flex' }} onClick={onDelete}>delete match</button>
        </div>
      )}
    </div>
  );
}
