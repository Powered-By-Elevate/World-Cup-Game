import { useState, useMemo } from 'react';
import type { AppState, ScoreEntry, Team } from '../data/types';
import { DEFAULT_SCORING } from '../data/types';
import type { KOMatch } from '../data/fixtures';
import { NATION, NATIONS, POT_KEYS } from '../data/nations';
import { teamStats, nationStats } from '../utils/scoring';
import { Flag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { PotTag } from '../components/shared';

interface Props {
  state: AppState;
  scores: Record<string, ScoreEntry>;
  ko: KOMatch[];
  onApply: (teamId: string, pot: string, newNationId: string) => void;
  onRevert: (teamId: string, pot: string) => void;
  onClose: () => void;
}

const effectiveOf = (t: Team, pk: string) => t.replacements?.[pk] || t.picks?.[pk] || '';

/* Commissioner-only roster correction: swap a team's nation for a FREE AGENT
   (a nation no team owns). It's a full identity swap — the new nation's group
   + knockout points replace the old one's — shown as a before/after swing
   before you confirm, marked on the slot, and reversible. */
export function RosterFix({ state, scores, ko, onApply, onRevert, onClose }: Props) {
  const teams = state.teams || [];
  const scoring = state.scoring || DEFAULT_SCORING;
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [pot, setPot] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const team = teams.find(t => t.id === teamId) || null;

  const owned = useMemo(() => {
    const s = new Set<string>();
    for (const t of teams) for (const pk of POT_KEYS) {
      if (t.picks?.[pk]) s.add(t.picks[pk]);
      if (t.replacements?.[pk]) s.add(t.replacements[pk]!);
    }
    return s;
  }, [teams]);

  // Free agents = nations no team owns (plus the slot's current nation, so it's
  // listed). Ranked by points so the strong ones surface first.
  const freeAgents = useMemo(() => {
    const cur = team && pot ? effectiveOf(team, pot) : '';
    const query = q.trim().toLowerCase();
    return NATIONS
      .filter(n => (!owned.has(n.id) || n.id === cur))
      .filter(n => !query || n.name.toLowerCase().includes(query))
      .map(n => ({ id: n.id, pts: nationStats(n.id, scores, ko, scoring).total }))
      .sort((a, b) => b.pts - a.pts || (NATION[a.id]?.name || '').localeCompare(NATION[b.id]?.name || ''));
  }, [owned, team, pot, q, scores, ko, scoring]);

  const swing = useMemo(() => {
    if (!team || !pot || !pick) return null;
    const before = teamStats(team, scores, ko, scoring).total;
    const modded: Team = { ...team, picks: { ...team.picks, [pot]: pick }, replacements: { ...(team.replacements || {}) } };
    delete modded.replacements![pot];
    const after = teamStats(modded, scores, ko, scoring).total;
    return { before, after, delta: after - before };
  }, [team, pot, pick, scores, ko, scoring]);

  const perStats = team ? teamStats(team, scores, ko, scoring) : null;

  const reset = () => { setPot(null); setPick(null); setQ(''); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(21,18,12,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 120 }}>
      <div onClick={e => e.stopPropagation()} className="card pad" style={{ maxWidth: 400, width: '100%', maxHeight: '88vh', overflowY: 'auto', background: 'var(--paper)' }}>
        <div className="between" style={{ marginBottom: 4 }}>
          <div className="eyebrow">Fix a roster</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
          Swap a team's nation for a free agent. Full identity swap — the new nation's group + knockout points count. Reversible anytime; not shown to the league.
        </p>

        {/* team picker */}
        <div className="scroll-x" style={{ marginBottom: 12 }}>
          {teams.map(t => (
            <button key={t.id} className={`chip ${t.id === teamId ? 'on' : ''}`} onClick={() => { setTeamId(t.id); reset(); }}>{t.name}</button>
          ))}
        </div>

        {team && !pot && (
          <div style={{ display: 'grid', gap: 8 }}>
            {POT_KEYS.map(pk => {
              const nid = effectiveOf(team, pk);
              const correctedFrom = team.corrected?.[pk];
              const slotPts = perStats?.per[pk]?.total ?? 0;
              return (
                <div key={pk} className="card flat" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Flag id={nid} size={34} ring="pot" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{NATION[nid]?.name || nid}</div>
                    <div className="row" style={{ gap: 6, marginTop: 2 }}>
                      <PotTag pot={pk} />
                      <span className="muted" style={{ fontSize: 11 }}>{slotPts} pts</span>
                      {correctedFrom && <span className="muted" style={{ fontSize: 10 }}>· corrected from {NATION[correctedFrom]?.name || correctedFrom}</span>}
                    </div>
                  </div>
                  {correctedFrom && <button className="btn btn-sm btn-ghost" onClick={() => onRevert(team.id, pk)}>Revert</button>}
                  <button className="btn btn-sm" style={{ background: 'var(--lime)' }} onClick={() => setPot(pk)}>Change</button>
                </div>
              );
            })}
          </div>
        )}

        {team && pot && (
          <>
            <button className="btn btn-sm btn-ghost" style={{ marginBottom: 10 }} onClick={reset}><Icon name="chevron" size={12} /> Back</button>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Swap in a free agent for {NATION[effectiveOf(team, pot)]?.name || 'this slot'}</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search nations…" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--line)', marginBottom: 10, background: 'var(--paper)' }} />
            <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {freeAgents.map(fa => (
                <button key={fa.id} onClick={() => setPick(fa.id)}
                  className="card flat" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', border: pick === fa.id ? '2px solid var(--ink)' : '1px solid var(--line)', cursor: 'pointer', background: pick === fa.id ? 'rgba(200,242,60,.14)' : 'var(--paper)' }}>
                  <Flag id={fa.id} size={28} ring="ink" />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{NATION[fa.id]?.name || fa.id}</span>
                  <span className="num" style={{ fontSize: 15 }}>{fa.pts}<span style={{ fontSize: 8, marginLeft: 2, color: 'var(--mut)' }}>PT</span></span>
                </button>
              ))}
              {freeAgents.length === 0 && <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 10 }}>No free agents match.</div>}
            </div>

            {swing && pick && (
              <div className="card" style={{ marginTop: 14, padding: '12px 14px', border: '2px solid var(--ink)' }}>
                <div className="between">
                  <div>
                    <div className="eyebrow" style={{ fontSize: 10 }}>{team.name} total</div>
                    <div style={{ fontSize: 14, marginTop: 3 }}>{swing.before} <Icon name="arrow" size={12} /> <b>{swing.after}</b></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 30, lineHeight: 1, color: swing.delta >= 0 ? 'var(--up, #1FB257)' : 'var(--live, #E4572E)' }}>{swing.delta >= 0 ? '+' : ''}{swing.delta}</div>
                    <div className="eyebrow" style={{ fontSize: 8 }}>swing</div>
                  </div>
                </div>
                <button className="btn btn-block" style={{ background: 'var(--lime)', marginTop: 12 }}
                  onClick={() => { onApply(team.id, pot, pick); reset(); }}>
                  Swap in {NATION[pick]?.name} → {team.name}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
