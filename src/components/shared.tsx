import { useState, useEffect } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import type { Team } from '../data/types';
import { Flag } from './Flag';
import { parseDate } from '../utils/helpers';

export function Avatar({ name, color = "#C7FF4E" }: { name: string; color?: string }) {
  return (
    <span className="av" style={{ background: color }}>
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TeamFlags({ team, size = 22 }: { team: Team; size?: number }) {
  if (!team.picks) return <span className="muted tiny">not drafted</span>;
  return (
    <div className="row" style={{ gap: 5 }}>
      {POT_KEYS.map(pk => team.picks![pk]
        ? <Flag key={pk} id={team.picks![pk]} size={size} />
        : <span key={pk} style={{
            width: size, height: size * .68, borderRadius: 5,
            background: "rgba(255,255,255,.08)", display: "inline-block"
          }} />
      )}
    </div>
  );
}

export function teamGradient(team: Team | null) {
  if (!team?.picks) return "linear-gradient(135deg,#1b2a22,#0d1512)";
  const cs = POT_KEYS.map(pk => NATION[team.picks![pk]]?.c1).filter(Boolean);
  if (cs.length < 2) return "linear-gradient(135deg,#1b2a22,#0d1512)";
  return `linear-gradient(125deg, ${cs[0]} 0%, ${cs[1]} 52%, ${cs[2] || cs[1]} 100%)`;
}

export function Countdown({ to }: { to: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const ms = parseDate(to).getTime() - Date.now();
  if (ms <= 0) return <span>kicking off</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return <span>{d}d {h}h {m}m</span>;
  if (h > 0) return <span>{h}h {m}m {ss}s</span>;
  return <span>{m}m {ss}s</span>;
}
