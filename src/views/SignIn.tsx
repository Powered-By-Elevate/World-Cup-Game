import { useState } from 'react';
import { Mark, Icon } from '../components/Icon';
import { Flag } from '../components/Flag';
import { signInWithEmail, verifyCode } from '../utils/storage';
import type { AuthUser } from '../utils/storage';

interface Props {
  onSignedIn: (user: AuthUser) => void;
}

const DECO = ['ESP', 'ARG', 'FRA', 'BRA', 'POR', 'NED'];
const emailOk = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export function SignIn({ onSignedIn }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!emailOk(email) || busy) return;
    setBusy(true); setErr(null);
    try { await signInWithEmail(email); setStep('code'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the code. Try again.'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.trim().length < 6 || busy) return;
    setBusy(true); setErr(null);
    try {
      const user = await verifyCode(email, code);
      if (user) onSignedIn(user);
      else setErr('That code did not work. Check it and try again.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That code did not work. Check it and try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="app onboard">
      <header className="hdr"><Mark size={36} /></header>
      <div className="screen">
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
                  Sign in so your team follows you on <b style={{ color: 'var(--paper)' }}>every device</b> — phone, Safari and desktop.
                </p>
                <div className="flagrow" style={{ marginTop: 18 }}>
                  {DECO.map(id => <Flag key={id} id={id} size={38} ring="pot" />)}
                </div>
              </div>
            </div>
          </div>

          {/* sign-in card */}
          <div className="card pad" style={{ marginTop: 14 }}>
            {step === 'email' ? (
              <>
                <h2 className="h2">Sign in</h2>
                <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14 }}>
                  Enter your email and we'll send you a 6-digit code. No password needed.
                </p>
                <input className="ipt" type="email" inputMode="email" autoComplete="email" autoFocus
                  value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com"
                  onKeyDown={e => e.key === 'Enter' && send()} />
                {err && <p style={{ color: 'var(--live)', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
                <button className="btn btn-lime btn-block" style={{ marginTop: 16 }} disabled={!emailOk(email) || busy} onClick={send}>
                  {busy ? 'Sending…' : <>Send code <Icon name="chevron" size={18} /></>}
                </button>
              </>
            ) : (
              <>
                <h2 className="h2">Enter your code</h2>
                <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14 }}>
                  We sent a 6-digit code to <b>{email}</b>. Enter it here — or open the link in that email on this device.
                </p>
                <input className="ipt" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456" style={{ letterSpacing: '.4em', textAlign: 'center', fontSize: 22, fontWeight: 800 }}
                  onKeyDown={e => e.key === 'Enter' && verify()} />
                {err && <p style={{ color: 'var(--live)', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
                <button className="btn btn-lime btn-block" style={{ marginTop: 16 }} disabled={code.length < 6 || busy} onClick={verify}>
                  {busy ? 'Verifying…' : 'Verify & continue'}
                </button>
                <button className="chip" style={{ margin: '14px auto 0', display: 'flex' }} disabled={busy}
                  onClick={() => { setStep('email'); setCode(''); setErr(null); }}>
                  ← use a different email
                </button>
                <button className="chip" style={{ margin: '8px auto 0', display: 'flex' }} disabled={busy} onClick={send}>
                  resend code
                </button>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', marginTop: 18 }} className="eyebrow">Private family pool · invite only</div>
        </div>
      </div>
    </div>
  );
}
