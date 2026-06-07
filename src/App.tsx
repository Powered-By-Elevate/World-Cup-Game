import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NATION, POT_KEYS } from './data/nations';
import type { AppState, MeState, Scoring } from './data/types';
import { defaultState, withDefaults, DEFAULT_SCORING } from './data/types';
import {
  sget, sset, HAS_REAL, leagueLink, teamLink, parseLeagueCode,
  listLeagues, activeLeague, setActiveLeague, upsertLeague, removeLeague, pruneLeagues, newLeagueCode,
  getMe, setMe as persistMe, resetActiveLeague, clearLocal,
} from './utils/storage';
import type { League } from './utils/storage';
import { groupResults, knockoutResults } from './data/results';
import { fetchLiveResults } from './data/liveResults';
import type { LiveData } from './data/liveResults';
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

// Prominent league switcher — the league name is the focus, tap to manage/switch.
function LeagueSwitch({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button className="league-switch" onClick={onClick} title="Switch or manage leagues">
      <span className="ls-ico"><Icon name="globe" size={18} /></span>
      <span className="ls-txt">
        <span className="ls-eyebrow">League</span>
        <span className="ls-name">{name}</span>
      </span>
      <span className="ls-chev"><Icon name="chevron" size={15} /></span>
    </button>
  );
}

// Fallback engine: deterministic results so the app works offline / pre-feed.
const ENGINE_SCORES = groupResults();
const ENGINE_KO = knockoutResults(ENGINE_SCORES);

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
  const [shareSheet, setShareSheet] = useState<{ title: string; text: string; url: string } | null>(null);

  const [live, setLiveData] = useState<LiveData | null>(null);
  const [demo, setDemo] = useState(false);

  // pull real results from the feed; poll while open. null result => engine fallback.
  useEffect(() => {
    try { setDemo(localStorage.getItem('wc:demo') === '1'); } catch { /* ignore */ }
    let alive = true;
    const pull = async () => { const d = await fetchLiveResults(); if (alive && d) setLiveData(d); };
    pull();
    const iv = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const scores = demo ? ENGINE_SCORES : (live?.scores ?? ENGINE_SCORES);
  const ko = demo ? ENGINE_KO : (live?.ko ?? ENGINE_KO);

  const toggleDemo = useCallback((v: boolean) => {
    setDemo(v);
    try { localStorage.setItem('wc:demo', v ? '1' : '0'); } catch { /* ignore */ }
  }, []);

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
    // Register the active league in the switch list only once it has a real
    // name. Nameless leagues never go in the registry (they'd show as a
    // permanent "Unnamed league" phantom); the active one still shows in the
    // "This league" card from shared state regardless.
    if (ns.leagueName) { upsertLeague(code, ns.leagueName); setLeagues(listLeagues()); }
    setLoaded(true);
  }, []);

  // init: resolve active league + team invite, then load
  useEffect(() => {
    const code = activeLeague();
    leagueCodeRef.current = code;
    setLeagueCode(code);
    pruneLeagues();                 // clear out any nameless/duplicate legacy entries
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
        // A nation is off-limits the moment it's drafted — never assign one twice.
        const used = new Set<string>();
        POT_KEYS.forEach((pk, ri) => {
          const seq = ri % 2 === 0 ? order : [...order].reverse();
          const queue = pots[pk];      // shuffled nations for this pot
          let qi = 0;
          seq.forEach((t) => {
            // pull the next nation in this pot that hasn't been taken yet
            let nation = queue[qi++];
            while (nation && used.has(nation.id)) nation = queue[qi++];
            if (!nation) return;       // guarded by canRun, but stay safe if a pot runs dry
            used.add(nation.id);
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

  // The active league's real name: prefer the live shared name, fall back to the
  // locally-known registry name (e.g. right after switching, before shared state
  // reloads) so a named league never flashes as "Unnamed". Empty if truly unnamed.
  const realLeagueName = state.leagueName || leagues.find(l => l.code === leagueCode)?.name || "";
  const leagueName = realLeagueName || "Unnamed league";   // display fallback

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
    setLeagueCode(code);
    // The league registers itself in reload() once its shared name loads;
    // we never store it nameless.
    try { window.history.replaceState(null, "", leagueLink(code)); } catch { /* ignore */ }
    setShowLeagues(false); setTab("home"); setLoaded(false);
    await reload(code);
  }, [reload, toast]);

  const renameLeague = useCallback(async (name: string) => {
    const nm = name.trim();
    if (!nm) return;
    await commitState(s => { s.leagueName = nm; return s; });
    upsertLeague(leagueCodeRef.current, nm);
    setLeagues(listLeagues());
    toast("League renamed");
  }, [commitState, toast]);

  const removeLeagueFromList = useCallback(async (code: string) => {
    removeLeague(code);
    const rest = listLeagues();
    setLeagues(rest);
    // If we left the league we're currently in, go somewhere sensible:
    // another league if we have one, otherwise a fresh empty pool at onboarding.
    if (code === leagueCodeRef.current) {
      if (rest[0]) { await switchLeague(rest[0].code); }
      else {
        const nc = newLeagueCode();
        setActiveLeague(nc); leagueCodeRef.current = nc; setLeagueCode(nc);
        await persistMe(nc, null);
        try { window.history.replaceState(null, "", leagueLink(nc)); } catch { /* ignore */ }
        setShowLeagues(false); setTab("home"); setLoaded(false);
        await reload(nc);
      }
    }
    toast("Left league");
  }, [switchLeague, reload, toast]);

  const resetApp = useCallback(async () => {
    await resetActiveLeague();
    clearLocal();
    try { window.location.href = window.location.origin + window.location.pathname; } catch { window.location.reload(); }
  }, []);

  // Prefer the native share sheet (opens straight into iMessage / Android Messages,
  // WhatsApp, etc.); fall back to copying the link on browsers without Web Share.
  const shareInvite = useCallback(async (title: string, url: string, text: string) => {
    // Native share sheet (iMessage / Android Messages / WhatsApp …) where supported.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try { await navigator.share({ title, text, url }); return; }
      catch (e) { if (e instanceof Error && e.name === "AbortError") return; /* else show the prompt */ }
    }
    // Otherwise show an explicit prompt with the link — never a silent clipboard copy.
    setShareSheet({ title, text, url });
  }, []);

  const copyLeagueLink = useCallback(() => {
    const nm = realLeagueName ? ` “${realLeagueName}”` : "";
    shareInvite("Join our World Cup pool", leagueLink(leagueCodeRef.current), `Join our family World Cup pool${nm} — pick your team here:`);
  }, [shareInvite, realLeagueName]);

  const copyTeamLink = useCallback(() => {
    if (!myTeam) return;
    shareInvite("Join my team", teamLink(myTeam.id, leagueCodeRef.current), `Join my team “${myTeam.name}” in our World Cup pool:`);
  }, [shareInvite, myTeam]);

  const shareModal = shareSheet && (
    <div className="modal-bg" onClick={() => setShareSheet(null)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: "4px 18px 14px" }}>
          <h2 className="display" style={{ fontSize: 24 }}>{shareSheet.title}</h2>
          <button className="hdr-btn" onClick={() => setShareSheet(null)} style={{ border: "1.5px solid var(--line)" }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: "0 18px 26px" }}>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, lineHeight: 1.5 }}>{shareSheet.text}</p>
          <div className="card flat pad" style={{ wordBreak: "break-all", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{shareSheet.url}</div>
          <button className="btn btn-ink btn-block" onClick={() => {
            try { navigator.clipboard.writeText(shareSheet.url); toast("Link copied — paste it into a message"); } catch { /* ignore */ }
            setShareSheet(null);
          }}><Icon name="copy" size={16} /> Copy link</button>
        </div>
      </div>
    </div>
  );

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
          <Mark size={36} />
          <LeagueSwitch name={leagueName} onClick={() => setShowLeagues(true)} />
        </header>
        <div className="screen">
          <Onboarding state={state} defaultName={me?.name || ""} inviteTeamId={inviteTeamId} onJoin={api.joinTeam} onCreate={api.createTeam} />
        </div>
        {showLeagues && (
          <Leagues leagues={leagues} activeCode={leagueCode} leagueName={realLeagueName} hasTeam={false} canRename={isCommish}
            onSwitch={switchLeague} onCreate={createLeague} onJoin={joinLeague} onRename={renameLeague} onRemove={removeLeagueFromList}
            onCopyLeagueLink={copyLeagueLink} onCopyTeamLink={copyTeamLink} onClose={() => setShowLeagues(false)} />
        )}
        {shareModal}
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
          <div className="wm-text"><div className="l1">World Cup</div><div className="l2">Family Draft · 2026</div></div>
        </div>
        <LeagueSwitch name={leagueName} onClick={() => setShowLeagues(true)} />
        <nav className="sb-nav">
          {NAV.map(n => (
            <button key={n.id} className={"sb-navb " + (tab === n.id ? "on" : "")} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} size={20} /><span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sb-bottom">
          <span className={`status ${HAS_REAL ? "live" : "preview"}`}><span className="dot" />{HAS_REAL ? "Live" : "Preview"}</span>
          <button className="hdr-btn" onClick={copyLeagueLink} title="Copy league invite"><Icon name="share" size={16} /></button>
          <button className="hdr-btn" onClick={() => setShowSettings(true)} title="Settings"><Icon name="gear" size={18} /></button>
        </div>
      </aside>

      {/* mobile top header */}
      <header className="hdr">
        <Mark size={36} />
        <LeagueSwitch name={leagueName} onClick={() => setShowLeagues(true)} />
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
        <Leagues leagues={leagues} activeCode={leagueCode} leagueName={realLeagueName} hasTeam={!!myTeam} canRename={isCommish}
          onSwitch={switchLeague} onCreate={createLeague} onJoin={joinLeague} onRename={renameLeague} onRemove={removeLeagueFromList}
          onCopyLeagueLink={copyLeagueLink} onCopyTeamLink={copyTeamLink} onClose={() => setShowLeagues(false)} />
      )}
      {showSettings && (
        <Settings
          state={state} myTeam={myTeam} me={me} isCommish={isCommish} commishName={commishName}
          onClose={() => setShowSettings(false)} onScoring={api.setScoring} onLeave={api.leave}
          onRename={api.rename} onClaim={api.claimCommish} onResetApp={resetApp} onTeamInvite={copyTeamLink}
          demo={demo} onToggleDemo={toggleDemo} />
      )}
      {shareModal}
      {toastMsg && <div className="toast"><Icon name="check" size={16} />{toastMsg}</div>}
    </div>
  );
}
