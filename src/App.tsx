import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NATION, POT_KEYS } from './data/nations';
import type { AppState, MeState, Scoring } from './data/types';
import { defaultState, withDefaults, DEFAULT_SCORING } from './data/types';
import {
  sget, sset, HAS_REAL, leagueLink, teamLink, parseLeagueCode,
  listLeagues, activeLeague, setActiveLeague, upsertLeague, newLeagueCode,
  getMe, setMe as persistMe, resetActiveLeague, clearLocal,
} from './utils/storage';
import type { League } from './utils/storage';
import { groupResults, knockoutResults } from './data/results';
import { uid, shuffle } from './utils/helpers';
import { teamStats, computeMovers } from './utils/scoring';
import type { StandingEntry } from './utils/scoring';
import { Icon, Mark } from './components/Icon';
import type { IconName } from './components/Icon';
import { Onboarding } from './views/Onboarding';
import { MyTeam } from './views/MyTeam';
import { DraftView } from './views/DraftView';
import { TableView } from './views/Leaderboard';
import { MatchesView } from './views/MatchesView';
import { Squads } from './views/Squads';
import { Settings } from './views/Settings';
import { Leagues } from './views/Leagues';
import './styles.css';

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "home", label: "My Team", icon: "home" },
  { id: "draft", label: "Draft", icon: "draft" },
  { id: "table", label: "Table", icon: "table" },
  { id: "matches", label: "Matches", icon: "cal" },
  { id: "squads", label: "Squads", icon: "users" },
];

// Results are produced automatically and identically on every device — no entry.
const SCORES = groupResults();
const KO = knockoutResults(SCORES);

export default function App() {
  const [state, setState] = useState<AppState>(defaultState());
  const [me, setMe] = useState<MeState | null>(null);
  const [leagueCode, setLeagueCode] = useState('');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [tab, setTab] = useState("home");
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeagues, setShowLeagues] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);

  const scores = SCORES;
  const ko = KO;

  const stateRef = useRef(state);
  stateRef.current = state;
  const leagueCodeRef = useRef(leagueCode);
  leagueCodeRef.current = leagueCode;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const reload = useCallback(async (code: string) => {
    const [s, m] = await Promise.all([
      sget<AppState>("wc:state", true),
      getMe(code),
    ]);
    const ns = s ? withDefaults(s) : defaultState();
    setState(ns);
    setMe(m || null);
    if (ns.leagueName) { upsertLeague(code, ns.leagueName); setLeagues(listLeagues()); }
    setLoaded(true);
  }, []);

  // init: resolve active league + team invite, then load
  useEffect(() => {
    const code = activeLeague();
    upsertLeague(code, "");
    leagueCodeRef.current = code;
    setLeagueCode(code);
    setLeagues(listLeagues());
    try { setInviteTeamId(new URL(window.location.href).searchParams.get("team")); } catch { /* ignore */ }
    reload(code);
  }, [reload]);

  // poll shared state for the active league (teams/draft/scoring changes)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await sget<AppState>("wc:state", true);
      if (!alive || !s) return;
      const ns = withDefaults(s);
      if (JSON.stringify(ns) !== JSON.stringify(stateRef.current)) setState(ns);
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

  const setMeBoth = useCallback(async (m: MeState | null) => {
    setMe(m);
    await persistMe(leagueCodeRef.current, m);
    if (m) {
      setInviteTeamId(null);
      try { window.history.replaceState(null, "", leagueLink(leagueCodeRef.current)); } catch { /* ignore */ }
    }
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
      setTab("home");
    },
    joinTeam: async (tid: string, playerName: string) => {
      const mid = uid();
      await commitState(s => {
        const t = s.teams.find(t => t.id === tid);
        if (t) { t.members = t.members || []; t.members.push({ id: mid, name: playerName }); }
        return s;
      });
      await setMeBoth({ id: mid, name: playerName, teamId: tid });
      setTab("home");
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
    setScoring: async (sc: Scoring) => {
      await commitState(s => { s.scoring = sc; return s; });
    },
  }), [commitState, setMeBoth, me]);

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
    () => computeMovers(state.teams || [], scores, ko, state.scoring || DEFAULT_SCORING),
    [state.teams, state.scoring, scores, ko]
  );

  const standings: StandingEntry[] = useMemo(() => {
    const sc = state.scoring || DEFAULT_SCORING;
    return (state.teams || [])
      .map(team => ({ team, ...teamStats(team, scores, ko, sc) }))
      .sort((a, b) => b.total - a.total || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name));
  }, [state.teams, state.scoring, scores, ko]);

  const leagueName = state.leagueName || "Family Draft · 2026";

  /* ---------------- league actions ---------------- */
  const switchLeague = useCallback(async (code: string) => {
    if (code === leagueCodeRef.current) { setShowLeagues(false); return; }
    setActiveLeague(code); leagueCodeRef.current = code; setLeagueCode(code);
    try { window.history.replaceState(null, "", leagueLink(code)); } catch { /* ignore */ }
    setShowLeagues(false); setTab("home"); setLoaded(false);
    await reload(code);
  }, [reload]);

  const createLeague = useCallback(async (name: string) => {
    const code = newLeagueCode();
    setActiveLeague(code); leagueCodeRef.current = code;
    upsertLeague(code, name); setLeagues(listLeagues());
    await sset("wc:state", { ...defaultState(), leagueName: name }, true);
    await persistMe(code, null);
    setLeagueCode(code);
    try { window.history.replaceState(null, "", leagueLink(code)); } catch { /* ignore */ }
    setShowLeagues(false); setTab("home"); setLoaded(false);
    await reload(code);
    toast(`Created “${name}”`);
  }, [reload, toast]);

  const joinLeague = useCallback(async (input: string) => {
    const code = parseLeagueCode(input);
    if (!code) { toast("Enter a valid league code or link"); return; }
    setActiveLeague(code); leagueCodeRef.current = code;
    upsertLeague(code, ""); setLeagues(listLeagues());
    setLeagueCode(code);
    try { window.history.replaceState(null, "", leagueLink(code)); } catch { /* ignore */ }
    setShowLeagues(false); setTab("home"); setLoaded(false);
    await reload(code);
  }, [reload, toast]);

  const resetApp = useCallback(async () => {
    await resetActiveLeague();
    clearLocal();
    try { window.location.href = window.location.origin + window.location.pathname; } catch { window.location.reload(); }
  }, []);

  const copyLeagueLink = useCallback(() => {
    try { navigator.clipboard.writeText(leagueLink(leagueCodeRef.current)); toast("League invite copied"); }
    catch { toast("Copy the page URL to invite others"); }
  }, [toast]);

  const copyTeamLink = useCallback(() => {
    if (!myTeam) return;
    try { navigator.clipboard.writeText(teamLink(myTeam.id, leagueCodeRef.current)); toast("Team invite copied — drops them onto your team"); }
    catch { toast("Copy failed"); }
  }, [myTeam, toast]);

  if (!loaded) return (
    <div className="app">
      <div className="screen" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <div className="muted">Loading…</div>
      </div>
    </div>
  );

  const needsOnboard = !me || !myTeam;

  if (needsOnboard) {
    return (
      <div className="app onboard">
        <header className="hdr">
          <div className="wordmark">
            <Mark size={36} />
            <div className="wm-text"><div className="l1">World Cup</div><div className="l2">{leagueName}</div></div>
          </div>
          <button className="hdr-btn" onClick={() => setShowLeagues(true)} title="Leagues"><Icon name="globe" size={18} /></button>
        </header>
        <div className="screen">
          <Onboarding state={state} defaultName={me?.name || ""} inviteTeamId={inviteTeamId} onJoin={api.joinTeam} onCreate={api.createTeam} />
        </div>
        {showLeagues && (
          <Leagues leagues={leagues} activeCode={leagueCode} leagueName={state.leagueName} hasTeam={false}
            onSwitch={switchLeague} onCreate={createLeague} onJoin={joinLeague}
            onCopyLeagueLink={copyLeagueLink} onCopyTeamLink={copyTeamLink} onClose={() => setShowLeagues(false)} />
        )}
        {toastMsg && <div className="toast"><Icon name="check" size={16} />{toastMsg}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      {/* desktop left rail */}
      <aside className="sidebar">
        <div className="sb-top">
          <Mark size={40} />
          <div className="wm-text"><div className="l1">World Cup</div><div className="l2">{leagueName}</div></div>
        </div>
        <nav className="sb-nav">
          {NAV.map(n => (
            <button key={n.id} className={"sb-navb " + (tab === n.id ? "on" : "")} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} size={20} /><span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sb-bottom">
          <span className={`status ${HAS_REAL ? "live" : "preview"}`}><span className="dot" />{HAS_REAL ? "Live" : "Preview"}</span>
          <button className="hdr-btn" onClick={() => setShowLeagues(true)} title="Leagues"><Icon name="globe" size={16} /></button>
          <button className="hdr-btn" onClick={copyLeagueLink} title="Copy league invite"><Icon name="share" size={16} /></button>
          <button className="hdr-btn" onClick={() => setShowSettings(true)} title="Settings"><Icon name="gear" size={18} /></button>
        </div>
      </aside>

      {/* mobile top header */}
      <header className="hdr">
        <div className="wordmark">
          <Mark size={36} />
          <div className="wm-text"><div className="l1">World Cup</div><div className="l2">{leagueName}</div></div>
        </div>
        <button className="hdr-btn" onClick={() => setShowLeagues(true)} title="Leagues"><Icon name="globe" size={16} /></button>
        <button className="hdr-btn" onClick={copyLeagueLink} title="Copy league invite"><Icon name="share" size={16} /></button>
        <button className="hdr-btn" onClick={() => setShowSettings(true)} title="Settings"><Icon name="gear" size={18} /></button>
      </header>

      <div className="screen">
        {tab === "home" && <MyTeam myTeam={myTeam!} state={state} scores={scores} ko={ko} standings={standings} setTab={setTab} onTeamInvite={copyTeamLink} />}
        {tab === "draft" && <DraftView state={state} isCommish={isCommish} commishName={commishName} onRunDraft={api.runDraft} onReset={api.resetDraft} onMovePot={api.movePot} toast={toast} />}
        {tab === "table" && <TableView state={state} scores={scores} standings={standings} movers={movers} myTeam={myTeam} />}
        {tab === "matches" && <MatchesView scores={scores} ko={ko} myTeam={myTeam} />}
        {tab === "squads" && <Squads state={state} scores={scores} standings={standings} myTeam={myTeam} />}
      </div>

      <nav className="nav">
        <div className="nav-inner">
          {NAV.map(n => (
            <button key={n.id} className={"navb " + (tab === n.id ? "on" : "")} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} size={20} />
              <span className="lbl">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {showLeagues && (
        <Leagues leagues={leagues} activeCode={leagueCode} leagueName={state.leagueName} hasTeam={!!myTeam}
          onSwitch={switchLeague} onCreate={createLeague} onJoin={joinLeague}
          onCopyLeagueLink={copyLeagueLink} onCopyTeamLink={copyTeamLink} onClose={() => setShowLeagues(false)} />
      )}
      {showSettings && (
        <Settings
          state={state} myTeam={myTeam} me={me} isCommish={isCommish} commishName={commishName}
          onClose={() => setShowSettings(false)} onScoring={api.setScoring} onLeave={api.leave}
          onRename={api.rename} onClaim={api.claimCommish} onResetApp={resetApp} onTeamInvite={copyTeamLink} />
      )}
      {toastMsg && <div className="toast"><Icon name="check" size={16} />{toastMsg}</div>}
    </div>
  );
}
