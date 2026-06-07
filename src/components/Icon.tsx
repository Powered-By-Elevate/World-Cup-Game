export const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  draft: "M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7",
  table: "M3 5h18M3 12h18M3 19h18",
  cal: "M7 3v4M17 3v4M3 9h18M5 5h14v16H5z",
  users: "M16 14a4 4 0 10-8 0M12 7a3 3 0 100-6 3 3 0 000 6M2 21a6 6 0 0112 0M22 21a6 6 0 00-9-5.2",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6M19.4 13a7.7 7.7 0 000-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.5L4.6 11a7.7 7.7 0 000 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 001.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 001.7-1l2.4 1 2-3.5z",
  share: "M4 12v8h16v-8M12 3v13M7 8l5-5 5 5",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3",
};

interface IconProps {
  d: string;
  size?: number;
  sw?: number;
  fill?: string;
}

export function Icon({ d, size = 22, sw = 1.9, fill = "none" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d.split("M").filter(Boolean).map((p, i) => <path key={i} d={"M" + p} />)}
    </svg>
  );
}
