import type { KOMatch } from './fixtures';
import { NATIONS } from './nations';

export interface Member {
  id: string;
  name: string;
  /** Auth account this member is linked to. Absent on legacy/pre-account
   *  members until they sign in and claim their record. */
  uid?: string;
  /** Account email. Set when the commissioner reserves a slot "by email", or
   *  captured automatically from the signed-in account on first link. Stored
   *  lowercased so sign-in matching is case-insensitive. */
  email?: string;
}

export interface Team {
  id: string;
  name: string;
  members: Member[];
  picks: Record<string, string> | null;
}

export interface Scoring {
  win: number;
  draw: number;
  bonuses: boolean;
  b: Record<string, number>;
}

export interface AppState {
  teams: Team[];
  draftDone: boolean;
  board: BoardPick[];
  scoring: Scoring;
  ko: KOMatch[];
  pots: Record<string, string[]>;
  commissioner: string | null;
  leagueName: string;
  /** Scheduled draft time (epoch ms) the pre-draft countdown ticks toward.
   *  Purely cosmetic — the commissioner still starts the draft manually. */
  draftAt?: number | null;
  v: number;
}

export interface BoardPick {
  pickNo: number;
  teamId: string;
  nationId: string;
  pot: string;
}

export interface ScoreEntry {
  h: number | null;
  a: number | null;
  st: string;
}

export interface MeState {
  id: string;
  name: string;
  teamId: string;
}

export const DEFAULT_SCORING: Scoring = {
  win: 3,
  draw: 1,
  bonuses: true,
  b: { R32: 2, R16: 4, QF: 6, SF: 8, Final: 10, CHAMP: 15 },
};

export function defaultPots(): Record<string, string[]> {
  const pots: Record<string, string[]> = { FAV: [], UND: [], LNG: [] };
  NATIONS.forEach(n => { pots[n.pot].push(n.id); });
  return pots;
}

export function defaultState(): AppState {
  return {
    teams: [],
    draftDone: false,
    board: [],
    scoring: DEFAULT_SCORING,
    ko: [],
    pots: defaultPots(),
    commissioner: null,
    leagueName: '',
    draftAt: null,
    v: 1,
  };
}

export function withDefaults(s: Partial<AppState> | null): AppState {
  const d = defaultState();
  if (!s) return d;
  return {
    teams: Array.isArray(s.teams) ? s.teams : [],
    draftDone: !!s.draftDone,
    board: Array.isArray(s.board) ? s.board : [],
    scoring: s.scoring || DEFAULT_SCORING,
    ko: Array.isArray(s.ko) ? s.ko : [],
    pots: s.pots && s.pots.FAV ? s.pots : defaultPots(),
    commissioner: s.commissioner || null,
    leagueName: typeof s.leagueName === 'string' ? s.leagueName : '',
    draftAt: typeof s.draftAt === 'number' ? s.draftAt : null,
    v: 1,
  };
}
