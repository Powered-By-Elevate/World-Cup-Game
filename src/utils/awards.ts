/* ============================================================
   AWARDS — decides which couple's TEAM holds each trophy.

   Objective trophies are computed from the live feed; funny ones are handed out
   by the commissioner (state.awards). Trophy ids + names/flavor live in
   data/trophies.ts; the SVG render lives in components/Trophy.tsx.
   ============================================================ */
import { NATION, POT_KEYS } from '../data/nations';
import type { AssignedAward, ScoreEntry, Team } from '../data/types';
import type { KOMatch } from '../data/fixtures';
import { TROPHY_BY_ID } from '../data/trophies';
import { stageWinners, stageComplete, teamStats } from './scoring';
import type { StandingEntry, MoversResult } from './scoring';

export type AwardKind = 'stage' | 'performance' | 'draft' | 'funny';

export interface Award {
  id: string;        // matches a trophy id in the catalog
  label: string;
  emoji: string;
  kind: AwardKind;
  detail?: string;
}

/** group/knockout stage → its trophy id */
const STAGE_TROPHY: Record<string, string> = {
  Group: 'groupStage', R32: 'r32', R16: 'r16', QF: 'qf', SF: 'sf', Final: 'final',
};

/** Build an Award from the catalog meta for a trophy id. */
function mk(id: string, kind: AwardKind, detail?: string): Award {
  const m = TROPHY_BY_ID[id];
  return { id, label: m?.name || id, emoji: m?.emoji || '🏅', kind, detail };
}

/** Has a nation been knocked out? Lost a finished KO match, or (once the group
 *  stage is done) never made it into the knockout bracket at all. */
function nationEliminated(nid: string, ko: KOMatch[], groupDone: boolean): boolean {
  for (const k of ko) {
    if (k.h !== nid && k.a !== nid) continue;
    if (k.st !== 'ft' || k.h_s == null || k.a_s == null) continue;
    const isHome = k.h === nid;
    const gf = isHome ? k.h_s : k.a_s;
    const ga = isHome ? k.a_s : k.h_s;
    if (gf < ga) return true;
    if (gf === ga && k.pk && k.pk !== nid) return true;   // lost on penalties
  }
  if (groupDone && !ko.some(k => k.h === nid || k.a === nid)) return true;   // didn't qualify
  return false;
}

/** How many of a team's nations are still alive in the tournament. */
export function aliveCount(team: Team, ko: KOMatch[], groupDone: boolean): number {
  return POT_KEYS.reduce((n, pk) => {
    const nid = team.picks?.[pk];
    return n + (nid && !nationEliminated(nid, ko, groupDone) ? 1 : 0);
  }, 0);
}

interface ComputeOpts {
  teams: Team[];
  scores: Record<string, ScoreEntry>;
  ko: KOMatch[];
  scoring: Parameters<typeof teamStats>[3];
  standings: StandingEntry[];
  movers: MoversResult;
  custom: AssignedAward[];
}

/** All awards for every team, keyed by team id (objective + commissioner-assigned). */
export function computeAwards({ teams, scores, ko, scoring, standings, movers, custom }: ComputeOpts): Record<string, Award[]> {
  const out: Record<string, Award[]> = {};
  const push = (teamId: string, a: Award) => { (out[teamId] ||= []).push(a); };

  const groupDone = stageComplete('Group', scores, ko);
  const finalDone = stageComplete('Final', scores, ko);

  // Per-stage MVPs — whoever scored most in each completed stage.
  for (const w of stageWinners(teams, scores, ko, scoring)) {
    const tid = STAGE_TROPHY[w.stage];
    if (tid) push(w.team.id, mk(tid, 'stage', `+${w.pts}`));
  }

  // Tournament Champion — overall #1 once the Final is done.
  if (finalDone && standings[0]) push(standings[0].team.id, mk('champion', 'performance'));

  // Champion / finalist owners — from the final result.
  const finalKo = ko.find(k => k.round === 'Final' && k.st === 'ft' && k.h_s != null && k.a_s != null);
  if (finalKo) {
    let winner: string | null = null;
    if (finalKo.h_s! > finalKo.a_s!) winner = finalKo.h;
    else if (finalKo.a_s! > finalKo.h_s!) winner = finalKo.a;
    else winner = finalKo.pk;
    const runner = winner ? (winner === finalKo.h ? finalKo.a : finalKo.h) : null;
    const ownerOf = (nid: string | null) => nid ? teams.find(t => POT_KEYS.some(pk => t.picks?.[pk] === nid)) : undefined;
    const champTeam = ownerOf(winner);
    const runnerTeam = ownerOf(runner);
    if (champTeam && winner) push(champTeam.id, mk('championOwner', 'draft', NATION[winner]?.name));
    if (runnerTeam && runner) push(runnerTeam.id, mk('finalistOwner', 'draft', NATION[runner]?.name));
  }

  // Most Teams Alive + Sole Survivor — once knockouts begin.
  if (groupDone && !finalDone) {
    const counts = teams.map(t => ({ t, n: aliveCount(t, ko, groupDone) }));
    const max = Math.max(...counts.map(c => c.n));
    const leaders = counts.filter(c => c.n === max && c.n > 0);
    if (max > 0 && leaders.length === 1) push(leaders[0].t.id, mk('mostAlive', 'performance', `${max} still in`));
    const withAlive = counts.filter(c => c.n > 0);
    if (withAlive.length === 1 && counts.length > 1) push(withAlive[0].t.id, mk('lastStanding', 'performance'));
  }

  // Biggest Mover — most points gained on the latest matchday.
  if (movers.mover && (movers.delta[movers.mover.id] || 0) > 0) {
    push(movers.mover.id, mk('biggestMover', 'performance', `+${movers.delta[movers.mover.id]}`));
  }

  // Commissioner-assigned funny trophies.
  for (const a of custom || []) {
    const m = TROPHY_BY_ID[a.awardId];
    if (m && m.kind === 'commish') push(a.teamId, mk(a.awardId, 'funny'));
  }

  return out;
}

/** Order awards within a team's trophy case by importance. */
const KIND_ORDER: Record<AwardKind, number> = { performance: 0, stage: 1, draft: 2, funny: 3 };
export function sortAwards(awards: Award[]): Award[] {
  return [...awards].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** Invert awardsByTeam → which team holds each trophy id (≤1 holder each). */
export function holdersByTrophy(awardsByTeam: Record<string, Award[]>): Record<string, string> {
  const holders: Record<string, string> = {};
  for (const [teamId, list] of Object.entries(awardsByTeam)) {
    for (const a of list) holders[a.id] = teamId;
  }
  return holders;
}
