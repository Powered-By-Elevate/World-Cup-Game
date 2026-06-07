import { useState } from 'react';
import type { AppState } from '../data/types';
import { Mark, Icon } from '../components/Icon';
import { Flag } from '../components/Flag';

interface Props {
  state: AppState;
  defaultName: string;
  onJoin: (teamId: string, playerName: string) => void;
  onCreate: (teamName: string, playerName: string) => void;
  toast: (msg: string) => void;
}

const DECO = ['ESP', 'ARG', 'FRA', 'BRA', 'POR', 'NED'];

export function Onboarding({ state, defaultName, onJoin, onCreate }: Props) {
  const [step, setStep] = useState(defaultName ? 1 : 0);
  const [name, setName] = useState(defaultName || '');
  const [newTeam, setNewTeam] = useState('');
  const teams = state.teams || [];

  return (
    <div className="content" style={{ paddingTop: 18 }}>
      {/* hero banner */}
      <div className="card" style={{ overflow: 'hidden', border: '2px solid var(--ink)' }}>
        <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '22px 20px 20px', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: .22, background: 'radial-gradient(60% 100% at 100% 0%, var(--magenta), transparent 60%), radial-gradient(60% 100% at 0% 100%, var(--cyan), transparent 60%)' }} />
          <div style={{ position: 'relative' }}>
            <div className="row" style={{ gap: 10, marginBottom: 14 }}>
              <Mark size={34} />
              <div className="eyebrow" style={{ color: 'var(--lime)', letterSpacing: '.24em' }}>USA · CAN · MEX 2026</div>
            </div>
            <div className="display" style={{ fontSize: 46, color: 'var(--paper)' }}>Family<br /><span style={{ color: 'var(--lime)' }}>Draft</span></div>
            <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.5, color: '#D9D5C8', maxWidth: 300 }}>
              Draft 3 nations. Track every game.<br /><b style={{ color: 'var(--paper)' }}>Last couple standing wins the World Cup.</b>
            </p>
            <div className="flagrow" style={{ marginTop: 18 }}>
              {DECO.map(id => <Flag key={id} id={id} size={38} ring="pot" />)}
            </div>
          </div>
        </div>
      </div>

      {/* step card */}
      <div className="card pad" style={{ marginTop: 14 }}>
        <div className="row" style={{ gap: 7, marginBottom: 14 }}>
          <span className="eyebrow">{step === 0 ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
          <span style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--line)' }}>
            <span style={{ display: 'block', height: '100%', width: step === 0 ? '50%' : '100%', background: 'var(--lime)', borderRadius: 2, transition: 'width .3s' }} />
          </span>
        </div>

        {step === 0 ? (
          <>
            <h2 className="h2">What's your name?</h2>
            <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14 }}>So your family knows who's who in the group chat.</p>
            <input className="ipt" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mara"
              onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(1)} autoFocus />
            <button className="btn btn-lime btn-block" style={{ marginTop: 16 }} disabled={!name.trim()} onClick={() => setStep(1)}>
              Continue <Icon name="chevron" size={18} />
            </button>
          </>
        ) : (
          <>
            <h2 className="h2">Join or start a team</h2>
            <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14 }}>A team is a “couple” — two people share one squad.</p>
            {teams.length > 0 && (
              <div className="soft" style={{ overflow: 'hidden', marginBottom: 14 }}>
                {teams.map((t, i) => (
                  <div key={t.id} className="between" style={{ padding: '12px 13px', borderBottom: i < teams.length - 1 ? '1px solid var(--line-2)' : '0' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 16 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{(t.members || []).map(m => m.name).join(' · ') || 'empty'}</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => onJoin(t.id, name.trim())}>Join</button>
                  </div>
                ))}
              </div>
            )}
            <div className="eyebrow" style={{ marginBottom: 8 }}>— or start a new team —</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="ipt" style={{ flex: 1 }} value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Team name" />
              <button className="btn btn-ink btn-sm" style={{ height: 48 }} disabled={!newTeam.trim()} onClick={() => onCreate(newTeam.trim(), name.trim())}>Create</button>
            </div>
            <button className="chip" style={{ margin: '14px auto 0', display: 'flex' }} onClick={() => setStep(0)}>← change name</button>
          </>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: 18 }} className="eyebrow">Private family pool · invite only</div>
    </div>
  );
}
