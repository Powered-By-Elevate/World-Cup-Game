import { useState } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import { MATCHES, KO_LABEL, KO_SORT_ORDER } from '../data/fixtures';
import type { KOMatch } from '../data/fixtures';
import type { ScoreEntry, Team } from '../data/types';
import { matchStatus } from '../utils/scoring';
import { dayKeyOf, fmtDayLabel, fmtTime } from '../utils/helpers';
import { Flag } from '../components/Flag';

interface Props {
  scores: Record<string, ScoreEntry>;
  ko: KOMatch[];
  myTeam: Team | null;
}

export function MatchesView({ scores, ko, myTeam }: Props) {
  const [mode, setMode] = useState<'group' | 'ko'>('group');
  const [filter, setFilter] = useState<'all' | 'mine' | 'live'>('all');
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
          <div className="card pad" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 13 }}>Draft first to see your nations.</div></div>
        )}
        {days.map(day => (
          <div key={day}>
            <div className="sec-head" style={{ margin: '18px 2px 9px' }}><span className="eyebrow">{fmtDayLabel(day)}</span></div>
            <div className="card flat" style={{ overflow: 'hidden' }}>
              {fx.filter(f => dayKeyOf(f.d) === day).map(f => {
                const s = scores[f.i];
                const stt = matchStatus(f.d, s);
                const done = s && (s.st === 'ft' || s.st === 'live') && s.h != null;
                const mine = myIds.includes(f.h) || myIds.includes(f.a);
                return (
                  <div className={`mrow ${mine ? 'mine' : ''}`} key={f.i}>
                    <div className="side"><Flag id={f.h} size={30} ring={myIds.includes(f.h) ? 'pot' : 'ink'} /><span className="nm">{NATION[f.h].name}</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {done
                        ? <span className="scorebug">{s.h}<span style={{ opacity: .4 }}>:</span>{s.a}</span>
                        : <span className="scorebug sched">{fmtTime(f.d).replace(' ET', '')}</span>}
                      {stt === 'live' && <span className="badge live" style={{ height: 16, fontSize: 8 }}><span className="dot" />LIVE</span>}
                      {done && stt !== 'live' && <span className="badge ft" style={{ height: 16, fontSize: 8 }}>FT</span>}
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
          const list = ko.filter(k => k.round === rid);
          if (!list.length) return null;
          return (
            <div key={rid}>
              <div className="sec-head"><span className="eyebrow">{KO_LABEL[rid]}</span></div>
              <div className="card flat" style={{ overflow: 'hidden' }}>
                {list.map(k => {
                  const done = (k.st === 'ft' || k.st === 'live') && k.h_s != null;
                  const mine = myIds.includes(k.h) || myIds.includes(k.a);
                  return (
                    <div className={`mrow ${mine ? 'mine' : ''}`} key={k.id}>
                      <div className="side"><Flag id={k.h} size={30} ring={myIds.includes(k.h) ? 'pot' : 'ink'} /><span className="nm">{NATION[k.h].name}</span>{k.pk === k.h && <span style={{ fontSize: 11 }}>(P)</span>}</div>
                      {done
                        ? <span className="scorebug">{k.h_s}<span style={{ opacity: .4 }}>:</span>{k.a_s}</span>
                        : <span className="scorebug sched">vs</span>}
                      <div className="side away">{k.pk === k.a && <span style={{ fontSize: 11 }}>(P)</span>}<Flag id={k.a} size={30} ring={myIds.includes(k.a) ? 'pot' : 'ink'} /><span className="nm">{NATION[k.a].name}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>}
    </div>
  );
}
