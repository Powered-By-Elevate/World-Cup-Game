/* ============================================================
   TROPHY ART — SVG render system (ported from the MATCHDAY design).
   Shared metal/material gradients + Plinth/Cup + 20 unique renderings.
   <Trophy id={...} /> dispatches to the art for that trophy id.
   ============================================================ */
import type { ReactNode } from 'react';

/* material palettes: [highlight, light, mid, dark, accent] */
const MAT: Record<string, string[]> = {
  gold:     ['#FFF6CC', '#F8D154', '#E3A011', '#92610A', '#FFE9A0'],
  grand:    ['#FFF0F5', '#FFD24D', '#E59A0E', '#8A5708', '#FF4FA3'],
  silver:   ['#FCFEFF', '#D6DDE6', '#99A1AC', '#5F666F', '#E8EDF3'],
  bronze:   ['#FCE6C8', '#DEA05C', '#A6602E', '#683818', '#F2C79A'],
  verdant:  ['#E7FFD8', '#9BE26A', '#3FA02E', '#1C5E1C', '#C8F23C'],
  steel:    ['#F0F4F8', '#C2CCD6', '#7E8A98', '#48515C', '#9AA6B4'],
  momentum: ['#F2FFCC', '#C8F23C', '#9FC419', '#5E7A0E', '#FFFFFF'],
  plastic:  ['#FFE7B0', '#FFC24D', '#E08A1E', '#9C5410', '#FFD98A'],
  charred:  ['#7A746C', '#4A453E', '#2A2622', '#141210', '#FF6A3D'],
  ice:      ['#F2FCFF', '#BFEDFB', '#79CFEC', '#3C8FB8', '#E4F8FF'],
  dynamite: ['#FF8A6B', '#E23B2E', '#A8201A', '#5E120F', '#FFB000'],
  chaos:    ['#FFE7F4', '#FF7AC4', '#8A5CFF', '#2A1B5E', '#07C2C7'],
  clover:   ['#E9FFD6', '#86D957', '#2E9E3C', '#155E22', '#FFD24D'],
};

function Lin({ id, m, x1 = 0, y1 = 0, x2 = 0, y2 = 1 }: { id: string; m: string; x1?: number; y1?: number; x2?: number; y2?: number }) {
  const c = MAT[m] || MAT.gold;
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0%" stopColor={c[0]} />
      <stop offset="34%" stopColor={c[1]} />
      <stop offset="72%" stopColor={c[2]} />
      <stop offset="100%" stopColor={c[3]} />
    </linearGradient>
  );
}
const LinH = (p: { id: string; m: string }) => <Lin {...p} x1={0} y1={0} x2={1} y2={0} />;

function Defs({ P, m = 'gold' }: { P: string; m?: string }) {
  return (
    <defs>
      <Lin id={`g${P}`} m={m} />
      <LinH id={`rim${P}`} m={m} />
    </defs>
  );
}

function Plinth({ P }: { P: string }) {
  return (
    <g>
      <ellipse cx="60" cy="152" rx="38" ry="5.5" fill="rgba(0,0,0,.28)" />
      <path d="M33 150 H87 L83 135 H37 Z" fill="#221D15" />
      <path d="M37 135 H83 L80.5 124 H39.5 Z" fill="#2F2820" />
      <path d="M37 135 H83 L82.6 137 H37.4 Z" fill="#100D08" />
      <rect x="45" y="126" width="30" height="6.5" rx="1.5" fill={`url(#rim${P})`} />
      <rect x="45" y="126" width="30" height="2.2" rx="1.1" fill="#FFFFFF" opacity=".35" />
    </g>
  );
}

function Cup({ P, emblem = null, handle = 'classic' }: { P: string; emblem?: ReactNode; handle?: 'classic' | 'loop' }) {
  return (
    <g>
      <path d="M56 110 H64 L66 124 H54 Z" fill={`url(#g${P})`} />
      <ellipse cx="60" cy="110" rx="11" ry="3.2" fill={`url(#rim${P})`} />
      <path d="M52 100 H68 L66 110 H54 Z" fill={`url(#g${P})`} />
      {handle === 'classic' && <>
        <path d="M41 50 Q23 54 28 72 Q31 84 45 84" fill="none" stroke={`url(#g${P})`} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M79 50 Q97 54 92 72 Q89 84 75 84" fill="none" stroke={`url(#g${P})`} strokeWidth="5.5" strokeLinecap="round" />
      </>}
      {handle === 'loop' && <>
        <circle cx="33" cy="60" r="11" fill="none" stroke={`url(#g${P})`} strokeWidth="5" />
        <circle cx="87" cy="60" r="11" fill="none" stroke={`url(#g${P})`} strokeWidth="5" />
      </>}
      <path d="M40 42 Q40 84 60 96 Q80 84 80 42 Z" fill={`url(#g${P})`} />
      <path d="M37 38 H83 L80 47 H40 Z" fill={`url(#rim${P})`} />
      <rect x="37" y="37" width="46" height="3" rx="1.5" fill="#FFFFFF" opacity=".4" />
      <path d="M45 44 Q44 76 57 90 Q50 74 51 44 Z" fill="#FFFFFF" opacity=".28" />
      {emblem}
      <Plinth P={P} />
    </g>
  );
}

function LockBadge() {
  return (
    <g>
      <circle cx="92" cy="34" r="15" fill="#15120C" stroke="#3A352B" strokeWidth="1.5" />
      <rect x="85" y="32" width="14" height="11" rx="2.5" fill="#7E7868" />
      <path d="M88 32 v-3 a4 4 0 0 1 8 0 v3" fill="none" stroke="#7E7868" strokeWidth="2.2" />
    </g>
  );
}

/* ---- emblems for the cup-based champions ---- */
const Stadium = (
  <g>
    <circle cx="60" cy="64" r="15" fill="rgba(20,15,8,.13)" />
    <ellipse cx="60" cy="66" rx="13" ry="7" fill="none" stroke="#8A5708" strokeWidth="2" />
    <ellipse cx="60" cy="66" rx="8.5" ry="4.5" fill="none" stroke="#8A5708" strokeWidth="2" />
    <ellipse cx="60" cy="66" rx="3.6" ry="2" fill="#8A5708" />
    <circle cx="46.5" cy="56" r="1.7" fill="#FFF6CC" />
    <circle cx="73.5" cy="56" r="1.7" fill="#FFF6CC" />
    <path d="M46.5 57.5 L52 62 M73.5 57.5 L68 62" stroke="#FFF6CC" strokeWidth="1" opacity=".7" />
  </g>
);
const Num32 = (
  <g>
    <circle cx="60" cy="63" r="15.5" fill="#1F58C4" />
    <circle cx="60" cy="63" r="15.5" fill="none" stroke="#0E368A" strokeWidth="2" />
    <text x="60" y="71" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="19" fill="#FFFFFF">32</text>
  </g>
);
const Flame = (
  <g>
    <path d="M60 14 C68 26 76 30 70 44 C67 51 53 51 50 44 C46 35 55 31 60 14 Z" fill="#FF6A3D" />
    <path d="M60 24 C64 31 68 34 64 42 C62 47 55 47 54 42 C52 36 57 33 60 24 Z" fill="#FFB000" />
    <path d="M60 33 C62 37 63 39 61 43 C60 45 57 45 56 43 C55 40 58 38 60 33 Z" fill="#FFF1B8" />
  </g>
);
const Bolt = (
  <g>
    <circle cx="60" cy="63" r="15" fill="rgba(20,15,8,.13)" />
    <path d="M64 48 L50 67 H59 L56 80 L72 59 H62 L66 48 Z" fill="#FFB000" stroke="#8A5708" strokeWidth="1.2" strokeLinejoin="round" />
  </g>
);
const Dumbbell = (
  <g fill="#8A5708">
    <circle cx="60" cy="63" r="15" fill="rgba(20,15,8,.13)" />
    <rect x="46" y="60.5" width="28" height="5" rx="2.5" />
    <rect x="44" y="55" width="5.5" height="16" rx="2" />
    <rect x="70.5" y="55" width="5.5" height="16" rx="2" />
    <rect x="40" y="58" width="4" height="10" rx="2" />
    <rect x="76" y="58" width="4" height="10" rx="2" />
  </g>
);
const StarBig = (
  <g>
    <circle cx="60" cy="64" r="15" fill="rgba(20,15,8,.13)" />
    <path d="M60 49 l4 9.6 10.6 1 -8 7 2.4 10.4 -9 -5.5 -9 5.5 2.4 -10.4 -8 -7 10.6 -1 z" fill="#FFE9A0" stroke="#8A5708" strokeWidth="1" />
  </g>
);

type Art = () => ReactNode;
const ART: Record<string, Art> = {
  /* ---- cup-based round MVPs ---- */
  groupStage: () => (<><Defs P="gs" m="gold" /><Cup P="gs" emblem={Stadium} /></>),
  r32: () => (<><Defs P="r32" m="gold" /><Cup P="r32" emblem={Num32} /></>),
  r16: () => (<><Defs P="r16" m="gold" /><Cup P="r16" emblem={Flame} /></>),
  qf: () => (<><Defs P="qf" m="gold" /><Cup P="qf" emblem={Bolt} /></>),
  sf: () => (<><Defs P="sf" m="gold" /><Cup P="sf" emblem={Dumbbell} /></>),
  final: () => (<><Defs P="fin" m="gold" /><Cup P="fin" emblem={StarBig} /></>),

  /* ---- Champion Owner — globe with a victory flag ---- */
  championOwner: () => (<>
    <Defs P="co" m="gold" />
    <Plinth P="co" />
    <path d="M51 116 H69 L72 124 H48 Z" fill="url(#gco)" />
    <rect x="54" y="110" width="12" height="8" rx="2" fill="url(#gco)" />
    <path d="M34 78 Q60 104 86 78" fill="none" stroke="url(#rimco)" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="60" cy="62" r="28" fill="url(#gco)" />
    <g stroke="#8A5708" strokeWidth="1.3" fill="none" opacity=".5">
      <ellipse cx="60" cy="62" rx="28" ry="10.5" />
      <ellipse cx="60" cy="62" rx="18" ry="28" />
      <ellipse cx="60" cy="62" rx="9" ry="28" />
      <line x1="32" y1="62" x2="88" y2="62" />
    </g>
    <g fill="#8A5708" opacity=".32">
      <path d="M47 48 q9 -3 13 4 q-4 7 -13 3 z" />
      <path d="M64 68 q10 1 12 9 q-8 4 -14 -3 z" />
    </g>
    <ellipse cx="50" cy="50" rx="6.5" ry="9.5" fill="#fff" opacity=".3" />
    <rect x="58.6" y="22" width="2.8" height="16" rx="1" fill="#8A5708" />
    <path d="M61.4 22 h15 l-4 4.6 4 4.6 h-15 z" fill="#C8F23C" />
  </>),

  /* ---- Tournament Champion — jeweled crown ---- */
  champion: () => (<>
    <Defs P="ch" m="grand" />
    <Plinth P="ch" />
    <path d="M53 124 H67 L65 98 H55 Z" fill="url(#gch)" />
    <rect x="49" y="92" width="22" height="7" rx="2" fill="url(#rimch)" />
    <ellipse cx="60" cy="92" rx="11" ry="2.6" fill="#fff" opacity=".25" />
    <g stroke="#8A5708" strokeWidth="2.2" fill="none" opacity=".7" strokeLinecap="round">
      <path d="M46 92 Q35 80 41 64" />
      <path d="M74 92 Q85 80 79 64" />
    </g>
    <g fill="url(#gch)" stroke="#8A5708" strokeWidth="1" strokeLinejoin="round">
      <path d="M38 78 L45 48 L54 64 L60 40 L66 64 L75 48 L82 78 Z" />
      <rect x="38" y="75" width="44" height="10" rx="2.5" />
    </g>
    <path d="M42 76 L48 52 L54 64 Z" fill="#fff" opacity=".22" />
    <circle cx="60" cy="40" r="3.6" fill="#FF4FA3" stroke="#8A5708" strokeWidth=".6" />
    <circle cx="45" cy="48" r="2.4" fill="#07C2C7" />
    <circle cx="75" cy="48" r="2.4" fill="#07C2C7" />
    <circle cx="60" cy="80" r="3.4" fill="#FF4FA3" stroke="#8A5708" strokeWidth=".6" />
    <circle cx="49" cy="80" r="2.4" fill="#07C2C7" />
    <circle cx="71" cy="80" r="2.4" fill="#07C2C7" />
  </>),

  /* ---- Finalist Owner — silver medal on a ribbon ---- */
  finalistOwner: () => (<>
    <Defs P="fo" m="silver" />
    <path d="M49 22 L41 86 L60 74 L79 86 L71 22 Z" fill="#C0392B" />
    <path d="M49 22 L55 22 L48 80 L45 76 Z" fill="#9C2A20" />
    <path d="M71 22 L65 22 L72 80 L75 76 Z" fill="#E0594B" />
    <circle cx="60" cy="106" r="27" fill="url(#gfo)" />
    <circle cx="60" cy="106" r="27" fill="none" stroke="#7E8794" strokeWidth="2" />
    <circle cx="60" cy="106" r="20.5" fill="none" stroke="#FCFEFF" strokeWidth="1.4" opacity=".6" />
    <text x="60" y="117" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="28" fill="#5F666F">2</text>
    <ellipse cx="50" cy="96" rx="7" ry="11" fill="#fff" opacity=".32" />
  </>),

  /* ---- Most Teams Alive — thriving tree ---- */
  mostAlive: () => (<>
    <Defs P="ma" m="verdant" />
    <Plinth P="ma" />
    <path d="M56 110 H64 L66 124 H54 Z" fill="url(#gma)" />
    <path d="M47 80 H73 Q71 104 60 108 Q49 104 47 80 Z" fill="url(#gma)" />
    <rect x="45" y="76" width="30" height="6.5" rx="2" fill="url(#rimma)" />
    <rect x="58.6" y="46" width="3" height="34" fill="#2E7D24" />
    <path d="M60 60 L50 50 M60 54 L70 44" stroke="#2E7D24" strokeWidth="3" strokeLinecap="round" />
    <g fill="#3FA02E">
      <circle cx="60" cy="38" r="12" /><circle cx="48" cy="49" r="8.5" /><circle cx="72" cy="49" r="8.5" />
      <circle cx="53" cy="31" r="7" /><circle cx="67" cy="32" r="7" />
    </g>
    <g fill="#86D957">
      <circle cx="55" cy="35" r="4.5" /><circle cx="66" cy="44" r="3.8" /><circle cx="49" cy="48" r="3" />
    </g>
    <g>
      <rect x="55" y="22" width="1.7" height="10" fill="#155E22" />
      <path d="M56.7 22 h7 l-2 2.5 2 2.5 h-7 z" fill="#FFD24D" />
    </g>
  </>),

  /* ---- Sole Survivor — battle shield with a lone flag ---- */
  lastStanding: () => (<>
    <Defs P="ls" m="steel" />
    <Plinth P="ls" />
    <path d="M60 28 L87 37 V64 Q87 94 60 108 Q33 94 33 64 V37 Z" fill="url(#gls)" stroke="#48515C" strokeWidth="2" />
    <path d="M60 35 L80 42 V64 Q80 87 60 99 Q40 87 40 64 V42 Z" fill="none" stroke="#9AA6B4" strokeWidth="1.4" opacity=".6" />
    <path d="M44 41 L51 39 V64 Q51 81 60 92 Q49 84 44 64 Z" fill="#fff" opacity=".2" />
    <rect x="58.4" y="50" width="3.2" height="36" rx="1" fill="#E3A011" />
    <path d="M61.6 50 h17 l-4.5 6 4.5 6 h-17 z" fill="#C8F23C" />
    <path d="M60 28 l2.2 5 5.4 .6 -4 3.8 1 5.3 -4.6 -2.6 -4.6 2.6 1 -5.3 -4 -3.8 5.4 -.6 z" fill="#E3A011" stroke="#8A5708" strokeWidth=".7" />
  </>),

  /* ---- Biggest Mover — momentum arrow over rising bars ---- */
  biggestMover: () => (<>
    <Defs P="bm" m="momentum" />
    <Plinth P="bm" />
    <g fill="#9FC419" opacity=".5">
      <rect x="34" y="100" width="8" height="16" rx="2" />
      <rect x="78" y="92" width="8" height="24" rx="2" />
    </g>
    <path d="M60 20 L86 60 H71 V108 H49 V60 H34 Z" fill="url(#gbm)" stroke="#5E7A0E" strokeWidth="2" strokeLinejoin="round" />
    <path d="M60 30 L74 52 H66 V102 H54 V52 H46 Z" fill="#fff" opacity=".22" />
    <circle cx="60" cy="18" r="2.6" fill="#fff" />
  </>),

  /* ---- commissioner gag trophies ---- */
  pain: () => (<>
    <Defs P="pn" m="plastic" />
    <Plinth P="pn" />
    <path d="M56 108 H64 L66 124 H54 Z" fill="url(#gpn)" />
    <path d="M52 100 H68 L66 108 H54 Z" fill="url(#gpn)" />
    <path d="M40 40 H80 Q80 78 70 92 Q68 101 64 96 Q61 104 58 97 Q54 103 52 95 Q44 84 40 40 Z" fill="url(#gpn)" />
    <rect x="38" y="36" width="44" height="7" rx="3.5" fill="url(#rimpn)" />
    <path d="M47 53 L57 57 M73 53 L63 57" stroke="#9C5410" strokeWidth="3" strokeLinecap="round" />
    <path d="M50 61 q3 -3.5 6.5 0 M63.5 61 q3 -3.5 6.5 0" stroke="#9C5410" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <rect x="50" y="68" width="20" height="8" rx="2" fill="#9C5410" />
    <path d="M54 68 v8 M58 68 v8 M62 68 v8 M66 68 v8" stroke="#FFE7B0" strokeWidth="1.1" />
    <path d="M44 49 q-3.2 5 0 7.2 q3.2 -2.2 0 -7.2 z" fill="#07C2C7" />
    <path d="M79 59 q-3.2 5 0 7.2 q3.2 -2.2 0 -7.2 z" fill="#07C2C7" />
    <circle cx="82" cy="47" r="2" fill="#07C2C7" />
  </>),

  gsDisaster: () => (<>
    <Defs P="ds" m="charred" />
    <Plinth P="ds" />
    <path d="M56 108 H64 L65 124 H55 Z" fill="url(#gds)" />
    <path d="M41 42 Q41 84 60 96 Q72 90 76 74 L66 70 L73 60 L64 56 L71 46 L62 49 Z" fill="url(#gds)" stroke="#141210" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M39 40 H72 L68 47 H42 Z" fill="url(#rimds)" />
    <path d="M52 49 L56 64 L50 73 M61 51 L58 67" stroke="#141210" strokeWidth="1.5" fill="none" />
    <g>
      <path d="M75 38 l4 -11 2.5 9.5 9 -4.5 -6.5 7.5 8.5 4 -9.5 1 3 9.5 -7.5 -5.5 -3 8.5 -2.5 -9.5 z" fill="#FF6A3D" />
      <circle cx="79" cy="36" r="4.5" fill="#FFB000" />
    </g>
    <circle cx="49" cy="29" r="5.5" fill="#4A453E" opacity=".7" />
    <circle cx="42" cy="25" r="3.6" fill="#4A453E" opacity=".55" />
  </>),

  coldest: () => (<>
    <Defs P="cd" m="ice" />
    <Plinth P="cd" />
    <path d="M56 108 H64 L66 124 H54 Z" fill="url(#gcd)" />
    <path d="M44 44 Q44 82 60 94 Q76 82 76 44 Z" fill="#79CFEC" opacity=".9" />
    <rect x="41" y="40" width="38" height="7" rx="3.5" fill="url(#rimcd)" />
    <g fill="#FFFFFF" opacity=".4">
      <path d="M50 45 L61 51 L53 71 L46 56 Z" />
      <path d="M64 49 L74 53 L70 77 L61 62 Z" />
    </g>
    <g fill="#E4F8FF">
      <path d="M46 47 l2 11 2 -11 z" /><path d="M57 47 l2 15 2 -15 z" /><path d="M69 47 l2 9 2 -9 z" />
    </g>
    <g stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round">
      <path d="M58 28 v7 M54.5 31.5 h7 M55.5 29 l5 5 M61.5 29 l-5 5" />
    </g>
    <circle cx="74" cy="33" r="1.6" fill="#FFFFFF" />
    <circle cx="40" cy="60" r="1.4" fill="#FFFFFF" />
  </>),

  byThread: () => (<>
    <Defs P="bt" m="plastic" />
    <path d="M60 4 q-4 16 2 26" stroke="#A49C88" strokeWidth="1.6" fill="none" />
    <path d="M59 9 l-4 4 M60 14 l4 3 M59 19 l-3 4" stroke="#A49C88" strokeWidth="1" />
    <g transform="rotate(-9 60 64)">
      <circle cx="60" cy="32" r="4.5" fill="none" stroke="#E08A1E" strokeWidth="2.6" />
      <path d="M48 42 Q48 74 60 84 Q72 74 72 42 Z" fill="url(#gbt)" />
      <path d="M40 47 Q30 51 34 65 Q37 73 46 73" fill="none" stroke="url(#gbt)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M80 47 Q90 51 86 65 Q83 73 74 73" fill="none" stroke="url(#gbt)" strokeWidth="4.2" strokeLinecap="round" />
      <rect x="46" y="40" width="28" height="5.5" rx="2.5" fill="url(#rimbt)" />
      <path d="M50 50 q3 -3 6 0 M64 50 q3 -3 6 0" stroke="#9C5410" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M55 62 q5 4 10 0" stroke="#9C5410" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M60 90 q-2.4 4.5 0 6.6 q2.4 -2.1 0 -6.6 z" fill="#07C2C7" />
    </g>
    <ellipse cx="60" cy="150" rx="22" ry="3.5" fill="rgba(0,0,0,.16)" />
  </>),

  stillAlive: () => (<>
    <Defs P="sa" m="plastic" />
    <Plinth P="sa" />
    <g transform="rotate(-6 60 92)">
      <path d="M56 108 H64 L66 124 H54 Z" fill="url(#gsa)" />
      <path d="M44 44 Q44 84 60 96 Q76 84 76 44 Z" fill="url(#gsa)" />
      <rect x="41" y="40" width="38" height="7" rx="3.5" fill="url(#rimsa)" />
      <path d="M58 50 L57 90" stroke="#9C5410" strokeWidth="1.5" />
      <path d="M53.5 54 h8 M53.5 62 h8 M53.5 70 h8 M53.5 78 h8 M53.5 86 h8" stroke="#9C5410" strokeWidth="1.4" />
      <g transform="rotate(25 68 64)">
        <rect x="61" y="60" width="15" height="7.5" rx="2" fill="#FFD98A" stroke="#9C5410" strokeWidth="1" />
        <circle cx="68.5" cy="63.7" r="1.1" fill="#9C5410" />
      </g>
      <circle cx="52" cy="58" r="2.6" fill="#9C5410" />
      <path d="M64 55.5 l5 5 M69 55.5 l-5 5" stroke="#9C5410" strokeWidth="2" strokeLinecap="round" />
      <path d="M51 72 q9 6 17 0" stroke="#9C5410" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  </>),

  bracketBuster: () => (<>
    <Defs P="bb" m="dynamite" />
    <Plinth P="bb" />
    <g>
      <rect x="45" y="62" width="9.5" height="48" rx="3.5" fill="url(#gbb)" />
      <rect x="55.5" y="56" width="9.5" height="54" rx="3.5" fill="url(#gbb)" />
      <rect x="66" y="62" width="9.5" height="48" rx="3.5" fill="url(#gbb)" />
      <rect x="45" y="62" width="9.5" height="6" rx="1" fill="#5E120F" />
      <rect x="55.5" y="56" width="9.5" height="6" rx="1" fill="#5E120F" />
      <rect x="66" y="62" width="9.5" height="6" rx="1" fill="#5E120F" />
      <rect x="45" y="104" width="9.5" height="6" rx="1" fill="#5E120F" />
      <rect x="55.5" y="104" width="9.5" height="6" rx="1" fill="#5E120F" />
      <rect x="66" y="104" width="9.5" height="6" rx="1" fill="#5E120F" />
      <rect x="43" y="80" width="34" height="9" rx="2" fill="#8A3D10" />
      <rect x="58" y="70" width="4.5" height="6" rx="1" fill="#FFB000" />
    </g>
    <path d="M60.5 56 q5 -13 11 -15" stroke="#5E120F" strokeWidth="2.2" fill="none" />
    <circle cx="73" cy="38" r="3.8" fill="#FFB000" />
    <g stroke="#FF6A3D" strokeWidth="1.6" strokeLinecap="round">
      <path d="M73 30 l1.6 4.5 M73 30 l-1.6 4.5 M67.5 35 l4.5 1 M78.5 35 l-4.5 1 M69 32 l3.2 2.8 M77 32 l-3.2 2.8" />
    </g>
  </>),

  chaos: () => (<>
    <Defs P="cx" m="chaos" />
    <Plinth P="cx" />
    <path d="M56 108 H64 L66 124 H54 Z" fill="url(#gcx)" />
    <path d="M44 46 Q44 84 60 96 Q76 84 76 46 Z" fill="#2A1B5E" />
    <rect x="41" y="42" width="38" height="7" rx="3.5" fill="url(#rimcx)" />
    <g fill="none" strokeWidth="2.6" strokeLinecap="round">
      <path d="M48 56 q11 -9 23 4 q-13 11 -21 0 q13 13 22 -3" stroke="#FF7AC4" />
      <path d="M50 72 q15 8 23 -5 q-11 -8 -21 2" stroke="#07C2C7" />
      <path d="M52 63 q7 11 19 6" stroke="#FFD24D" />
    </g>
    <path d="M39 39 l1.6 4.2 4.4 .5 -3.3 2.8 1 4.3 -3.7 -2.2 -3.7 2.2 1 -4.3 -3.3 -2.8 4.4 -.5z" fill="#8A5CFF" />
    <circle cx="83" cy="52" r="2.6" fill="#FF7AC4" />
    <path d="M81 37 v5.5 M78.2 39.7 h5.5" stroke="#07C2C7" strokeWidth="2.2" strokeLinecap="round" />
  </>),

  lucky: () => (<>
    <Defs P="lk" m="clover" />
    <Plinth P="lk" />
    <path d="M56 110 H64 L66 124 H54 Z" fill="url(#rimlk)" />
    <path d="M60 58 q-3 26 -3 52" stroke="#2E7D24" strokeWidth="2.6" fill="none" />
    <g fill="#2E9E3C">
      <circle cx="60" cy="42" r="11.5" /><circle cx="45.5" cy="56.5" r="11.5" />
      <circle cx="74.5" cy="56.5" r="11.5" /><circle cx="60" cy="71" r="11.5" />
    </g>
    <g fill="#155E22">
      <path d="M58 40 h4 v-6 h-4 z" /><path d="M44 54.5 h-6 v4 h6 z" />
      <path d="M76 54.5 h6 v4 h-6 z" /><path d="M58 73 h4 v6 h-4 z" />
    </g>
    <g fill="#86D957" opacity=".85">
      <circle cx="56" cy="39" r="4" /><circle cx="42" cy="53" r="4" />
    </g>
    <g transform="rotate(-12 79 98)">
      <rect x="70" y="89" width="18" height="18" rx="4" fill="#FFFFFF" stroke="#155E22" strokeWidth="1.5" />
      <circle cx="75" cy="94" r="1.7" fill="#155E22" /><circle cx="83" cy="94" r="1.7" fill="#155E22" />
      <circle cx="79" cy="98" r="1.7" fill="#155E22" />
      <circle cx="75" cy="102" r="1.7" fill="#155E22" /><circle cx="83" cy="102" r="1.7" fill="#155E22" />
    </g>
  </>),
};

interface TrophyProps {
  id: string;
  size?: number;
  locked?: boolean;
  float?: boolean;
}

export function Trophy({ id, size = 120, locked = false, float = false }: TrophyProps) {
  const art = ART[id];
  const H = Math.round((size * 160) / 120);
  return (
    <svg width={size} height={H} viewBox="0 0 120 160"
      className={float ? 'trophy-float' : ''}
      style={{ overflow: 'visible', display: 'block' }}>
      {locked
        ? <>
            <g style={{ filter: 'grayscale(1) brightness(.55)', opacity: .4 }}>{art ? art() : null}</g>
            <LockBadge />
          </>
        : (art ? art() : null)}
    </svg>
  );
}

/** True if we have a bespoke rendering for this trophy id. */
export const hasTrophyArt = (id: string) => !!ART[id];
