export interface Match {
  i: string;
  d: string;
  g: string;
  h: string;
  a: string;
  c: string;
}

export const MATCHES: Match[] = [
  { i:"g1",  d:"2026-06-11T15:00", g:"A", h:"MEX", a:"RSA", c:"Mexico City" },
  { i:"g2",  d:"2026-06-11T22:00", g:"A", h:"KOR", a:"CZE", c:"Guadalajara" },
  { i:"g3",  d:"2026-06-12T15:00", g:"B", h:"CAN", a:"BIH", c:"Toronto" },
  { i:"g4",  d:"2026-06-12T21:00", g:"D", h:"USA", a:"PAR", c:"Los Angeles" },
  { i:"g5",  d:"2026-06-13T15:00", g:"C", h:"BRA", a:"MAR", c:"New York / NJ" },
  { i:"g6",  d:"2026-06-13T18:00", g:"D", h:"AUS", a:"TUR", c:"Vancouver" },
  { i:"g7",  d:"2026-06-13T21:00", g:"C", h:"HAI", a:"SCO", c:"Boston" },
  { i:"g8",  d:"2026-06-14T00:00", g:"B", h:"QAT", a:"SUI", c:"SF Bay Area" },
  { i:"g9",  d:"2026-06-14T13:00", g:"E", h:"GER", a:"CUW", c:"Houston" },
  { i:"g10", d:"2026-06-14T16:00", g:"E", h:"CIV", a:"ECU", c:"Philadelphia" },
  { i:"g11", d:"2026-06-14T19:00", g:"F", h:"NED", a:"JPN", c:"Dallas" },
  { i:"g12", d:"2026-06-14T22:00", g:"F", h:"SWE", a:"TUN", c:"Monterrey" },
  { i:"g13", d:"2026-06-15T12:00", g:"H", h:"ESP", a:"CPV", c:"Atlanta" },
  { i:"g14", d:"2026-06-15T15:00", g:"G", h:"BEL", a:"EGY", c:"Seattle" },
  { i:"g15", d:"2026-06-15T18:00", g:"H", h:"KSA", a:"URU", c:"Miami" },
  { i:"g16", d:"2026-06-15T21:00", g:"G", h:"IRN", a:"NZL", c:"Los Angeles" },
  { i:"g17", d:"2026-06-16T15:00", g:"I", h:"FRA", a:"SEN", c:"New York / NJ" },
  { i:"g18", d:"2026-06-16T18:00", g:"I", h:"IRQ", a:"NOR", c:"Boston" },
  { i:"g19", d:"2026-06-16T21:00", g:"J", h:"ARG", a:"ALG", c:"Kansas City" },
  { i:"g20", d:"2026-06-17T00:00", g:"J", h:"AUT", a:"JOR", c:"SF Bay Area" },
  { i:"g21", d:"2026-06-17T13:00", g:"K", h:"POR", a:"COD", c:"Houston" },
  { i:"g22", d:"2026-06-17T16:00", g:"L", h:"ENG", a:"CRO", c:"Dallas" },
  { i:"g23", d:"2026-06-17T19:00", g:"L", h:"GHA", a:"PAN", c:"Toronto" },
  { i:"g24", d:"2026-06-17T22:00", g:"K", h:"UZB", a:"COL", c:"Mexico City" },
  { i:"g25", d:"2026-06-18T12:00", g:"A", h:"CZE", a:"RSA", c:"Atlanta" },
  { i:"g26", d:"2026-06-18T15:00", g:"B", h:"SUI", a:"BIH", c:"Los Angeles" },
  { i:"g27", d:"2026-06-18T18:00", g:"B", h:"CAN", a:"QAT", c:"Vancouver" },
  { i:"g28", d:"2026-06-18T21:00", g:"A", h:"MEX", a:"KOR", c:"Guadalajara" },
  { i:"g29", d:"2026-06-19T15:00", g:"D", h:"USA", a:"AUS", c:"Seattle" },
  { i:"g30", d:"2026-06-19T18:00", g:"C", h:"SCO", a:"MAR", c:"Boston" },
  { i:"g31", d:"2026-06-19T21:00", g:"C", h:"BRA", a:"HAI", c:"Philadelphia" },
  { i:"g32", d:"2026-06-20T00:00", g:"D", h:"TUR", a:"PAR", c:"SF Bay Area" },
  { i:"g33", d:"2026-06-20T13:00", g:"F", h:"NED", a:"SWE", c:"Houston" },
  { i:"g34", d:"2026-06-20T16:00", g:"E", h:"GER", a:"CIV", c:"Toronto" },
  { i:"g35", d:"2026-06-20T20:00", g:"E", h:"ECU", a:"CUW", c:"Kansas City" },
  { i:"g36", d:"2026-06-21T00:00", g:"F", h:"TUN", a:"JPN", c:"Monterrey" },
  { i:"g37", d:"2026-06-21T12:00", g:"H", h:"ESP", a:"KSA", c:"Atlanta" },
  { i:"g38", d:"2026-06-21T15:00", g:"G", h:"BEL", a:"IRN", c:"Los Angeles" },
  { i:"g39", d:"2026-06-21T18:00", g:"H", h:"URU", a:"CPV", c:"Miami" },
  { i:"g40", d:"2026-06-21T21:00", g:"G", h:"NZL", a:"EGY", c:"Vancouver" },
  { i:"g41", d:"2026-06-22T13:00", g:"J", h:"ARG", a:"AUT", c:"Dallas" },
  { i:"g42", d:"2026-06-22T17:00", g:"I", h:"FRA", a:"IRQ", c:"Philadelphia" },
  { i:"g43", d:"2026-06-22T20:00", g:"I", h:"NOR", a:"SEN", c:"New York / NJ" },
  { i:"g44", d:"2026-06-22T23:00", g:"J", h:"JOR", a:"ALG", c:"SF Bay Area" },
  { i:"g45", d:"2026-06-23T13:00", g:"K", h:"POR", a:"UZB", c:"Houston" },
  { i:"g46", d:"2026-06-23T16:00", g:"L", h:"ENG", a:"GHA", c:"Boston" },
  { i:"g47", d:"2026-06-23T19:00", g:"L", h:"PAN", a:"CRO", c:"Toronto" },
  { i:"g48", d:"2026-06-23T22:00", g:"K", h:"COL", a:"COD", c:"Guadalajara" },
  { i:"g49", d:"2026-06-24T15:00", g:"B", h:"CAN", a:"SUI", c:"Vancouver" },
  { i:"g50", d:"2026-06-24T15:00", g:"B", h:"BIH", a:"QAT", c:"Seattle" },
  { i:"g51", d:"2026-06-24T18:00", g:"C", h:"SCO", a:"BRA", c:"Miami" },
  { i:"g52", d:"2026-06-24T18:00", g:"C", h:"MAR", a:"HAI", c:"Atlanta" },
  { i:"g53", d:"2026-06-24T21:00", g:"A", h:"MEX", a:"CZE", c:"Mexico City" },
  { i:"g54", d:"2026-06-24T21:00", g:"A", h:"KOR", a:"RSA", c:"Monterrey" },
  { i:"g55", d:"2026-06-25T16:00", g:"E", h:"ECU", a:"GER", c:"New York / NJ" },
  { i:"g56", d:"2026-06-25T16:00", g:"E", h:"CUW", a:"CIV", c:"Philadelphia" },
  { i:"g57", d:"2026-06-25T19:00", g:"F", h:"TUN", a:"NED", c:"Kansas City" },
  { i:"g58", d:"2026-06-25T19:00", g:"F", h:"JPN", a:"SWE", c:"Dallas" },
  { i:"g59", d:"2026-06-25T22:00", g:"D", h:"USA", a:"TUR", c:"Los Angeles" },
  { i:"g60", d:"2026-06-25T22:00", g:"D", h:"PAR", a:"AUS", c:"SF Bay Area" },
  { i:"g61", d:"2026-06-26T15:00", g:"I", h:"NOR", a:"FRA", c:"Boston" },
  { i:"g62", d:"2026-06-26T15:00", g:"I", h:"SEN", a:"IRQ", c:"Toronto" },
  { i:"g63", d:"2026-06-26T20:00", g:"G", h:"NZL", a:"BEL", c:"Vancouver" },
  { i:"g64", d:"2026-06-26T20:00", g:"G", h:"EGY", a:"IRN", c:"Seattle" },
  { i:"g65", d:"2026-06-26T23:00", g:"H", h:"URU", a:"ESP", c:"Guadalajara" },
  { i:"g66", d:"2026-06-26T23:00", g:"H", h:"CPV", a:"KSA", c:"Houston" },
  { i:"g67", d:"2026-06-27T17:00", g:"L", h:"PAN", a:"ENG", c:"New York / NJ" },
  { i:"g68", d:"2026-06-27T17:00", g:"L", h:"CRO", a:"GHA", c:"Philadelphia" },
  { i:"g69", d:"2026-06-27T19:30", g:"K", h:"COL", a:"POR", c:"Miami" },
  { i:"g70", d:"2026-06-27T19:30", g:"K", h:"COD", a:"UZB", c:"Atlanta" },
  { i:"g71", d:"2026-06-27T22:00", g:"J", h:"JOR", a:"ARG", c:"Dallas" },
  { i:"g72", d:"2026-06-27T22:00", g:"J", h:"ALG", a:"AUT", c:"Kansas City" },
];

export const GROUP_MATCHES_OF: Record<string, Match[]> = {};
MATCHES.forEach(m => {
  (GROUP_MATCHES_OF[m.h] ||= []).push(m);
  (GROUP_MATCHES_OF[m.a] ||= []).push(m);
});

export const MATCH_DATE: Record<string, string> = Object.fromEntries(
  MATCHES.map(m => [m.i, m.d.slice(0, 10)])
);

export const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export interface KOMatch {
  id: string;
  round: string;
  h: string;
  a: string;
  h_s: number | null;
  a_s: number | null;
  st: string;
  pk: string | null;
  d?: string;
}

export const KO_ROUNDS = [
  { id: "R32", label: "Round of 32", when: "Jun 28 - Jul 3" },
  { id: "R16", label: "Round of 16", when: "Jul 4 - 7" },
  { id: "QF",  label: "Quarterfinals", when: "Jul 9 - 11" },
  { id: "SF",  label: "Semifinals", when: "Jul 14 - 15" },
  { id: "3rd", label: "Third place", when: "Jul 18" },
  { id: "Final", label: "Final", when: "Jul 19" },
];

export const KO_LABEL: Record<string, string> = Object.fromEntries(
  KO_ROUNDS.map(r => [r.id, r.label])
);

export const MILESTONE_ORDER = ["R32", "R16", "QF", "SF", "Final"];
export const KO_SORT_ORDER = ["R32", "R16", "QF", "SF", "3rd", "Final"];
