import { useState } from 'react';
import { NATION, POT_KEYS } from '../data/nations';
import { GROUP_LETTERS } from '../data/fixtures';
import type { AppState, ScoreEntry, Team } from '../data/types';
import type { StandingEntry, MoversResult, StageWinner } from '../utils/scoring';
import { groupTable, STAGE_LABEL } from '../utils/scoring';
import type { Award } from '../utils/awards';
import { sortAwards } from '../utils/awards';
import { fmtDayLabel } from '../utils/helpers';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { Avatar, TeamFlags, teamGradient } from '../components/shared';

interface Props {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  standings: StandingEntry[];
  movers: MoversResult;
  myTeam: Team | null;
  stageWins: StageWinner[];
  awardsByTeam: Record<string, Award[]>;
  aliveByTeam: Record<string, number>;
  koStarted: boolean;
}

export function TableView({ state, scores, standings, movers, myTeam, stageWins, awardsByTeam, aliveByTeam, koStarted }: Props) {
  const [mode, setMode] = useState<'couples' | 'groups'>('couples');
  const [open, setOpen] = useState<string | null>(null);
  const [grp, setGrp] = useState('A');
  const myIds = myTeam?.picks ? POT_KEYS.map(pk => myTeam.picks![pk]) : [];

  if (!state.draftDone) return (
    <div className="content">
      <div className="card pad" style={{ textAlign: 'center' }}>
        <div className="h2">No standings yet</div>
        <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>Run the draft first, then results roll in here live.</p>
      </div>
    </div>
  );

  const mover = movers.mover;
  const moverGain = mover ? movers.delta[mover.id] : 0;

  return (
    <div className="content">
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={mode === 'couples' ? 'on' : ''} onClick={() => setMode('couples')}>Couples</button>
        <button className={mode === 'groups' ? 'on' : ''} onClick={() => setMode('groups')}>Groups</button>
      </div>

      {mode === 'couples' ? <>
        {/* stage champions — a trophy for whoever scored most in each completed stage */}
        {stageWins.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="sec-head"><span className="eyebrow">🏆 Stage Champions</span><span className="muted" style={{ fontSize: 12 }}>most points that stage</span></div>
            <div className="scroll-x">
              {stageWins.map(w => (
                <div key={w.stage} className="card flat" style={{ minWidth: 150, padding: '12px 14px', flex: '0 0 auto' }}>
                  <div className="eyebrow" style={{ fontSize: 10, color: 'var(--gold)' }}>{STAGE_LABEL[w.stage] || w.stage}</div>
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <Avatar name={w.team.name} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.team.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>+{w.pts} pts</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* biggest mover */}
        {mover && moverGain > 0 && (
          <div className="card" style={{ overflow: 'hidden', border: '2px solid var(--ink)' }}>
            <div style={{ background: teamGradient(mover), padding: '2px' }}>
              <div style={{ background: 'rgba(21,18,12,.84)', color: 'var(--paper)', borderRadius: 13, padding: '16px 16px 18px' }}>
                <div className="eyebrow" style={{ color: 'var(--lime)' }}>📈 Biggest mover · {movers.latest ? fmtDayLabel(movers.latest) : ''}</div>
                <div className="between" style={{ marginTop: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 26 }}>{mover.name}</div>
                    <div style={{ marginTop: 10 }}><TeamFlags team={mover} size={36} /></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 46, color: 'var(--lime)', lineHeight: .9 }}>+{moverGain}</div>
                    <div className="eyebrow" style={{ color: '#CFCBBE' }}>points</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="sec-head"><span className="eyebrow">Live standings</span><span className="muted" style={{ fontSize: 12 }}>tap to expand</span></div>
        <div className="card flat" style={{ overflow: 'hidden' }}>
          {standings.map((s, i) => {
            const t = s.team;
            const rank = i + 1; const isOpen = open === t.id;
            const gained = movers.delta[t.id] || 0;
            return (
              <div key={t.id} style={{ borderBottom: i < standings.length - 1 ? '1px solid var(--line-2)' : '0', background: t.id === myTeam?.id ? 'rgba(200,242,60,.1)' : 'transparent' }}>
                <div className="lb-row" onClick={() => setOpen(isOpen ? null : t.id)} style={{ borderBottom: 0 }}>
                  <span className={`rank ${rank <= 3 ? 'r' + rank : ''}`}>{rank}</span>
                  <span className="grad-bar" style={{ background: teamGradient(t) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <span style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                      {rank === 1 && <Icon name="trophy" size={15} />}
                      {t.id === myTeam?.id && <span className="badge you">You</span>}
                    </div>
                    <div style={{ marginTop: 5 }}><TeamFlags team={t} size={24} /></div>
                    {(() => {
                      const aw = sortAwards(awardsByTeam[t.id] || []);
                      const alive = aliveByTeam[t.id] ?? 0;
                      if (!aw.length && !koStarted) return null;
                      return (
                        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {aw.length > 0 && <span className="badge" style={{ fontSize: 10, background: 'var(--lime)' }}>🏆 {aw.length}</span>}
                          {koStarted && <span className="badge" style={{ fontSize: 10 }}>{alive} still in</span>}
                          {aw[0] && <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{aw[0].emoji} {aw[0].label}</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="row" style={{ gap: 13 }}>
                    {gained > 0 && <span style={{ color: 'var(--up)', display: 'flex', alignItems: 'center' }}><Icon name="arrow" size={13} /></span>}
                    <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 24, lineHeight: 1 }}>{s.total}</div><div className="eyebrow" style={{ fontSize: 8 }}>PTS</div></div>
                  </div>
                </div>
                {isOpen && (
                  <div className="fade-in" style={{ padding: '2px 14px 14px' }}>
                    <div className="row" style={{ gap: 14, padding: '4px 0 12px', justifyContent: 'center' }}>
                      {[['GD', (s.gd > 0 ? '+' : '') + s.gd], ['GF', s.gf], ['GA', s.ga], ['W-D-L', `${s.w}-${s.d}-${s.l}`]].map(([k, v]) => (
                        <div className="statbox" key={k}><div className="v" style={{ fontSize: 18 }}>{v}</div><div className="k">{k}</div></div>
                      ))}
                    </div>
                    {POT_KEYS.map(pk => {
                      const ns = s.per[pk]; if (!ns) return null;
                      const nid = t.picks![pk];
                      return (
                        <div key={pk} className="between" style={{ padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
                          <div className="row" style={{ gap: 9 }}>
                            <Flag id={nid} size={30} ring="pot" />
                            <div><div style={{ fontWeight: 700, fontSize: 13 }}>{NATION[nid].name}</div><div className="muted" style={{ fontSize: 11 }}>{ns.w}W {ns.d}D {ns.l}L · {ns.gf}-{ns.ga}{ns.champ ? ' · 🏆' : ''}</div></div>
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            {ns.bonus > 0 && <span className="badge" style={{ background: 'var(--lime)' }}>+{ns.bonus} bonus</span>}
                            <span className="num" style={{ fontSize: 18 }}>{ns.total}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </> : <>
        {/* GROUPS */}
        <div className="scroll-x" style={{ marginBottom: 14 }}>
          {GROUP_LETTERS.map(g => (
            <button key={g} className={`chip ${grp === g ? 'on' : ''}`} onClick={() => setGrp(g)} style={{ minWidth: 42, justifyContent: 'center' }}>{g}</button>
          ))}
        </div>
        <div className="card flat" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '13px 14px 11px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontFamily: 'Anton, Archivo, sans-serif', textTransform: 'uppercase', fontSize: 18 }}>Group {grp}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>P W D L · GD · PTS</span>
          </div>
          {groupTable(grp, scores).map((r, i, arr) => {
            const mine = myIds.includes(r.id);
            const q = i < 2 ? 'q' : i === 2 ? 'p' : '';
            return (
              <div key={r.id} className="between" style={{ padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : '0', background: mine ? 'rgba(200,242,60,.12)' : 'transparent' }}>
                <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ width: 5, height: 30, borderRadius: 3, background: q === 'q' ? 'var(--up)' : q === 'p' ? 'var(--gold)' : 'transparent' }} />
                  <Flag id={r.id} size={32} ring={mine ? 'pot' : 'ink'} />
                  <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{NATION[r.id].name}</span>
                  {mine && <span className="badge you" style={{ height: 18 }}>You</span>}
                </div>
                <div className="row" style={{ gap: 11 }}>
                  <span className="muted tnum" style={{ fontSize: 12, width: 58, textAlign: 'right' }}>{r.p} {r.w} {r.d} {r.l}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, width: 24, textAlign: 'right' }}>{r.gd > 0 ? '+' : ''}{r.gd}</span>
                  <span className="num" style={{ fontSize: 20, width: 24, textAlign: 'right' }}>{r.pts}</span>
                </div>
              </div>
            );
          })}
          <div className="row" style={{ gap: 14, padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
            <span className="row" style={{ gap: 5, fontSize: 11 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--up)' }} /><span className="muted">Qualify</span></span>
            <span className="row" style={{ gap: 5, fontSize: 11 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gold)' }} /><span className="muted">Playoff</span></span>
          </div>
        </div>
      </>}
    </div>
  );
}
