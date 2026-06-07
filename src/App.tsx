import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NATION, POT_KEYS } from './data/nations';
import type { AppState, MeState, ScoreEntry, Scoring } from './data/types';
import { defaultState, withDefaults, DEFAULT_SCORING } from './data/types';
import type { KOMatch } from './data/fixtures';
import { sget, sset, HAS_REAL, leagueLink } from './utils/storage';
import { uid, shuffle } from './utils/helpers';
import { teamStats, computeMovers } from './utils/scoring';
import type { StandingEntry } from './utils/scoring';
import { Icon, ICONS } from './components/Icon';
import { Onboarding } from './views/Onboarding';
import { MyTeam } from './views/MyTeam';
import { DraftView } from './views/DraftView';
import { TableView } from './views/Leaderboard';
import { MatchesView } from './views/MatchesView';
import { Squads } from './views/Squads';
import { Settings } from './views/Settings';
import './styles.css';

const NAV = [
  { id: "home", label: "My Team", icon: ICONS.home },
  { id: "draft", label: "Draft", icon: ICONS.draft },
  { id: "table", label: "Table", icon: ICONS.table },
  { id: "matches", label: "Matches", icon: ICONS.cal },
  { id: "squads", label: "Squads", icon: ICONS.users },
];

export default function App() {
  const [state, setState] = useState<AppState>(defaultState());
  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [me, setMe] = useState<MeState | null>(null);
  const [tab, setTab] = useState("home");
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  useEffect(() => {
    (async () => {
      const [s, sc, m] = await Promise.all([
        sget<AppState>("wc:state", true),
        sget<Record<string, ScoreEntry>>("wc:scores", true),
        sget<MeState>("wc:me", false),
      ]);
      if (s) setState(withDefaults(s));
      if (sc) setScores(sc);
      if (m) setMe(m);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [s, sc] = await Promise.all([
        sget<AppState>("wc:state", true),
        sget<Record<string, ScoreEntry>>("wc:scores", true),
      ]);
      if (!alive) return;
      const ns = s ? withDefaults(s) : null;
      if (ns && JSON.stringify(ns) !== JSON.stringify(stateRef.current)) setState(ns);
      if (sc && JSON.stringify(sc) !== JSON.stringify(scoresRef.current)) setScores(sc);
    };
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const commitState = useCallback(async (mutator: (s: AppState) => AppState) => {
    const cur = withDefaults((await sget<AppState>("wc:state", true)) || stateRef.current || defaultState());
    const next = mutator(JSON.parse(JSON.stringify(cur)));
    setState(next);
    await sset("wc:state", next, true);
  }, []);

  const commitScores = useCallback(async (mutator: (sc: Record<string, ScoreEntry>) => Record<string, ScoreEntry>) => {
    const cur = (await sget<Record<string, ScoreEntry>>("wc:scores", true)) || scoresRef.current || {};
    const next = mutator({ ...cur });
    setScores(next);
    await sset("wc:scores", next, true);
  }, []);

  const setMeBoth = useCallback(async (m: MeState | null) => {
    setMe(m);
    await sset("wc:me", m, false);
  }, []);

  const api = useMemo(() => ({
    createTeam: async (teamName: string, playerName: string) => {
      const mid = uid(), tid = uid();
      await commitState(s => {
        s.teams.push({ id: tid, name: teamName, members: [{ id: mid, name: playerName }], picks: null });
        if (!s.commissioner) s.commissioner = mid;
        return s;
      });
      await setMeBoth({ id: mid, name: playerName, teamId: tid });
    },
    joinTeam: async (tid: string, playerName: string) => {
      const mid = uid();
      await commitState(s => {
        const t = s.teams.find(t => t.id === tid);
        if (t) { t.members = t.members || []; t.members.push({ id: mid, name: playerName }); }
        return s;
      });
      await setMeBoth({ id: mid, name: playerName, teamId: tid });
    },
    leave: async () => {
      await commitState(s => {
        const t = s.teams.find(t => t.id === me?.teamId);
        if (t) t.members = (t.members || []).filter(m => m.id !== me!.id);
        return s;
      });
      await setMeBoth(null);
      setMe(null);
      setTab("home");
    },
    rename: async (nm: string) => {
      await commitState(s => {
        const t = s.teams.find(t => t.id === me?.teamId);
        if (t) t.name = nm;
        return s;
      });
    },
    runDraft: async () => {
      await commitState(s => {
        const minPot = Math.min(...POT_KEYS.map(pk => (s.pots[pk] || []).length));
        if (s.teams.length < 1 || s.teams.length > minPot) return s;
        const order = shuffle(s.teams);
        const pots = {
          FAV: shuffle(s.pots.FAV.map(id => NATION[id])),
          UND: shuffle(s.pots.UND.map(id => NATION[id])),
          LNG: shuffle(s.pots.LNG.map(id => NATION[id])),
        };
        s.teams.forEach(t => { t.picks = {}; });
        const board: AppState['board'] = [];
        POT_KEYS.forEach((pk, ri) => {
          const seq = ri % 2 === 0 ? order : [...order].reverse();
          seq.forEach((t, i) => {
            const nation = pots[pk][i];
            const team = s.teams.find(x => x.id === t.id)!;
            team.picks![pk] = nation.id;
            board.push({ pickNo: board.length + 1, teamId: t.id, nationId: nation.id, pot: pk });
          });
        });
        s.board = board;
        s.draftDone = true;
        return s;
      });
      setTab("draft");
    },
    movePot: async (nid: string, target: string | null) => {
      await commitState(s => {
        POT_KEYS.forEach(pk => { s.pots[pk] = (s.pots[pk] || []).filter(x => x !== nid); });
        if (target) s.pots[target].push(nid);
        return s;
      });
    },
    claimCommish: async () => {
      await commitState(s => { s.commissioner = me?.id || s.commissioner; return s; });
    },
    resetDraft: async () => {
      await commitState(s => {
        s.draftDone = false;
        s.board = [];
        s.teams.forEach(t => t.picks = null);
        return s;
      });
    },
    saveScore: async (id: string, v: ScoreEntry) => {
      await commitScores(sc => { sc[id] = { h: v.h, a: v.a, st: v.st }; return sc; });
    },
    addKO: async (k: KOMatch) => {
      await commitState(s => { s.ko = s.ko || []; s.ko.push(k); return s; });
    },
    saveKO: async (id: string, v: Partial<KOMatch>) => {
      await commitState(s => { const k = (s.ko || []).find(k => k.id === id); if (k) Object.assign(k, v); return s; });
    },
    delKO: async (id: string) => {
      await commitState(s => { s.ko = (s.ko || []).filter(k => k.id !== id); return s; });
    },
    setScoring: async (sc: Scoring) => {
      await commitState(s => { s.scoring = sc; return s; });
    },
  }), [commitState, commitScores, setMeBoth, me]);

  const myTeam = useMemo(
    () => state.teams?.find(t => t.id === me?.teamId) || null,
    [state.teams, me]
  );

  const commishName = useMemo(() => {
    const c = state.commissioner;
    if (!c) return null;
    for (const t of state.teams || []) {
      for (const mem of (t.members || [])) {
        if (mem.id === c) return mem.name;
      }
    }
    return null;
  }, [state.commissioner, state.teams]);

  const isCommish = !state.commissioner || (me != null && me.id === state.commissioner) || !commishName;

  const movers = useMemo(
    () => computeMovers(state.teams || [], scores, state.ko || [], state.scoring || DEFAULT_SCORING),
    [state.teams, state.ko, state.scoring, scores]
  );

  const standings: StandingEntry[] = useMemo(() => {
    const sc = state.scoring || DEFAULT_SCORING;
    return (state.teams || [])
      .map(team => ({ team, ...teamStats(team, scores, state.ko || [], sc) }))
      .sort((a, b) => b.total - a.total || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name));
  }, [state.teams, state.scoring, state.ko, scores]);

  const copyLink = () => {
    const link = leagueLink() || window.location.href;
    try {
      navigator.clipboard.writeText(link);
      toast("Link copied -- share it with the family!");
    } catch {
      toast("Copy the page URL to invite others");
    }
  };

  if (!loaded) return (
    <div className="wc-root">
      <div className="wc-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="muted">Loading...</div>
      </div>
    </div>
  );

  const needsOnboard = !me || !myTeam;

  return (
    <div className="wc-root">
      <div className="wc-pitch" />
      <div className="wc-grain" />
      <div className="wc-shell">
        <div className="wc-head">
          <div className="wc-logo">World Cup<small>FAMILY DRAFT . 2026</small></div>
          {!needsOnboard && (
            <>
              <div className="wc-sync"><span className="wc-dot" />{HAS_REAL ? "LIVE" : "PREVIEW"}</div>
              <button className="wc-hbtn" onClick={copyLink} title="Invite"><Icon d={ICONS.share} size={18} /></button>
              <button className="wc-hbtn" onClick={() => setShowSettings(true)} title="Settings"><Icon d={ICONS.gear} size={18} /></button>
            </>
          )}
        </div>

        {needsOnboard ? (
          <Onboarding state={state} defaultName={me?.name || ""} onJoin={api.joinTeam} onCreate={api.createTeam} />
        ) : (
          <>
            {tab === "home" && <MyTeam myTeam={myTeam!} state={state} scores={scores} standings={standings} setTab={setTab} toast={toast} />}
            {tab === "draft" && <DraftView state={state} isCommish={isCommish} commishName={commishName} onRunDraft={api.runDraft} onReset={api.resetDraft} onMovePot={api.movePot} toast={toast} />}
            {tab === "table" && <TableView state={state} scores={scores} standings={standings} movers={movers} myTeam={myTeam} />}
            {tab === "matches" && <MatchesView state={state} scores={scores} myTeam={myTeam} onSaveScore={api.saveScore} onAddKO={api.addKO} onSaveKO={api.saveKO} onDelKO={api.delKO} toast={toast} />}
            {tab === "squads" && <Squads state={state} scores={scores} standings={standings} myTeam={myTeam} />}
          </>
        )}
      </div>

      {!needsOnboard && (
        <div className="wc-nav">
          <div className="wc-nav-in">
            {NAV.map(n => (
              <button key={n.id} className={"navb " + (tab === n.id ? "on" : "")} onClick={() => setTab(n.id)}>
                <Icon d={n.icon} size={20} sw={tab === n.id ? 2.2 : 1.9} />{n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <Settings
          state={state} myTeam={myTeam} me={me} isCommish={isCommish} commishName={commishName}
          onClose={() => setShowSettings(false)} onScoring={api.setScoring} onLeave={api.leave}
          onRename={api.rename} onClaim={api.claimCommish}
        />
      )}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
