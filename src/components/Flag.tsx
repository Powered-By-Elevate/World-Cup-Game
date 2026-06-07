import { useState } from 'react';
import { NATION } from '../data/nations';

type Ring = 'ink' | 'pot' | 'gold' | 'cyan' | 'magenta';

interface FlagProps {
  id: string;
  size?: number;
  ring?: Ring;
  shine?: boolean;
}

/* Circular, ring-framed flag — the brand's repeating texture. */
export function Flag({ id, size = 40, ring = 'ink', shine = true }: FlagProps) {
  const n = NATION[id];
  const [err, setErr] = useState(false);
  if (!n) return null;

  const ringCls =
    ring === 'pot'
      ? (n.pot === 'FAV' ? 'ring-gold' : n.pot === 'UND' ? 'ring-cyan' : 'ring-magenta')
      : ring === 'gold' ? 'ring-gold'
      : ring === 'cyan' ? 'ring-cyan'
      : ring === 'magenta' ? 'ring-magenta'
      : '';

  return (
    <span className={`flag ${ringCls}`} style={{ width: size, height: size, fontSize: size }}>
      {!err
        ? <img src={`https://flagcdn.com/w160/${n.flag}.png`} alt={n.name} onError={() => setErr(true)} />
        : <span className="fb" style={{ background: `linear-gradient(135deg, ${n.c1}, ${n.c2})` }}>{n.id}</span>}
      {shine && <span className="shine" />}
    </span>
  );
}
