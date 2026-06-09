/* ============================================================
   AWARDS — turns the live results into trophies so everyone has
   something to win, not just first place overall.

   Objective awards are computed automatically from the feed. Funny/subjective
   ones are handed out by the commissioner and stored in state.awards.
   ============================================================ */
import { NATION, POT_KEYS } from '../data/nations';
import type { AssignedAward, ScoreEntry, Team } from '../data/types';
import type { KOMatch } from '../data/fixtures';
import { STAGES, STAGE_LABEL, stageWinners, stageComplete, teamStats } from './scoring';
import type { StandingEntry, MoversResult } from './scoring';

export type AwardKind = 'stage' | 'performance' | 'draft' | 'funny';

export interface Award {
  id: string;
  label: string;
  emoji: string;
  kind: AwardKind;
  detail?: string;
}

/** Funny awards the commissioner assigns by hand (no objective rule). */
export const CUSTOM_AWARDS: { id: string; label: string; emoji: string }[] = [
  { id: 'pain',     label: 'Pain & Suffering',      emoji: '😩' },
  { id: 'disaster', label: 'Group Stage Disaster',  emoji: '💥' },
  { id: 'cold',     label: 'Coldest Roster',        emoji: '🧊' },
  { id: 'thread',   label: 'Survived by a Thread',  emoji: '🧵' },
  { id: 'somehow',  label: 'Still Alive Somehow',   emoji: '🫥' },
  { id: 'buster',   label: 'Bracket Buster',        emoji: '🧨' },
  { id: 'chaos',    label: 'Chaos Manager',         emoji: '🌪️' },
  { id: 'lucky',    label: 'Better Lucky Than Good', emoji: '🍀' },
];
const CUSTOM_BY_ID = Object.fromEntries(CUSTOM_AWARDS.map(a => [a.id, a]));

const STAGE_EMOJI: Record<string, string> = {
  Group: '🥅', R32: '3️⃣', R16: '🔥', QF: '⚡', SF: '💪', Final: '🏆',
};

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

/** Count how many of a team's nations are still alive in the tournament. */
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

  // Stage champions — whoever scored most in each completed stage.
  for (const w of stageWinners(teams, scores, ko, scoring)) {
    push(w.team.id, {
      id: `stage-${w.stage}`,
      label: `${STAGE_LABEL[w.stage] || w.stage} Champion`,
      emoji: STAGE_EMOJI[w.stage] || '🏅',
      kind: 'stage',
      detail: `+${w.pts}`,
    });
  }

  // Tournament Champion — overall #1 once the Final is done.
  if (finalDone && standings[0]) {
    push(standings[0].team.id, { id: 'tourney-champ', label: 'Tournament Champion', emoji: '👑', kind: 'performance' });
  }

  // Champion / runner-up owners — from the final result.
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
    if (champTeam && winner) push(champTeam.id, { id: 'champ-owner', label: 'Champion Owner', emoji: '🏆', kind: 'draft', detail: NATION[winner]?.name });
    if (runnerTeam && runner) push(runnerTeam.id, { id: 'finalist-owner', label: 'Finalist Owner', emoji: '🥈', kind: 'draft', detail: NATION[runner]?.name });
  }

  // Most Teams Alive — unique leader, only meaningful once knockouts begin.
  if (groupDone && !finalDone) {
    const counts = teams.map(t => ({ t, n: aliveCount(t, ko, groupDone) }));
    const max = Math.max(...counts.map(c => c.n));
    const leaders = counts.filter(c => c.n === max && c.n > 0);
    if (max > 0 && leaders.length === 1) {
      push(leaders[0].t.id, { id: 'most-alive', label: 'Most Teams Alive', emoji: '🌳', kind: 'performance', detail: `${max} still in` });
    }
    // Last Team Standing — exactly one team has anyone left.
    const withAlive = counts.filter(c => c.n > 0);
    if (withAlive.length === 1 && counts.length > 1) {
      push(withAlive[0].t.id, { id: 'last-standing', label: 'Last Team Standing', emoji: '🛡️', kind: 'performance' });
    }
  }

  // Biggest Mover — most points gained on the latest matchday.
  if (movers.mover && (movers.delta[movers.mover.id] || 0) > 0) {
    push(movers.mover.id, { id: 'biggest-mover', label: 'Biggest Mover', emoji: '📈', kind: 'performance', detail: `+${movers.delta[movers.mover.id]}` });
  }

  // Commissioner-assigned funny awards.
  for (const a of custom || []) {
    const meta = CUSTOM_BY_ID[a.awardId];
    if (meta) push(a.teamId, { id: meta.id, label: meta.label, emoji: meta.emoji, kind: 'funny' });
  }

  return out;
}

/** Order awards within a team's trophy case by importance. */
const KIND_ORDER: Record<AwardKind, number> = { performance: 0, stage: 1, draft: 2, funny: 3 };
export function sortAwards(awards: Award[]): Award[] {
  return [...awards].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export { STAGES };
