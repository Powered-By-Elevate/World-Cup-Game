import { useMemo, useState } from 'react';
import { NATIONS, POT_KEYS, POT_META } from '../data/nations';
import { MATCHES } from '../data/fixtures';
import type { Team } from '../data/types';
import { parseDate } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Avatar, Countdown } from '../components/shared';

interface Props {
  team: Team;
  teams: Team[];
  isCommish: boolean;
  commishName: string | null;
  draftAt: number | null;
  onSetDraftTime: (ts: number | null) => void;
  onStartDraft: () => void;
}

// epoch ms <-> the "YYYY-MM-DDTHH:mm" local string a datetime-local input wants
function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDraft(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STEPS = [
  { n: '1', t: 'Get your three', d: 'The draft deals you one Favorite, one Underdog, one Longshot — at random, no trades.' },
  { n: '2', t: 'Live every match', d: 'Wins and draws bank points. Go deep in the knockouts for big bonuses.' },
  { n: '3', t: 'Last couple wins', d: 'Whoever’s nations rack up the most by the final lifts the family trophy.' },
];

// lively per-team accent bar (no nation colors to draw from until the draft runs)
const BAR = ['#FF3D9A', '#07C2C7', '#FFB000', '#7A5CFF', '#FF6A3D', '#1FB257'];
function barGrad(seed: string, i: number) {
  const c = (seed?.charCodeAt(0) || 0) + i;
  return `linear-gradient(180deg, ${BAR[c % BAR.length]}, ${BAR[(c + 3) % BAR.length]})`;
}

export function PreDraftHome({ team, teams, isCommish, commishName, draftAt, onSetDraftTime, onStartDraft }: Props) {
  const members = team.members || [];
  const [editing, setEditing] = useState(false);
  const [dt, setDt] = useState('');

  // The countdown ticks toward the commissioner's scheduled draft time if one
  // is set; otherwise it falls back to the real first-match kickoff. Either way
  // the draft only actually starts when the commissioner hits the button.
  const kickoff = useMemo(() => Math.min(...MATCHES.map(m => parseDate(m.d).getTime())), []);
  const target = draftAt ?? kickoff;
  const future = target > Date.now();
  const cdLabel = draftAt ? 'Draft begins in' : 'Kicks off in';

  const openEditor = () => { setDt(draftAt ? toLocalInput(draftAt) : ''); setEditing(true); };
  const saveTime = () => { if (!dt) return; onSetDraftTime(new Date(dt).getTime()); setEditing(false); };
  const clearTime = () => { onSetDraftTime(null); setEditing(false); };

  // all 48 nations split into two marquee rows, each doubled for a seamless loop
  const rowA = NATIONS.filter((_, i) => i % 2 === 0);
  const rowB = NATIONS.filter((_, i) => i % 2 === 1);

  return (
    <div className="content">
      {/* ===== HERO ===== */}
      <div className="card predraft-hero">
        <div className="glow" />
        <div className="grid-lines" />
        <div style={{ position: 'relative' }}>
          <div className="between">
            <span className="eyebrow" style={{ color: 'var(--lime)', letterSpacing: '.24em' }}>
              <span className="kicker-dot" style={{ marginRight: 7 }} />Draft day
            </span>
            <span className="row" style={{ gap: 6 }}>
              {members.map((m, i) => <Avatar key={m.id} name={m.name} idx={i} size={26} />)}
            </span>
          </div>

          <div style={{ fontFamily: 'Anton,sans-serif', textTransform: 'uppercase', letterSpacing: '.01em', lineHeight: 1.02, marginTop: 16, color: 'var(--paper)' }}>
            <div style={{ fontSize: 36, whiteSpace: 'nowrap' }}>Three nations.</div>
            <div style={{ fontSize: 36, whiteSpace: 'nowrap' }}>One <span style={{ color: 'var(--lime)' }}>destiny.</span></div>
          </div>
          <p style={{ margin: '15px 0 0', fontSize: 14, lineHeight: 1.5, color: '#D9D5C8', maxWidth: 330 }}>
            <b style={{ color: 'var(--paper)' }}>{members.map(m => m.name).join(' & ')}</b> — when the draft drops you'll get one Favorite, one Underdog and one Longshot to ride all the way to the final.
          </p>

          {/* countdown */}
          <div className="between" style={{ marginTop: 20, padding: '15px 16px', borderRadius: 14, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
            <div>
              <div className="eyebrow" style={{ color: '#9C988C', whiteSpace: 'nowrap' }}>{future ? cdLabel : (draftAt ? 'Draft day' : 'The tournament')}</div>
              <div style={{ marginTop: 9 }}>
                {future
                  ? <Countdown target={target} compact />
                  : <div className="num" style={{ fontSize: 22, color: 'var(--paper)' }}>{draftAt ? 'Starting any moment' : 'Underway — draft now'}</div>}
              </div>
            </div>
            <span className="flagrow">
              <Flag id={NATIONS.find(n => n.pot === 'FAV')!.id} size={34} ring="gold" />
              <Flag id={NATIONS.find(n => n.pot === 'UND')!.id} size={34} ring="cyan" />
              <Flag id={NATIONS.find(n => n.pot === 'LNG')!.id} size={34} ring="magenta" />
            </span>
          </div>

          {/* commissioner: schedule the draft time the countdown ticks toward */}
          {isCommish && (
            editing ? (
              <div style={{ marginTop: 12 }}>
                <input type="datetime-local" className="ipt" value={dt} onChange={e => setDt(e.target.value)} style={{ height: 46 }} />
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button className="btn btn-lime btn-sm" style={{ flex: 1 }} disabled={!dt} onClick={saveTime}>Save time</button>
                  {draftAt && <button className="btn btn-sm" style={{ background: 'transparent', color: 'var(--paper)', borderColor: 'rgba(255,255,255,.3)', boxShadow: 'none' }} onClick={clearTime}>Clear</button>}
                  <button className="btn btn-sm" style={{ background: 'transparent', color: 'var(--paper)', borderColor: 'rgba(255,255,255,.3)', boxShadow: 'none' }} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={openEditor} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, marginTop: 12, padding: '0 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.06)', color: 'var(--paper)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                <Icon name="cal" size={14} />{draftAt ? `Draft set · ${fmtDraft(draftAt)} · Change` : 'Set a draft time'}
              </button>
            )
          )}

          {/* CTA */}
          {isCommish ? (
            <button className="btn btn-lime btn-block" style={{ marginTop: 16, height: 58, fontSize: 16, boxShadow: '0 5px 0 #000' }} onClick={onStartDraft}>
              <Icon name="bolt" size={22} /> Start the draft
            </button>
          ) : (
            <div className="row" style={{ gap: 10, marginTop: 16, padding: '13px 15px', borderRadius: 13, background: 'rgba(200,242,60,.12)', border: '1px solid rgba(200,242,60,.3)' }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--paper)' }}>{commishName || 'Your commissioner'} 👑 runs the draft</div>
                <div className="eyebrow" style={{ color: '#9C988C', marginTop: 2 }}>You'll get pulled in automatically</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== FLAG MARQUEE ===== */}
      <div className="sec-head"><span className="eyebrow">48 nations enter</span><span className="muted" style={{ fontSize: 12 }}>you draft 3</span></div>
      <div className="card flat" style={{ overflow: 'hidden', padding: '16px 0' }}>
        <div className="marquee" style={{ marginBottom: 11 }}>
          <div className="marquee-track">
            {[...rowA, ...rowA].map((n, i) => <Flag key={i} id={n.id} size={48} ring="pot" />)}
          </div>
        </div>
        <div className="marquee rev">
          <div className="marquee-track">
            {[...rowB, ...rowB].map((n, i) => <Flag key={i} id={n.id} size={48} ring="pot" />)}
          </div>
        </div>
        <div className="row" style={{ gap: 16, justifyContent: 'center', marginTop: 16 }}>
          {POT_KEYS.map(k => (
            <span key={k} className="row" style={{ gap: 6, fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: POT_META[k].accent }} />
              {POT_META[k].label}
            </span>
          ))}
        </div>
      </div>

      {/* ===== HOW IT WORKS ===== */}
      <div className="sec-head"><span className="eyebrow">How it works</span></div>
      <div className="card flat" style={{ overflow: 'hidden' }}>
        {STEPS.map((s, i) => (
          <div key={s.n} className="step" style={{ borderBottom: i < 2 ? '1px solid var(--line-2)' : '0' }}>
            <span className="step-n" style={{ background: i === 2 ? 'var(--lime)' : 'var(--paper-3)' }}>{s.n}</span>
            <div style={{ flex: 1, paddingTop: 1 }}>
              <div style={{ fontFamily: 'Anton,sans-serif', textTransform: 'uppercase', fontSize: 16, letterSpacing: '.01em' }}>{s.t}</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 3 }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== WHO'S IN ===== */}
      <div className="sec-head"><span className="eyebrow">Who's in</span><span className="muted" style={{ fontSize: 12 }}>{teams.length} {teams.length === 1 ? 'couple' : 'couples'} ready</span></div>
      <div className="card flat" style={{ overflow: 'hidden' }}>
        {teams.map((t, i) => (
          <div key={t.id} className="ready-row" style={{ background: t.id === team.id ? 'rgba(200,242,60,.14)' : 'transparent' }}>
            <span style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: barGrad(t.name, i), minHeight: 34 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="row" style={{ gap: 7, minWidth: 0 }}>
                <span style={{ fontFamily: 'Anton,sans-serif', textTransform: 'uppercase', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name || 'Unnamed team'}</span>
                {t.id === team.id && <span className="badge you" style={{ height: 17, flex: '0 0 auto' }}>You</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(t.members || []).map(m => m.name).join(' & ')}</div>
            </div>
            <span className="ready-pill" style={{ flex: '0 0 auto' }}><Icon name="check" size={11} stroke={3} />Ready</span>
          </div>
        ))}
      </div>
    </div>
  );
}
