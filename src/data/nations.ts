export interface Nation {
  id: string;
  name: string;
  flag: string;
  pot: 'FAV' | 'UND' | 'LNG';
  c1: string;
  c2: string;
}

export const NATIONS: Nation[] = [
  // Favorites
  { id: "ESP", name: "Spain",        flag: "es",     pot: "FAV", c1: "#C60B1E", c2: "#FFC400" },
  { id: "ARG", name: "Argentina",    flag: "ar",     pot: "FAV", c1: "#75AADB", c2: "#0E3C7A" },
  { id: "FRA", name: "France",       flag: "fr",     pot: "FAV", c1: "#0055A4", c2: "#EF4135" },
  { id: "ENG", name: "England",      flag: "gb-eng", pot: "FAV", c1: "#CF142B", c2: "#0A2342" },
  { id: "BRA", name: "Brazil",       flag: "br",     pot: "FAV", c1: "#009C3B", c2: "#FFDF00" },
  { id: "POR", name: "Portugal",     flag: "pt",     pot: "FAV", c1: "#006600", c2: "#FF0000" },
  { id: "NED", name: "Netherlands",  flag: "nl",     pot: "FAV", c1: "#FF6900", c2: "#21468B" },
  { id: "GER", name: "Germany",      flag: "de",     pot: "FAV", c1: "#DD0000", c2: "#111111" },
  { id: "BEL", name: "Belgium",      flag: "be",     pot: "FAV", c1: "#C8102E", c2: "#FDDA24" },
  { id: "CRO", name: "Croatia",      flag: "hr",     pot: "FAV", c1: "#FF0000", c2: "#0F1FA0" },
  { id: "MAR", name: "Morocco",      flag: "ma",     pot: "FAV", c1: "#C1272D", c2: "#006233" },
  { id: "URU", name: "Uruguay",      flag: "uy",     pot: "FAV", c1: "#0038A8", c2: "#FCD116" },
  { id: "COL", name: "Colombia",     flag: "co",     pot: "FAV", c1: "#FCD116", c2: "#003893" },
  { id: "SUI", name: "Switzerland",  flag: "ch",     pot: "FAV", c1: "#D52B1E", c2: "#AB1A12" },
  { id: "JPN", name: "Japan",        flag: "jp",     pot: "FAV", c1: "#BC002D", c2: "#101010" },
  { id: "USA", name: "USA",          flag: "us",     pot: "FAV", c1: "#3C3B6E", c2: "#B22234" },
  // Underdogs
  { id: "MEX", name: "Mexico",       flag: "mx",     pot: "UND", c1: "#006847", c2: "#CE1126" },
  { id: "SEN", name: "Senegal",      flag: "sn",     pot: "UND", c1: "#00853F", c2: "#E31B23" },
  { id: "ECU", name: "Ecuador",      flag: "ec",     pot: "UND", c1: "#FFD100", c2: "#034EA2" },
  { id: "NOR", name: "Norway",       flag: "no",     pot: "UND", c1: "#BA0C2F", c2: "#00205B" },
  { id: "AUS", name: "Australia",    flag: "au",     pot: "UND", c1: "#00843D", c2: "#FFCD00" },
  { id: "KOR", name: "South Korea",  flag: "kr",     pot: "UND", c1: "#003478", c2: "#C60C30" },
  { id: "AUT", name: "Austria",      flag: "at",     pot: "UND", c1: "#ED2939", c2: "#B71C2B" },
  { id: "CIV", name: "Ivory Coast",  flag: "ci",     pot: "UND", c1: "#FF8200", c2: "#009E60" },
  { id: "EGY", name: "Egypt",        flag: "eg",     pot: "UND", c1: "#CE1126", c2: "#1A1A1A" },
  { id: "SWE", name: "Sweden",       flag: "se",     pot: "UND", c1: "#006AA7", c2: "#FECC02" },
  { id: "TUR", name: "Turkiye",      flag: "tr",     pot: "UND", c1: "#E30A17", c2: "#B00710" },
  { id: "SCO", name: "Scotland",     flag: "gb-sct", pot: "UND", c1: "#0065BF", c2: "#0A3B73" },
  { id: "IRN", name: "Iran",         flag: "ir",     pot: "UND", c1: "#239F40", c2: "#DA0000" },
  { id: "PAR", name: "Paraguay",     flag: "py",     pot: "UND", c1: "#D52B1E", c2: "#0038A8" },
  { id: "PAN", name: "Panama",       flag: "pa",     pot: "UND", c1: "#DA121A", c2: "#005293" },
  { id: "CAN", name: "Canada",       flag: "ca",     pot: "UND", c1: "#FF0000", c2: "#8B0000" },
  // Longshots
  { id: "CZE", name: "Czechia",      flag: "cz",     pot: "LNG", c1: "#11457E", c2: "#D7141A" },
  { id: "QAT", name: "Qatar",        flag: "qa",     pot: "LNG", c1: "#8A1538", c2: "#5E0E26" },
  { id: "BIH", name: "Bosnia & Herz.", flag: "ba",   pot: "LNG", c1: "#002395", c2: "#FECB00" },
  { id: "TUN", name: "Tunisia",      flag: "tn",     pot: "LNG", c1: "#E70013", c2: "#B00010" },
  { id: "ALG", name: "Algeria",      flag: "dz",     pot: "LNG", c1: "#006233", c2: "#D21034" },
  { id: "KSA", name: "Saudi Arabia", flag: "sa",     pot: "LNG", c1: "#006C35", c2: "#00502A" },
  { id: "RSA", name: "South Africa", flag: "za",     pot: "LNG", c1: "#007749", c2: "#FFB81C" },
  { id: "NZL", name: "New Zealand",  flag: "nz",     pot: "LNG", c1: "#00247D", c2: "#CC142B" },
  { id: "COD", name: "DR Congo",     flag: "cd",     pot: "LNG", c1: "#007FFF", c2: "#CE1021" },
  { id: "UZB", name: "Uzbekistan",   flag: "uz",     pot: "LNG", c1: "#1EB53A", c2: "#0099B5" },
  { id: "JOR", name: "Jordan",       flag: "jo",     pot: "LNG", c1: "#007A3D", c2: "#CE1126" },
  { id: "CPV", name: "Cape Verde",   flag: "cv",     pot: "LNG", c1: "#003893", c2: "#F7D116" },
  { id: "IRQ", name: "Iraq",         flag: "iq",     pot: "LNG", c1: "#CE1126", c2: "#007A3B" },
  { id: "GHA", name: "Ghana",        flag: "gh",     pot: "LNG", c1: "#006B3F", c2: "#FCD116" },
  { id: "HAI", name: "Haiti",        flag: "ht",     pot: "LNG", c1: "#00209F", c2: "#D21034" },
  { id: "CUW", name: "Curacao",      flag: "cw",     pot: "LNG", c1: "#002B7F", c2: "#F9E814" },
];

export const NATION: Record<string, Nation> = Object.fromEntries(NATIONS.map(n => [n.id, n]));

export const POT_META: Record<string, { label: string; tag: string; accent: string }> = {
  FAV: { label: "Favorites", tag: "POT 1", accent: "#FFC53D" },
  UND: { label: "Underdogs", tag: "POT 2", accent: "#5EE1E6" },
  LNG: { label: "Longshots", tag: "POT 3", accent: "#F19BFF" },
};

export const POT_KEYS: Array<'FAV' | 'UND' | 'LNG'> = ["FAV", "UND", "LNG"];

export function nationsByPot(p: string): Nation[] {
  return NATIONS.filter(n => n.pot === p);
}
