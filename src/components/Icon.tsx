/* Icons + wordmark mark — "MATCHDAY" */

export type IconName =
  | 'home' | 'draft' | 'table' | 'cal' | 'users' | 'gear' | 'share'
  | 'bolt' | 'trophy' | 'check' | 'plus' | 'x' | 'chevron' | 'flame' | 'arrow'
  | 'globe' | 'copy' | 'refresh' | 'edit';

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 21, stroke = 2 }: IconProps) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':   return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-6h5v6" /></svg>;
    case 'draft':  return <svg {...p}><path d="M4 5h16M4 12h10M4 19h16" /><circle cx="18" cy="12" r="2.2" /></svg>;
    case 'table':  return <svg {...p}><path d="M5 4h14v16H5z" /><path d="M5 9h14M5 14h14M12 4v16" /></svg>;
    case 'cal':    return <svg {...p}><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
    case 'users':  return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.8c2.2.5 3.5 2.6 3.5 5.2" /></svg>;
    case 'gear':   return <svg {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" /></svg>;
    case 'share':  return <svg {...p}><circle cx="6" cy="12" r="2.4" /><circle cx="17" cy="6" r="2.4" /><circle cx="17" cy="18" r="2.4" /><path d="M8.1 11 15 7.2M8.1 13l6.9 3.8" /></svg>;
    case 'bolt':   return <svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
    case 'trophy': return <svg {...p}><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9.5 14.5 9 18h6l-.5-3.5M8 21h8" /></svg>;
    case 'check':  return <svg {...p}><path d="M4 12.5 9 17.5 20 6.5" /></svg>;
    case 'plus':   return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'x':      return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case 'chevron':return <svg {...p}><path d="M9 5l7 7-7 7" /></svg>;
    case 'flame':  return <svg {...p}><path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1 .5-1.5.5-1.5C16 11 17 13 17 15a5 5 0 0 1-10 0c0-4 5-5 5-12z" /></svg>;
    case 'arrow':  return <svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
    case 'globe':  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>;
    case 'copy':   return <svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>;
    case 'refresh':return <svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5" /></svg>;
    case 'edit':   return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    default:       return null;
  }
}

/* Wordmark mark: pitch globe + star */
export function Mark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className="wm-mark">
      <rect x="1.2" y="1.2" width="37.6" height="37.6" rx="11" fill="#15120C" />
      <circle cx="20" cy="20" r="13" fill="#C8F23C" />
      <path d="M20 7v26M7.5 20h25" stroke="#15120C" strokeWidth="1.4" opacity=".35" />
      <circle cx="20" cy="20" r="5.3" fill="none" stroke="#15120C" strokeWidth="1.4" />
      <path d="M20 13.6l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z" fill="#15120C" />
    </svg>
  );
}
