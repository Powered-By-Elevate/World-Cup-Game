import { useState, useEffect, useMemo } from 'react';
import { NATION } from '../data/nations';
import type { ScoreEntry } from '../data/types';
import { parseDate, fmtTime, fmtDayLabel, dayKeyOf } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Avatar, Countdown } from '../components/shared';
import { todaySlate, nextSlate, isCallOpen, callVerdict, callerStats } from '../utils/calls';
import type { CallsMap, NameInfo } from '../utils/calls';
import type { Match } from '../data/fixtures';

export interface Common {
  calls: CallsMap;
  scores: Record<string, ScoreEntry>;
  meId: string;
  names: Record<string, NameInfo>;
  onCall: (matchId: string, nationId: string) => void;
}

/** Re-render on a slow clock so the open call advances + the countdown ticks. */
function useNow(ms = 20000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/* ---------- one compact row per fixture in the day's slate ---------- */
function CallRow({ m, now, pick, scores, onCall }: {
  m: Match; now: number; pick?: string;
  scores: Record<string, ScoreEntry>; onCall: (matchId: string, nationId: string) => void;
}) {
  const open = isCallOpen(m, now);
  const sc = scores[m.i];
  const verdict = pick ? callVerdict(m.i, pick, scores) : null;

  const side = (nid: string, right: boolean) => {
    const cls = 'cod-side' + (right ? ' right' : '')
      + (pick === nid ? ' picked' : pick || !open ? ' dim' : ' open');
    return (
      <button className={cls} disabled={!open || !!pick} onClick={() => onCall(m.i, nid)}>
        <Flag id={nid} size={30} ring={pick === nid ? 'pot' : 'ink'} />
        <span className="cn">{NATION[nid].name}</span>
      </button>
    );
  };

  const meta = open
    ? (pick
      ? <>🔒<br />{fmtTime(m.d).replace(' ET', '')}</>
      : <>{fmtTime(m.d).replace(' ET', '')}</>)
    : verdict === 'correct' ? <span className="ok">✓ Right</span>
    : verdict === 'wrong' ? <span className="bad">✗ Wrong</span>
    : verdict === 'push' ? <>Push</>
    : sc?.st === 'ft' ? <>FT {sc.h}–{sc.a}</>
    : sc?.st === 'live' ? <span className="bad">● Live</span>
    : pick ? <>🔒 In play</>
    : <>Missed</>;

  return (
    <div className="cod-row">
      {side(m.h, false)}
      <span className="call-vs" style={{ fontSize: 12 }}>VS</span>
      {side(m.a, true)}
      <div className="cod-meta">{meta}</div>
    </div>
  );
}

/* ---------- the day's calls (used on Home + atop the Callers tab) ---------- */
export function CallCard({ calls, scores, meId, names, onCall, onSeeBoard }: Common & { onSeeBoard?: () => void }) {
  const now = useNow();
  const slate = todaySlate(now);
  const upcoming = nextSlate(now);
  const stats = useMemo(() => callerStats(calls, scores, names), [calls, scores, names]);
  const mine = stats.find(s => s.memberId === meId);
  const myRank = stats.findIndex(s => s.memberId === meId) + 1;
  const leader = stats[0];
  const called = slate.filter(m => calls[meId]?.[m.i]).length;

  return (
    <div className="card pad" style={{ background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)' }}>
      <div className="between" style={{ marginBottom: 14 }}>
        <span className="eyebrow" style={{ color: 'var(--lime)' }}>⚡ Calls of the Day</span>
        {mine && mine.streak > 1 ? (
          <span className="streak-chip"><Icon name="flame" size={11} />{mine.streak} streak</span>
        ) : slate.length > 0 ? (
          <span className="eyebrow" style={{ color: '#9C988C' }}>{called}/{slate.length} called</span>
        ) : null}
      </div>

      {slate.length > 0 ? (
        /* --- today's slate: call every game --- */
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            {slate.map(m => (
              <CallRow key={m.i} m={m} now={now} pick={calls[meId]?.[m.i]} scores={scores} onCall={onCall} />
            ))}
          </div>
          {called < slate.length && slate.some(m => isCallOpen(m, now)) && (
            <p style={{ fontSize: 12, marginTop: 12, marginBottom: 0, color: '#9C988C', textAlign: 'center' }}>
              Tap who wins in each game — picks lock at kickoff.
            </p>
          )}
        </>
      ) : upcoming.length > 0 ? (
        /* --- rest day: point at the next slate --- */
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <div style={{ fontFamily: 'Anton, sans-serif', textTransform: 'uppercase', fontSize: 22 }}>No games today</div>
          <p style={{ fontSize: 13, marginTop: 6, marginBottom: 10, color: '#9C988C' }}>
            {upcoming.length} {upcoming.length === 1 ? 'game' : 'games'} to call {fmtDayLabel(dayKeyOf(upcoming[0].d))}.
          </p>
          <Countdown target={parseDate(upcoming[0].d).getTime()} compact />
        </div>
      ) : (
        /* --- group stage over --- */
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <div style={{ fontFamily: 'Anton, sans-serif', textTransform: 'uppercase', fontSize: 22 }}>That's a wrap</div>
          <p style={{ fontSize: 13, marginTop: 6, color: '#9C988C' }}>
            {mine ? `You called ${mine.called} matches — ${mine.correct} right.` : 'No more calls for now.'}
          </p>
        </div>
      )}

      {stats.length > 0 && (
        <div className="between" style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 12, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {leader && (
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                👑 {leader.name} · {leader.correct} right
              </div>
            )}
            {mine && (
              <div className="eyebrow" style={{ color: '#9C988C', marginTop: 4 }}>
                You · #{myRank} · {mine.correct}/{mine.decided} right
              </div>
            )}
          </div>
          {onSeeBoard && (
            <button className="btn btn-sm" style={{ background: 'var(--lime)', flex: '0 0 auto' }} onClick={onSeeBoard}>
              Best Callers <Icon name="chevron" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Best Caller standings (lives on the Arcade Leaderboards tab) ---------- */
export function BestCallers({ calls, scores, meId, names }: Omit<Common, 'onCall'>) {
  const stats = useMemo(() => callerStats(calls, scores, names), [calls, scores, names]);

  return (
    <div>
      <div className="sec-head">
        <span className="eyebrow">🏅 Best Caller</span>
        <span className="muted" style={{ fontSize: 12 }}>1 pt / correct · draws don't count</span>
      </div>

      {stats.length === 0 ? (
        <div className="card pad" style={{ textAlign: 'center' }}>
          <div className="h2">No calls yet</div>
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            Make the Calls of the Day in the Arcade — every right pick climbs you up this board.
          </p>
        </div>
      ) : (
        <div className="card flat" style={{ overflow: 'hidden' }}>
          {stats.map((s, i) => {
            const rank = i + 1;
            const isMe = s.memberId === meId;
            return (
              <div key={s.memberId} className="caller-row" style={{ background: isMe ? 'rgba(200,242,60,.1)' : 'transparent' }}>
                <span className={`rank ${rank <= 3 ? 'r' + rank : ''}`} style={{ fontSize: 20, width: 28 }}>{rank}</span>
                <Avatar name={s.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                    {isMe && <span className="badge you">You</span>}
                    {s.streak > 1 && <span className="streak-chip"><Icon name="flame" size={10} />{s.streak}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                    {s.decided ? `${Math.round(s.accuracy * 100)}% · ${s.correct}-${s.wrong}` : 'no results yet'}
                    {s.pending ? ` · ${s.pending} pending` : ''}
                    {s.best > 1 ? ` · best ${s.best}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 24, lineHeight: 1 }}>{s.correct}</div>
                  <div className="eyebrow" style={{ fontSize: 8 }}>RIGHT</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
        Every game, every day. Tap who you think wins before kickoff — each pick locks in and scores
        when that match ends. A draw is a push: no points, no harm.
      </p>
    </div>
  );
}
