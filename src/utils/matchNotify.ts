/* ============================================================
   MATCH NOTIFICATIONS — detect kickoffs + final results for the
   nations a league has drafted, so we can ping the people who own
   them. Pure/stateless: it reconciles the live feed against a shared
   "already-notified" set (wc:matchwatch) and returns the NEW events
   plus the updated set. The app fans the events out to the in-app
   feed + web push, and persists the set so it fires once per league
   no matter how many clients are open. First run seeds silently (no
   backfill spam when the feature first sees a tournament in progress).

   Points earned by a match = a team's total WITH the match minus its
   total with that one match excluded — reusing the real scoring.
   ============================================================ */
import { MATCHES, MATCH_DATE } from '../data/fixtures';
import type { KOMatch } from '../data/fixtures';
import { NATION } from '../data/nations';
import { teamStats } from './scoring';
import { parseDate } from './helpers';
import type { Team, Scoring, ScoreEntry } from '../data/types';

export interface MatchEventRecipient { memberId: string; name: string; body: string; }
export interface MatchEvent { key: string; kind: 'start' | 'result' | 'soon'; title: string; recipients: MatchEventRecipient[]; }

const nm = (id: string) => NATION[id]?.name || id;
const START_WINDOW = 20 * 60 * 1000;          // only ping "kickoff" within 20 min of the scheduled start
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const picksOf = (t: Team) => Object.values(t.picks || {});

/** Members whose team drafted the home or away nation, tagged with which one is theirs. */
function holders(teams: Team[], h: string, a: string) {
  const out: { memberId: string; name: string; team: Team; nid: string }[] = [];
  for (const t of teams) {
    const p = picksOf(t);
    const nid = p.includes(h) ? h : p.includes(a) ? a : null;
    if (!nid) continue;
    for (const mem of (t.members || [])) out.push({ memberId: mem.id, name: mem.name, team: t, nid });
  }
  return out;
}

function pointsForGroup(team: Team, matchId: string, scores: Record<string, ScoreEntry>, ko: KOMatch[], scoring: Scoring): number {
  const now = teamStats(team, scores, ko, scoring).total;
  const s2 = { ...scores };
  if (s2[matchId]) s2[matchId] = { ...s2[matchId], st: 'sched' };
  return now - teamStats(team, s2, ko, scoring).total;
}
function pointsForKo(team: Team, k: KOMatch, scores: Record<string, ScoreEntry>, ko: KOMatch[], scoring: Scoring): number {
  const now = teamStats(team, scores, ko, scoring).total;
  const ko2 = ko.map(x => (x === k ? { ...x, st: 'sched' } : x));
  return now - teamStats(team, scores, ko2, scoring).total;
}

export function detectMatchEvents(
  teams: Team[],
  scores: Record<string, ScoreEntry>,
  ko: KOMatch[],
  scoring: Scoring,
  watch: Record<string, number> | null,
  now = Date.now(),
): { events: MatchEvent[]; watch: Record<string, number> } {
  const fresh = watch == null;                 // first run for this league → seed, don't notify
  const w: Record<string, number> = { ...(watch || {}) };
  const events: MatchEvent[] = [];

  const startEvent = (key: string, h: string, a: string, when: string | undefined, knockout: boolean) => {
    if (w[key]) return;
    w[key] = now;
    const recent = when ? (now - parseDate(when).getTime() < START_WINDOW) : false;
    if (fresh || !recent) return;
    const rec = holders(teams, h, a);
    if (!rec.length) return;
    events.push({
      key, kind: 'start', title: `⚽ Kickoff — ${nm(h)} vs ${nm(a)}`,
      recipients: rec.map(r => ({ memberId: r.memberId, name: r.name, body: `Your ${nm(r.nid)} is playing${knockout ? ' a knockout' : ''} now. ${nm(h)} vs ${nm(a)}.` })),
    });
  };

  // ---- group stage (keyed by the scores map) ----
  for (const m of MATCHES) {
    const s = scores[m.i];
    if (!s) continue;
    if (s.st === 'live' || s.st === 'ft') startEvent(`g:${m.i}:start`, m.h, m.a, MATCH_DATE[m.i], false);
    if (s.st === 'ft' && s.h != null && s.a != null) {
      const key = `g:${m.i}:result`;
      if (!w[key]) {
        w[key] = now;
        const rec = fresh ? [] : holders(teams, m.h, m.a);
        if (rec.length) events.push({
          key, kind: 'result', title: `Full time — ${nm(m.h)} ${s.h}–${s.a} ${nm(m.a)}`,
          recipients: rec.map(r => ({
            memberId: r.memberId, name: r.name,
            body: `${nm(m.h)} ${s.h}–${s.a} ${nm(m.a)} · your ${nm(r.nid)}: ${signed(pointsForGroup(r.team, m.i, scores, ko, scoring))} pts`,
          })),
        });
      }
    }
  }

  // ---- knockouts (keyed by the ko array) ----
  for (const k of (ko || [])) {
    const base = `k:${k.id}`;
    if (k.st === 'live' || k.st === 'ft') startEvent(`${base}:start`, k.h, k.a, k.d, true);
    if (k.st === 'ft' && k.h_s != null && k.a_s != null) {
      const key = `${base}:result`;
      if (!w[key]) {
        w[key] = now;
        const rec = fresh ? [] : holders(teams, k.h, k.a);
        if (rec.length) events.push({
          key, kind: 'result', title: `Full time — ${nm(k.h)} ${k.h_s}–${k.a_s} ${nm(k.a)}`,
          recipients: rec.map(r => ({
            memberId: r.memberId, name: r.name,
            body: `${nm(k.h)} ${k.h_s}–${k.a_s} ${nm(k.a)} · your ${nm(r.nid)}: ${signed(pointsForKo(r.team, k, scores, ko, scoring))} pts`,
          })),
        });
      }
    }
  }

  return { events, watch: w };
}

const REMIND_LEAD = 30 * 60 * 1000;   // remind ~30 min before kickoff
const REMIND_FLOOR = 5 * 60 * 1000;   // ...but not once we're inside 5 min (the kickoff ping covers it)

/** A not-yet-started match resolved to nation ids + ISO kickoff (from the feed). */
export interface UpcomingMatch { key: string; h: string; a: string; kickoff: string; knockout: boolean; }

/** Advance "your match is coming up" reminders. Fires once per match, only
 *  inside the [FLOOR, LEAD] window before kickoff, to whoever drafted either
 *  nation. Like detectMatchEvents it claims keys in the shared watch set so it
 *  fires once per league across all clients + the server tick; first run seeds
 *  silently. kickoff is the feed's ISO-UTC time, parsed directly (NOT via the
 *  ET-only parseDate used for the static fixtures). */
export function detectUpcoming(
  teams: Team[],
  upcoming: UpcomingMatch[],
  watch: Record<string, number> | null,
  now = Date.now(),
  leadMs = REMIND_LEAD,
): { events: MatchEvent[]; watch: Record<string, number> } {
  const fresh = watch == null;
  const w: Record<string, number> = { ...(watch || {}) };
  const events: MatchEvent[] = [];

  for (const u of upcoming) {
    const key = `${u.key}:soon`;
    if (w[key]) continue;
    const remain = new Date(u.kickoff).getTime() - now;
    if (!Number.isFinite(remain) || remain <= 0 || remain > leadMs) continue;  // outside the window → re-check later
    w[key] = now;                                  // claim now so a later tick can't double-fire it
    if (fresh || remain < REMIND_FLOOR) continue;  // seed silently; too-close is the kickoff ping's job
    const rec = holders(teams, u.h, u.a);
    if (!rec.length) continue;
    const mins = Math.max(5, Math.round(remain / 60000 / 5) * 5);   // rounded to 5 min for a natural-sounding ETA
    events.push({
      key, kind: 'soon', title: `⏰ ${nm(u.h)} vs ${nm(u.a)} soon`,
      recipients: rec.map(r => ({
        memberId: r.memberId, name: r.name,
        body: `Your ${nm(r.nid)} plays${u.knockout ? ' a knockout' : ''} in about ${mins} minutes. ${nm(u.h)} vs ${nm(u.a)}.`,
      })),
    });
  }

  return { events, watch: w };
}
