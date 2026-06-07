import React, { useState } from 'react';
import { NATION } from '../data/nations';

interface FlagProps {
  id: string;
  size?: number;
  radius?: number;
  ring?: boolean;
}

export function Flag({ id, size = 26, radius = 5, ring = true }: FlagProps) {
  const n = NATION[id];
  const [err, setErr] = useState(false);
  const h = Math.round(size * 0.68);
  const base: React.CSSProperties = {
    width: size,
    height: h,
    borderRadius: radius,
    flex: "0 0 auto",
    boxShadow: ring ? "0 0 0 1px rgba(255,255,255,.18), 0 2px 6px rgba(0,0,0,.4)" : "none",
  };

  if (!n) return <span style={{ ...base, background: "#333", display: "inline-block" }} />;

  if (err) return (
    <span style={{
      ...base,
      background: `linear-gradient(135deg, ${n.c1} 0 50%, ${n.c2} 50% 100%)`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.34,
      fontWeight: 800,
      color: "#fff",
      letterSpacing: ".02em",
      textShadow: "0 1px 2px rgba(0,0,0,.6)",
    }}>
      {size >= 30 ? n.id : ""}
    </span>
  );

  return (
    <img
      src={`https://flagcdn.com/w160/${n.flag}.png`}
      alt={n.name}
      onError={() => setErr(true)}
      style={{ ...base, objectFit: "cover" }}
    />
  );
}
