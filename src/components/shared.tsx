import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { NATION } from '../data/nations';
import type { Team } from '../data/types';
import { Flag } from './Flag';

/* ---------- pot helpers ---------- */
export const POT_OF: Record<string, { label: string; tag: string; cls: string }> = {
  FAV: { label: 'Favorite', tag: 'POT 1', cls: 'fav' },
  UND: { label: 'Underdog', tag: 'POT 2', cls: 'und' },
  LNG: { label: 'Longshot', tag: 'POT 3', cls: 'lng' },
};
export function PotTag({ pot }: { pot: string }) {
  const p = POT_OF[pot];
  return <span className={`pot ${p.cls}`}>{p.tag}</span>;
}

const PICK_KEYS = ['FAV', 'UND', 'LNG'] as const;

/* ---------- team gradient from its nation colors ---------- */
export function teamGradient(team: Team | null): string {
  if (!team?.picks) return 'linear-gradient(135deg,#888,#555)';
  const ids = PICK_KEYS.map(k => team.picks![k]).filter(Boolean).map(id => NATION[id]).filter(Boolean);
  if (ids.length < 2) return 'linear-gradient(135deg,#888,#555)';
  const stops: string[] = [];
  ids.forEach(n => { stops.push(n.c1); stops.push(n.c2); });
  return `linear-gradient(115deg, ${stops.join(', ')})`;
}

/* ---------- TeamFlags : a team's three picks in a row ---------- */
export function TeamFlags({ team, size = 40, ring = 'pot' }: { team: Team; size?: number; ring?: 'pot' | 'ink' }) {
  return (
    <div className="flagrow">
      {PICK_KEYS.map((k, i) => {
        const id = team.picks?.[k];
        return id
          ? <Flag key={i} id={id} size={size} ring={ring} />
          : <span key={i} className="flag" style={{ width: size, height: size, background: 'var(--line)' }} />;
      })}
    </div>
  );
}

/* ---------- Avatar ---------- */
const AV_COLORS = ['#FF3D9A', '#07C2C7', '#FFB000', '#7A5CFF', '#FF6A3D', '#1FB257'];
export function Avatar({ name, size = 28, idx = 0 }: { name: string; size?: number; idx?: number }) {
  const c = AV_COLORS[((name?.charCodeAt(0) || 0) + idx) % AV_COLORS.length];
  return (
    <span className="avatar" style={{ width: size, height: size, background: c, fontSize: size * 0.42 }}>
      {(name || '?')[0].toUpperCase()}
    </span>
  );
}

/* ---------- Member chip ---------- */
export function Member({ name, idx = 0, commish = false }: { name: string; idx?: number; commish?: boolean }) {
  return (
    <span className="member">
      <Avatar name={name} idx={idx} />
      {name}{commish && <span title="Commissioner" style={{ marginLeft: 1 }}>👑</span>}
    </span>
  );
}

/* ---------- Countdown ---------- */
export function Countdown({ target, compact }: { target: number; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  let diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3.6e6); diff -= h * 3.6e6;
  const m = Math.floor(diff / 6e4); diff -= m * 6e4;
  const s = Math.floor(diff / 1000);
  const pad = (x: number) => String(x).padStart(2, '0');
  const Cell = ({ v, l }: { v: number; l: string }) => (
    <div style={{ textAlign: 'center' }}>
      <div className="num" style={{ fontSize: compact ? 22 : 30, lineHeight: 1 }}>{pad(v)}</div>
      <div className="eyebrow" style={{ fontSize: 8, marginTop: 3 }}>{l}</div>
    </div>
  );
  return (
    <div className="row" style={{ gap: compact ? 10 : 16 }}>
      <Cell v={h} l="HRS" /><span className="num" style={{ fontSize: compact ? 20 : 26, opacity: .3 }}>:</span>
      <Cell v={m} l="MIN" /><span className="num" style={{ fontSize: compact ? 20 : 26, opacity: .3 }}>:</span>
      <Cell v={s} l="SEC" />
    </div>
  );
}

/* ---------- Celebration : full-screen confetti + a popped message ---------- */
export function Celebration({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="celebrate-bg">
      <Confetti count={120} />
      <div className="celebrate-msg">{message}</div>
    </div>
  );
}

/* ---------- AnimatedNumber : count-up + glow when the value changes ---------- */
export function AnimatedNumber({ value, className, style, duration = 700 }: { value: number; className?: string; style?: CSSProperties; duration?: number }) {
  const [disp, setDisp] = useState(value);
  const [glow, setGlow] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    prev.current = value;
    if (from === to) { setDisp(to); return; }
    setGlow(true);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setDisp(Math.round(from + (to - from) * e));
      if (t < 1) raf = requestAnimationFrame(tick);
      else { setDisp(to); window.setTimeout(() => setGlow(false), 420); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={(className || '') + (glow ? ' num-pop' : '')} style={style}>{disp}</span>;
}

/* ---------- Confetti burst ---------- */
export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    dur: 2.2 + Math.random() * 1.8,
    color: ['#C8F23C', '#FFB000', '#07C2C7', '#FF3D9A', '#FF6A3D', '#15120C'][i % 6],
    rot: Math.random() * 360,
    w: 7 + Math.random() * 6,
    round: i % 3 === 0,
  })), [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 80 }}>
      {pieces.map((p, i) => (
        <span key={i} className="confetti" style={{
          left: p.left + '%', width: p.w, height: p.w * 1.5, background: p.color,
          transform: `rotate(${p.rot}deg)`,
          animation: `fall ${p.dur}s linear ${p.delay}s forwards`,
          borderRadius: p.round ? '50%' : '1px',
        }} />
      ))}
    </div>
  );
}
