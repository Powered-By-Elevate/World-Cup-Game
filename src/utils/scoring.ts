import { GROUP_MATCHES_OF, MATCHES, MATCH_DATE, MILESTONE_ORDER } from '../data/fixtures';
import type { KOMatch } from '../data/fixtures';
import { NATION, POT_KEYS } from '../data/nations';
import type { Team, Scoring, ScoreEntry } from '../data/types';
import { parseDate } from './helpers';

/* Tournament stages, in order. Every point a team earns is attributed to the
 * stage it was earned in (group match pts → Group; a knockout round's match pts
 * plus that round's milestone bonus → that round; the champion bonus → Final).
 * These buckets sum exactly to the team's grand total. */
export const STAGES = ['Group', 'R32', 'R16', 'QF', 'SF', 'Final'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<string, string> = {
  Group: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarterfinals', SF: 'Semifinals', Final: 'Final',
};

/** How many matches a stage holds — used to tell when a stage is complete. */
const STAGE_MATCH_COUNT: Record<string, number> = {
  Group: MATCHES.length, R32: 16, R16: 8, QF: 4, SF: 2, Final: 1,
};

/** The stage a knockout round's points belong to (3rd-place match → Final weekend). */
function koStage(round: string): Stage {
  return round === '3rd' ? 'Final' : (round as Stage);
}

export interface NationStats {
  pts: number;
  gf: number;
  ga: number;
  w: number;
  d: number;
  l: number;
  played: number;
  bonus: number;
  total: number;
  champ: boolean;
  deepest: number;
  games: GameEntry[];
  /** Points (match pts + this stage's bonus) earned in each stage. Sums to total. */
  byStage: Record<string, number>;
}

export interface GameEntry {
  m?: { i: string; d: string; g: string; h: string; a: string; c: string };
  ko?: KOMatch;
  isHome: boolean;
  upcoming?: boolean;
  gf?: number;
  ga?: number;
  r?: string;
  live?: boolean;
  round?: string;
}

export interface TeamStats {
  per: Record<string, NationStats>;
  pts: number;
  bonus: number;
  total: number;
  gf: number;
  ga: number;
  gd: number;
  played: number;
  w: number;
  d: number;
  l: number;
  /** Team points per stage (sum of its nations' byStage). Sums to total. */
  byStage: Record<string, number>;
}

export interface StandingEntry extends TeamStats {
  team: Team;
}

export function nationStats(
  nid: string,
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring
): NationStats {
  const st: NationStats = {
    pts: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0, played: 0,
    bonus: 0, games: [], champ: false, deepest: -1, total: 0, byStage: {},
  };
  const addStage = (stage: string, pts: number) => { if (pts) st.byStage[stage] = (st.byStage[stage] || 0) + pts; };

  (GROUP_MATCHES_OF[nid] || []).forEach(m => {
    const s = scores[m.i];
    const counted = s && (s.st === "ft" || s.st === "live") && s.h != null && s.a != null;
    const isHome = m.h === nid;
    if (!counted) {
      st.games.push({ m, isHome, upcoming: true });
      return;
    }
    const gf = isHome ? s.h! : s.a!;
    const ga = isHome ? s.a! : s.h!;
    st.gf += gf; st.ga += ga; st.played++;
    let r: string;
    if (gf > ga) { r = "W"; st.w++; st.pts += scoring.win; addStage('Group', scoring.win); }
    else if (gf === ga) { r = "D"; st.d++; st.pts += scoring.draw; addStage('Group', scoring.draw); }
    else { r = "L"; st.l++; }
    st.games.push({ m, isHome, gf, ga, r, live: s.st === "live" });
  });

  ko.forEach(k => {
    if (k.h !== nid && k.a !== nid) return;
    const mi = MILESTONE_ORDER.indexOf(k.round === "3rd" ? "SF" : k.round);
    if (mi > st.deepest) st.deepest = mi;
    const counted = (k.st === "ft" || k.st === "live") && k.h_s != null && k.a_s != null;
    const isHome = k.h === nid;
    if (!counted) {
      st.games.push({ ko: k, isHome, upcoming: true });
      return;
    }
    const gf = isHome ? k.h_s! : k.a_s!;
    const ga = isHome ? k.a_s! : k.h_s!;
    st.gf += gf; st.ga += ga; st.played++;
    const stage = koStage(k.round);
    let r: string;
    if (gf > ga) { r = "W"; st.w++; st.pts += scoring.win; addStage(stage, scoring.win); }
    else if (gf < ga) { r = "L"; st.l++; }
    else {
      if (k.pk === nid) { r = "W(p)"; st.w++; st.pts += scoring.win; addStage(stage, scoring.win); }
      else if (k.pk) { r = "L(p)"; st.l++; }
      else { r = "D"; st.d++; st.pts += scoring.draw; addStage(stage, scoring.draw); }
    }
    if (k.round === "Final" && (k.pk === nid || (k.pk == null && gf > ga))) st.champ = true;
    st.games.push({ ko: k, isHome, gf, ga, r, live: k.st === "live", round: k.round });
  });

  if (scoring.bonuses) {
    for (let i = 0; i <= st.deepest; i++) {
      const b = scoring.b[MILESTONE_ORDER[i]] || 0;
      st.bonus += b;
      addStage(MILESTONE_ORDER[i], b);   // "reach R16" bonus → the R16 stage, etc.
    }
    if (st.champ) { st.bonus += scoring.b.CHAMP || 0; addStage('Final', scoring.b.CHAMP || 0); }
  }
  st.total = st.pts + st.bonus;
  return st;
}

export function teamStats(
  team: Team,
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring
): TeamStats {
  const per: Record<string, NationStats> = {};
  let pts = 0, gf = 0, ga = 0, bonus = 0, played = 0, w = 0, d = 0, l = 0;
  const byStage: Record<string, number> = {};
  POT_KEYS.forEach(pk => {
    const nid = team.picks?.[pk];
    if (!nid) return;
    const ns = nationStats(nid, scores, ko, scoring);
    per[pk] = ns;
    pts += ns.pts; gf += ns.gf; ga += ns.ga; bonus += ns.bonus;
    played += ns.played; w += ns.w; d += ns.d; l += ns.l;
    for (const [stage, v] of Object.entries(ns.byStage)) byStage[stage] = (byStage[stage] || 0) + v;
  });
  const total = pts + bonus;
  return { per, pts, bonus, total, gf, ga, gd: gf - ga, played, w, d, l, byStage };
}

/** True once every match in a stage has a final result. */
export function stageComplete(stage: string, scores: Record<string, ScoreEntry>, ko: KOMatch[]): boolean {
  if (stage === 'Group') return MATCHES.every(m => scores[m.i]?.st === 'ft');
  const need = STAGE_MATCH_COUNT[stage];
  if (!need) return false;
  const done = (ko || []).filter(k =>
    koStage(k.round) === stage && k.st === 'ft' && k.h_s != null && k.a_s != null
  ).length;
  return done >= need;
}

/** True once a stage has at least one final result (so it's worth showing). */
export function stageStarted(stage: string, scores: Record<string, ScoreEntry>, ko: KOMatch[]): boolean {
  if (stage === 'Group') return MATCHES.some(m => scores[m.i]?.st === 'ft' || scores[m.i]?.st === 'live');
  return (ko || []).some(k => koStage(k.round) === stage && (k.st === 'ft' || k.st === 'live'));
}

export interface StageStanding {
  team: Team;
  pts: number;      // points earned in this stage
  total: number;    // overall total (tiebreaker + context)
  gd: number;
  gf: number;
}

/** Teams ranked by points earned in a single stage (desc), with tiebreakers. */
export function stageStandings(
  stage: string,
  teams: Team[],
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring
): StageStanding[] {
  return teams
    .map(team => {
      const ts = teamStats(team, scores, ko, scoring);
      return { team, pts: ts.byStage[stage] || 0, total: ts.total, gd: ts.gd, gf: ts.gf };
    })
    .sort((a, b) =>
      b.pts - a.pts || b.total - a.total || b.gd - a.gd || b.gf - a.gf ||
      a.team.name.localeCompare(b.team.name)
    );
}

export interface StageWinner { stage: string; team: Team; pts: number; }

/** The champion of every completed stage (highest points earned that stage). */
export function stageWinners(
  teams: Team[],
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring
): StageWinner[] {
  const out: StageWinner[] = [];
  if (!teams.length) return out;
  for (const stage of STAGES) {
    if (!stageComplete(stage, scores, ko)) continue;
    const top = stageStandings(stage, teams, scores, ko, scoring)[0];
    if (top) out.push({ stage, team: top.team, pts: top.pts });
  }
  return out;
}

export function groupTable(letter: string, scores: Record<string, ScoreEntry>) {
  const t: Record<string, { id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; gd: number }> = {};
  MATCHES.filter(m => m.g === letter).forEach(m => {
    [m.h, m.a].forEach((id: string) => {
      if (!t[id]) t[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, gd: 0 };
    });
    const s = scores[m.i];
    if (!s || (s.st !== "ft" && s.st !== "live") || s.h == null) return;
    const H = t[m.h], A = t[m.a];
    H.p++; A.p++; H.gf += s.h!; H.ga += s.a!; A.gf += s.a!; A.ga += s.h!;
    if (s.h! > s.a!) { H.w++; H.pts += 3; A.l++; }
    else if (s.h! < s.a!) { A.w++; A.pts += 3; H.l++; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  });
  return Object.values(t).map(x => ({ ...x, gd: x.gf - x.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (NATION[a.id]?.name || "").localeCompare(NATION[b.id]?.name || ""));
}

export interface MoversResult {
  latest: string | null;
  delta: Record<string, number>;
  mover: Team | null;
}

export function computeMovers(
  teams: Team[],
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring
): MoversResult {
  let latest: string | null = null;
  Object.entries(scores || {}).forEach(([id, s]) => {
    if (s && (s.st === "ft" || s.st === "live") && s.h != null) {
      const d = MATCH_DATE[id];
      if (d && (!latest || d > latest)) latest = d;
    }
  });
  (ko || []).forEach(k => {
    if ((k.st === "ft" || k.st === "live") && k.h_s != null && k.d && (!latest || k.d > latest)) latest = k.d;
  });
  if (!latest) return { latest: null, delta: {}, mover: null };

  const before: Record<string, ScoreEntry> = {};
  Object.entries(scores || {}).forEach(([id, s]) => {
    if (MATCH_DATE[id] !== latest) before[id] = s;
  });
  const koBefore = (ko || []).map(k => (k.d === latest ? { ...k, st: "sched" } : k));
  const delta: Record<string, number> = {};
  let mover: Team | null = null;
  let best = 0;
  teams.forEach(t => {
    const now = teamStats(t, scores, ko, scoring).total;
    const bef = teamStats(t, before, koBefore, scoring).total;
    const d = now - bef;
    delta[t.id] = d;
    if (d > best) { best = d; mover = t; }
  });
  return { latest, delta, mover };
}

export function matchStatus(d: string, scoreEntry?: ScoreEntry | null): string {
  if (scoreEntry && scoreEntry.st) return scoreEntry.st;
  const t = parseDate(d).getTime(), now = Date.now();
  if (now < t) return "sched";
  if (now < t + 115 * 60 * 1000) return "live";
  return "sched";
}
