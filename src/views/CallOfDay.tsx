import { useState, useEffect, useMemo } from 'react';
import { NATION } from '../data/nations';
import type { ScoreEntry } from '../data/types';
import { parseDate, fmtTime, fmtDayLabel, dayKeyOf } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Avatar, Countdown } from '../components/shared';
import { openCall, callerStats } from '../utils/calls';
import type { CallsMap, NameInfo } from '../utils/calls';

interface Common {
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

const kickoff = (d: string) => `${fmtDayLabel(dayKeyOf(d))} · ${fmtTime(d).replace(' ET', '')}`;

/* ---------- the one-tap daily call (used on Home + atop the Callers tab) ---------- */
export function CallCard({ calls, scores, meId, names, onCall, onSeeBoard }: Common & { onSeeBoard?: () => void }) {
  const now = useNow();
  const open = openCall(now);
  const stats = useMemo(() => callerStats(calls, scores, names), [calls, scores, names]);
  const mine = stats.find(s => s.memberId === meId);
  const myRank = stats.findIndex(s => s.memberId === meId) + 1;
  const leader = stats[0];
  const myPick = open ? calls[meId]?.[open.i] : undefined;

  return (
    <div className="card pad" style={{ background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)' }}>
      <div className="between" style={{ marginBottom: 14 }}>
        <span className="eyebrow" style={{ color: 'var(--lime)' }}>⚡ Call of the Day</span>
        {mine && mine.streak > 1 && (
          <span className="streak-chip"><Icon name="flame" size={11} />{mine.streak} streak</span>
        )}
      </div>

      {open ? (myPick ? (
        /* --- locked: your call is in --- */
        <>
          <div className="row" style={{ gap: 10 }}>
            {[open.h, open.a].map(nid => (
              <div key={nid} className={'call-opt ' + (nid === myPick ? 'picked' : 'dimmed')}>
                <Flag id={nid} size={44} ring={nid === myPick ? 'pot' : 'ink'} />
                <span className="cn">{NATION[nid].name}</span>
                {nid === myPick && (
                  <span className="badge" style={{ background: 'var(--ink)', color: 'var(--lime)', height: 18 }}>
                    <Icon name="check" size={11} /> Your call
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="between" style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 12 }}>
            <div>
              <div className="eyebrow" style={{ color: '#9C988C' }}>🔒 Locked · Group {open.g}</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 5 }}>{kickoff(open.d)}</div>
            </div>
            <Countdown target={parseDate(open.d).getTime()} compact />
          </div>
        </>
      ) : (
        /* --- open: make the call --- */
        <>
          <div className="between" style={{ marginBottom: 12 }}>
            <span style={{ fontFamily: 'Anton, sans-serif', textTransform: 'uppercase', fontSize: 20 }}>Who wins?</span>
            <span style={{ fontSize: 11.5, color: '#9C988C' }}>{kickoff(open.d)}</span>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="call-opt" onClick={() => onCall(open.i, open.h)}>
              <Flag id={open.h} size={48} ring="pot" />
              <span className="cn">{NATION[open.h].name}</span>
            </button>
            <span className="call-vs">VS</span>
            <button className="call-opt" onClick={() => onCall(open.i, open.a)}>
              <Flag id={open.a} size={48} ring="pot" />
              <span className="cn">{NATION[open.a].name}</span>
            </button>
          </div>
          <p style={{ fontSize: 12, marginTop: 12, marginBottom: 0, color: '#9C988C', textAlign: 'center' }}>
            One tap — no soccer knowledge required. Pick a side and lock it in.
          </p>
        </>
      )) : (
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

/* ---------- the Calls tab: call card + Best Caller standings ---------- */
export function CallersBoard({ calls, scores, meId, names, onCall }: Common) {
  const stats = useMemo(() => callerStats(calls, scores, names), [calls, scores, names]);

  return (
    <div className="content">
      <CallCard calls={calls} scores={scores} meId={meId} names={names} onCall={onCall} />

      <div className="sec-head">
        <span className="eyebrow">🏅 Best Caller</span>
        <span className="muted" style={{ fontSize: 12 }}>1 pt / correct · draws don't count</span>
      </div>

      {stats.length === 0 ? (
        <div className="card pad" style={{ textAlign: 'center' }}>
          <div className="h2">No calls yet</div>
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            Make the Call of the Day above — every right pick climbs you up this board.
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
        Each day, one match. Tap who you think wins before kickoff — it locks in and scores when the
        match ends. A draw is a push: no points, no harm.
      </p>
    </div>
  );
}
