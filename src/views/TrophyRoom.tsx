/* ============================================================
   TROPHY CABINET — personal furniture cabinet (won-only, grows) +
   League honours grid + inspect overlay. Ported from the MATCHDAY design.
   ============================================================ */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Team } from '../data/types';
import type { Award } from '../utils/awards';
import { holdersByTrophy } from '../utils/awards';
import type { TrophyMeta } from '../data/trophies';
import { TROPHY_CATALOG, AUTO_TROPHIES, COMMISH_TROPHIES } from '../data/trophies';
import { Trophy } from '../components/Trophy';
import { Icon } from '../components/Icon';
import { Member, Confetti, teamGradient } from '../components/shared';

interface Props {
  teams: Team[];
  awardsByTeam: Record<string, Award[]>;
  myTeam: Team | null;
  isCommish: boolean;
  onSetAwardHolder: (awardId: string, teamId: string | null) => void;
  onShare: (msg: string) => void;
}

export function TrophyRoom({ teams, awardsByTeam, myTeam, isCommish, onSetAwardHolder, onShare }: Props) {
  const [view, setView] = useState<'mine' | 'league'>('mine');
  const [inspectId, setInspectId] = useState<string | null>(null);

  const holders = holdersByTrophy(awardsByTeam);
  const teamById = (id?: string | null) => teams.find(t => t.id === id) || null;

  const myWon = myTeam ? TROPHY_CATALOG.filter(t => holders[t.id] === myTeam.id) : [];
  const awarded = TROPHY_CATALOG.filter(t => holders[t.id]).length;

  const baseList: TrophyMeta[] = view === 'mine' ? myWon : TROPHY_CATALOG;
  const inspectList = (inspectId && !baseList.some(t => t.id === inspectId)) ? TROPHY_CATALOG : baseList;
  const inspectIdx = inspectId ? inspectList.findIndex(t => t.id === inspectId) : -1;

  const Slot = ({ t }: { t: TrophyMeta }) => {
    const holder = teamById(holders[t.id]);
    return (
      <button className={`cab-slot ${holder ? 'lit' : 'locked'}`} onClick={() => setInspectId(t.id)}>
        {holder && <span className="cab-spot" />}
        <Trophy id={t.id} size={76} locked={!holder} />
        <span className="cab-plate">{t.name}</span>
        {holder
          ? <span className="cab-holder other"><span className="gd" style={{ background: teamGradient(holder) }} />{holder.name}</span>
          : <span className="cab-holder open">Up for grabs</span>}
      </button>
    );
  };

  const Shelves = ({ items }: { items: TrophyMeta[] }) => {
    const rows: TrophyMeta[][] = [];
    for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
    return <>{rows.map((row, ri) => (
      <div className="cab-shelf" key={ri}>
        <div className="cab-row">{row.map(t => <Slot key={t.id} t={t} />)}</div>
        <div className="cab-floor" />
      </div>
    ))}</>;
  };

  const autoHeld = AUTO_TROPHIES.filter(t => holders[t.id]).length;
  const commishHeld = COMMISH_TROPHIES.filter(t => holders[t.id]).length;

  return (
    <div className="content">
      {/* header */}
      <div className="card pad">
        <div className="between" style={{ marginBottom: view === 'league' ? 13 : 0 }}>
          <div>
            <div className="eyebrow">{view === 'mine' ? 'Your honours' : 'League honours'}</div>
            <h2 className="display" style={{ fontSize: 26, marginTop: 3 }}>{view === 'mine' ? (myTeam?.name || 'Your cabinet') : 'Who holds what'}</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 30, lineHeight: 1, color: 'var(--gold)' }}>{view === 'mine' ? myWon.length : awarded}</div>
            <div className="eyebrow">{view === 'mine' ? (myWon.length === 1 ? 'trophy' : 'trophies') : `of ${TROPHY_CATALOG.length} awarded`}</div>
          </div>
        </div>
        {view === 'league' && (
          <div className="cab-progwrap"><div className="cab-prog"><span style={{ width: `${awarded / TROPHY_CATALOG.length * 100}%` }} /></div><Icon name="trophy" size={18} /></div>
        )}
      </div>

      {/* view toggle */}
      <div className="seg" style={{ margin: '14px 0' }}>
        <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>My Cabinet</button>
        <button className={view === 'league' ? 'on' : ''} onClick={() => setView('league')}>League</button>
      </div>

      {view === 'mine' ? (
        <>
          <PersonalCabinet myTeam={myTeam} won={myWon} onInspect={setInspectId} />
          <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 14, padding: '0 24px' }}>
            {myWon.length > 0
              ? 'Tap a trophy to inspect it. New trophies drop in automatically as results land.'
              : 'Trophies come from live results — plus the commissioner’s hand-picked honors.'}
          </div>
        </>
      ) : (
        <>
          <div className="cab-case" style={{ marginBottom: 14 }}>
            <div className="cab-case-hd"><Icon name="bolt" size={15} /><span className="t">Earned from results</span><span className="c">{autoHeld}/{AUTO_TROPHIES.length}</span></div>
            <Shelves items={AUTO_TROPHIES} />
          </div>
          <div className="cab-case">
            <div className="cab-case-hd"><Icon name="flame" size={15} /><span className="t">Commissioner's picks</span><span className="c">{commishHeld}/{COMMISH_TROPHIES.length}</span></div>
            <Shelves items={COMMISH_TROPHIES} />
          </div>
          <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 16, padding: '0 20px' }}>
            Every trophy in the pool and who currently holds it. Tap to inspect.
          </div>
        </>
      )}

      {/* Portal to <body>: the screen container is its own stacking context
          (motion pass), which trapped the overlay BELOW the desktop sidebar. */}
      {inspectIdx >= 0 && createPortal(
        <TrophyInspect
          list={inspectList} index={inspectIdx} myTeam={myTeam} view={view}
          holders={holders} teamById={teamById} teams={teams} isCommish={isCommish}
          onSetAwardHolder={onSetAwardHolder} onShare={onShare}
          onNav={(i) => setInspectId(inspectList[(i + inspectList.length) % inspectList.length].id)}
          onClose={() => setInspectId(null)}
        />,
        document.body,
      )}
    </div>
  );
}

/* ---------------- PERSONAL CABINET (furniture) ---------------- */
function PersonalCabinet({ myTeam, won, onInspect }: { myTeam: Team | null; won: TrophyMeta[]; onInspect: (id: string) => void }) {
  const PER = 3;
  const rows = Math.max(2, Math.ceil(won.length / PER));
  const shelves: (TrophyMeta | null)[][] = [];
  for (let r = 0; r < rows; r++) { const row: (TrophyMeta | null)[] = []; for (let c = 0; c < PER; c++) row.push(won[r * PER + c] || null); shelves.push(row); }
  return (
    <div className="tcab">
      <div className="tcab-ped"><div className="tcab-plate">
        <div className="nm">{myTeam?.name || 'Trophy Cabinet'}</div>
        <div className="sub">{won.length === 0 ? 'Trophy Cabinet' : `${won.length} ${won.length === 1 ? 'Trophy' : 'Trophies'} · World Cup 2026`}</div>
      </div></div>
      <div className="tcab-inner">
        {won.length === 0 && (
          <div className="tcab-emptymsg">
            <span className="ic"><Icon name="trophy" size={24} /></span>
            <div className="h">The case is empty</div>
            <div className="p">Win your first trophy and it lands here — your cabinet fills up as the tournament unfolds.</div>
          </div>
        )}
        {shelves.map((row, ri) => (
          <div className="tcab-shelf" key={ri}>
            <div className="tcab-deck">
              {row.map((t, ci) => t
                ? <button className="tcab-item" key={t.id} onClick={() => onInspect(t.id)} title={t.name}>
                    <span className="glow" /><Trophy id={t.id} size={68} /><span className="nm">{t.name}</span>
                  </button>
                : <span className="tcab-empty" key={'e' + ci} />)}
            </div>
            <div className="tcab-board" />
          </div>
        ))}
      </div>
      <div className="tcab-base" />
    </div>
  );
}

/* ---------------- INSPECT OVERLAY ---------------- */
function TrophyInspect({ list, index, myTeam, view, holders, teamById, teams, isCommish, onSetAwardHolder, onShare, onNav, onClose }: {
  list: TrophyMeta[];
  index: number;
  myTeam: Team | null;
  view: 'mine' | 'league';
  holders: Record<string, string>;
  teamById: (id?: string | null) => Team | null;
  teams: Team[];
  isCommish: boolean;
  onSetAwardHolder: (awardId: string, teamId: string | null) => void;
  onShare: (msg: string) => void;
  onNav: (i: number) => void;
  onClose: () => void;
}) {
  const t = list[index];
  const holderId = holders[t.id];
  const holder = teamById(holderId);
  const mine = holderId === myTeam?.id;
  const grand = ['champion', 'championOwner', 'final'].includes(t.id);
  const lit = view === 'mine' ? mine : !!holder;

  return (
    <div className="inspect-bg" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        <div className="inspect-top">
          <button className="ins-btn" onClick={onClose}><Icon name="x" size={18} /></button>
          <div className="row" style={{ gap: 8 }}>
            <button className="ins-btn" onClick={() => onNav(index - 1)} style={{ transform: 'scaleX(-1)' }}><Icon name="chevron" size={18} /></button>
            <button className="ins-btn" onClick={() => onNav(index + 1)}><Icon name="chevron" size={18} /></button>
          </div>
        </div>

        <div className="inspect-hero">
          {grand && lit && <Confetti count={60} />}
          <div className="tro-wrap">
            <div className="trophy-float"><Trophy id={t.id} size={188} locked={!lit} /></div>
            <div className="tro-shine" />
          </div>
          <div className="tro-reflect" style={{ height: 54, overflow: 'hidden' }}>
            <Trophy id={t.id} size={188} locked={!lit} />
          </div>
          <div className="ins-tags">
            <span className="ins-tag">{t.kind === 'auto' ? '⚡ Automatic' : '🎖 Commissioner'}</span>
            <span className={`ins-tag ${t.rarity === '1 of 1' ? 'rare' : ''}`}>{t.rarity}</span>
          </div>
        </div>

        <div className="inspect-card">
          <h1 className="display" style={{ fontSize: 30 }}>{t.name}</h1>

          <div className="ins-crit" style={{ marginTop: 13 }}>
            <span style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: 9, background: 'var(--lime)', border: '1.5px solid var(--ink)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={16} stroke={3} /></span>
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>How it's earned</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{t.how}</div>
            </div>
          </div>

          {/* holder plaque */}
          <div className="ins-plaque">
            {lit && holder ? (
              <>
                <div className="ins-plaque-top">
                  <span style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: teamGradient(holder), minHeight: 34 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eyebrow" style={{ color: '#9C988C' }}>{mine ? 'Held by you' : 'Held by'}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', textTransform: 'uppercase', fontSize: 18, marginTop: 1 }}>{holder.name}</div>
                  </div>
                  {mine && <span className="badge you">★ Yours</span>}
                </div>
                <div className="between" style={{ padding: '11px 13px' }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {(holder.members || []).map((m, i) => <Member key={i} name={m.name} idx={i} />)}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="eyebrow">Awarded</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{t.when}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="ins-open">
                <div style={{ fontSize: 22, marginBottom: 5 }}>{holderId ? '🔒' : '🏁'}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', textTransform: 'uppercase', fontSize: 17 }}>
                  {holderId ? 'Not in your cabinet yet' : 'Up for grabs'}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {holderId
                    ? <>Currently held by <b style={{ color: 'var(--ink)' }}>{teamById(holderId)?.name}</b>.</>
                    : `Awarded ${t.when === 'Tournament' ? 'when the tournament ends' : t.kind === 'commish' ? 'at the commissioner’s discretion' : `during the ${t.when}`}.`}
                </div>
              </div>
            )}
          </div>

          {/* commissioner: hand out / reassign a funny trophy */}
          {isCommish && t.kind === 'commish' && (
            <div style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 7 }}>Award this trophy</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {teams.map(tm => {
                  const on = holderId === tm.id;
                  return (
                    <button key={tm.id} className="chip" onClick={() => onSetAwardHolder(t.id, on ? null : tm.id)}
                      style={on ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : undefined}>
                      {tm.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* flavor */}
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '14px 2px 0' }}>“{t.blurb}”</p>

          {/* share */}
          <button className="btn btn-lime btn-block" style={{ marginTop: 18 }}
            onClick={() => onShare(mine ? `${t.name} — share your trophy 📸` : `${t.name} 📸`)}>
            <Icon name="share" size={17} /> Share this trophy
          </button>
        </div>
      </div>
    </div>
  );
}
