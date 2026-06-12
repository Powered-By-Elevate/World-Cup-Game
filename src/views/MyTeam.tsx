import { NATION, POT_KEYS } from '../data/nations';
import { GROUP_MATCHES_OF, MATCHES } from '../data/fixtures';
import type { Match, KOMatch } from '../data/fixtures';
import type { LiveNowMatch } from '../data/liveResults';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry } from '../utils/scoring';
import { matchStatus } from '../utils/scoring';
import { parseDate, dayKeyOf, fmtDayLabel, fmtTime } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Avatar, Countdown, PotTag, teamGradient, AnimatedNumber } from '../components/shared';
import { CallCard } from './CallOfDay';
import type { CallsMap, NameInfo } from '../utils/calls';
import { PreDraftHome } from './PreDraftHome';

interface Props {
  myTeam: Team;
  state: AppState;
  scores: Record<string, ScoreEntry>;
  ko: KOMatch[];
  standings: StandingEntry[];
  setTab: (tab: string) => void;
  onTeamInvite: () => void;
  isCommish: boolean;
  commishName: string | null;
  onSetDraftTime: (ts: number | null) => void;
  calls: CallsMap;
  meId: string;
  names: Record<string, NameInfo>;
  onCall: (matchId: string, nationId: string) => void;
  liveNow?: LiveNowMatch[];
}

type MatchRow = Match & { nid: string; ko?: false };
type KORow = KOMatch & { nid: string; ko: true };
type Row = MatchRow | KORow;

export function MyTeam({ myTeam, state, scores, ko, standings, setTab, onTeamInvite, isCommish, commishName, onSetDraftTime, calls, meId, names, onCall, liveNow }: Props) {
  const drafted = state.draftDone && !!myTeam.picks;

  // Before the draft runs, the home screen is a hype poster, not an empty shell.
  if (!drafted) {
    return (
      <PreDraftHome
        team={myTeam}
        teams={state.teams || []}
        isCommish={isCommish}
        commishName={commishName}
        draftAt={state.draftAt ?? null}
        onSetDraftTime={onSetDraftTime}
        onStartDraft={() => setTab('draft')}
      />
    );
  }

  const grad = teamGradient(myTeam);
  const myIds = POT_KEYS.map(pk => myTeam.picks?.[pk]).filter(Boolean) as string[];
  const rank = standings.findIndex(s => s.team.id === myTeam.id) + 1;
  const st = standings.find(s => s.team.id === myTeam.id);

  const rows: Row[] = [];
  myIds.forEach(nid => (GROUP_MATCHES_OF[nid] || []).forEach(m => rows.push({ ...m, nid })));
  (ko || []).forEach(k => {
    if (myIds.includes(k.h) || myIds.includes(k.a))
      rows.push({ ko: true, ...k, nid: myIds.includes(k.h) ? k.h : k.a });
  });
  rows.sort((a, b) => (a.ko ? 'Z' + a.id : a.d).localeCompare(b.ko ? 'Z' + b.id : b.d));

  // "Next up" = the next match KICKING OFF anywhere in the tournament (not just
  // this team's) — the team's own upcoming games live in "Your fixtures" below.
  const nowMs = Date.now();
  const next = MATCHES
    .filter(m => matchStatus(m.d, scores[m.i]) !== 'ft' && parseDate(m.d).getTime() > nowMs)
    .sort((a, b) => parseDate(a.d).getTime() - parseDate(b.d).getTime())[0];

  return (
    <div className="content">
      {/* playing right now — blinking LIVE pill + scrolling ticker. The run of
          games is rendered twice and the track slides -50%, so long names and
          flags loop past instead of getting clipped; the copy is aria-hidden. */}
      {liveNow && liveNow.length > 0 && (
        <button className="live-banner" onClick={() => setTab('matches')}>
          <span className="lb-pill"><span className="lb-dot" />Live</span>
          <span className="lb-marquee">
            <span className="lb-track" style={{ animationDuration: `${Math.max(11, liveNow.length * 8)}s` }}>
              {[0, 1].map(dup => (
                <span key={dup} className="lb-run" aria-hidden={dup === 1}>
                  {liveNow.map((g, i) => (
                    <span key={i} className="lb-game">
                      <Flag id={g.h} size={20} ring="ink" shine={false} />
                      <b>{NATION[g.h]?.name || g.h}</b>
                      <span className="lb-vs">v</span>
                      <b>{NATION[g.a]?.name || g.a}</b>
                      <Flag id={g.a} size={20} ring="ink" shine={false} />
                      <span className="lb-now">Playing now</span>
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </span>
        </button>
      )}

      {/* hero */}
      <div className="card lux-sheen" style={{ overflow: 'hidden', border: '2px solid var(--ink)' }}>
        <div className="grad-live" style={{ background: grad, padding: '2px' }}>
          <div style={{ background: 'rgba(21,18,12,.82)', backdropFilter: 'blur(2px)', color: 'var(--paper)', padding: '18px 18px 20px', borderRadius: '13px' }}>
            <div className="between">
              <span className="eyebrow" style={{ color: 'var(--lime)' }}>Your Team</span>
              <span className="row" style={{ gap: 6 }}>
                {(myTeam.members || []).map((m, i) => <Avatar key={m.id} name={m.name} idx={i} size={26} />)}
              </span>
            </div>
            <div className="display" style={{ fontSize: 34, marginTop: 8, color: 'var(--paper)' }}>{myTeam.name}</div>
            {drafted && (
              <div className="row" style={{ gap: 20, marginTop: 14 }}>
                <div><AnimatedNumber className="num" style={{ fontSize: 38, color: 'var(--lime)', lineHeight: 1, display: 'inline-block' }} value={st?.total ?? 0} /><div className="eyebrow" style={{ color: '#CFCBBE' }}>Points</div></div>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,.18)' }} />
                <div><div className="num" style={{ fontSize: 38, lineHeight: 1 }}>#{rank}</div><div className="eyebrow" style={{ color: '#CFCBBE' }}>of {state.teams.length} teams</div></div>
              </div>
            )}
          </div>
        </div>
        {/* picks */}
        <div style={{ padding: '14px 14px 16px' }}>
          <div className="row" style={{ gap: 10, justifyContent: 'space-between' }}>
            {POT_KEYS.map(pot => (
              <div key={pot} style={{ flex: 1, textAlign: 'center' }}>
                <Flag id={myTeam.picks![pot]} size={56} ring="pot" />
                <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8 }}>{NATION[myTeam.picks![pot]].name}</div>
                <div style={{ marginTop: 4 }}><PotTag pot={pot} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Call of the Day — the one-tap daily habit, front and center */}
      <div style={{ marginTop: 14 }}>
        <CallCard calls={calls} scores={scores} meId={meId} names={names} onCall={onCall} onSeeBoard={() => setTab('arcade')} />
      </div>

      <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={onTeamInvite}>
        <Icon name="users" size={16} /> Invite your partner to this team
      </button>

      {drafted && <>
        {/* next match */}
        {next && (
          <>
            <div className="sec-head"><span className="eyebrow">Next up</span><span className="badge live"><span className="dot" />Soon</span></div>
            <div className="card pad" style={{ background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)' }}>
              <div className="between" style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 9 }}>
                  <Flag id={next.h} size={42} ring="pot" />
                  <div><div style={{ fontWeight: 800 }}>{NATION[next.h].name}</div><div className="eyebrow" style={{ color: '#9C988C' }}>vs {NATION[next.a].name}</div></div>
                </div>
                <Flag id={next.a} size={42} ring="pot" />
              </div>
              <div className="between" style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 14 }}>
                <div><div className="eyebrow" style={{ color: '#9C988C' }}>Group {next.g} · {next.c}</div><div style={{ fontWeight: 700, fontSize: 13, marginTop: 5 }}>{fmtDayLabel(dayKeyOf(next.d))} · {fmtTime(next.d).replace(' ET', '')}</div></div>
                <Countdown target={parseDate(next.d).getTime()} compact />
              </div>
            </div>
          </>
        )}

        {/* your fixtures */}
        <div className="sec-head"><span className="eyebrow">Your fixtures</span><span className="muted" style={{ fontSize: 12 }}>{rows.length} matches</span></div>
        <div className="card flat" style={{ overflow: 'hidden' }}>
          {rows.map((r, idx) => {
            const sc = r.ko ? { h: r.h_s, a: r.a_s, st: r.st } : scores[r.i];
            const done = sc && (sc.st === 'ft' || sc.st === 'live') && sc.h != null;
            const live = sc?.st === 'live';
            return (
              <div className="mrow mine" key={idx}>
                <div className="side">
                  <Flag id={r.h} size={30} ring={r.h === r.nid ? 'pot' : 'ink'} />
                  <span className="nm">{NATION[r.h].name}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  {done
                    ? <span className="scorebug">{sc.h}<span style={{ opacity: .4 }}>:</span>{sc.a}</span>
                    : <span className="scorebug sched">{r.ko ? r.round : fmtTime(r.d).replace(' ET', '')}</span>}
                  {live && <span className="badge live" style={{ height: 16, fontSize: 8 }}><span className="dot" />LIVE</span>}
                  {done && !live && <span className="badge ft" style={{ height: 16, fontSize: 8 }}>FT</span>}
                </div>
                <div className="side away">
                  <Flag id={r.a} size={30} ring={r.a === r.nid ? 'pot' : 'ink'} />
                  <span className="nm">{NATION[r.a].name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}
