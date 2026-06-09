import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NATION, POT_KEYS } from './data/nations';
import type { AppState, MeState, Scoring } from './data/types';
import { defaultState, withDefaults, DEFAULT_SCORING } from './data/types';
import {
  sget, sset, HAS_REAL, leagueLink, teamLink, parseLeagueCode,
  listLeagues, activeLeague, setActiveLeague, upsertLeague, removeLeague, pruneLeagues, newLeagueCode,
  getMe, setMe as persistMe, resetActiveLeague, clearLocal,
  AUTH_ON, getAuthUser, onAuthChange, signOut, syncUserLeagues, addUserLeague, removeUserLeague,
  listAccounts, touchPresence,
} from './utils/storage';
import type { League, AuthUser } from './utils/storage';
import { groupResults, knockoutResults } from './data/results';
import { fetchLiveResults } from './data/liveResults';
import type { LiveData } from './data/liveResults';
import { uid, shuffle } from './utils/helpers';
import { teamStats, computeMovers, stageWinners } from './utils/scoring';
import type { StandingEntry, StageWinner } from './utils/scoring';
import { Icon, Mark } from './components/Icon';
import type { IconName } from './components/Icon';
import { Avatar } from './components/shared';
import { Onboarding } from './views/Onboarding';
import { MyTeam } from './views/MyTeam';
import { DraftView } from './views/DraftView';
import { TableView } from './views/Leaderboard';
import { MatchesView } from './views/MatchesView';
import { Squads } from './views/Squads';
import { Settings } from './views/Settings';
import { Manage } from './views/Manage';
import { Profile } from './views/Profile';
import { Leagues } from './views/Leagues';
import { SignIn } from './views/SignIn';
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(!AUTH_ON);   // no backend → no gate, run as preview
  const [leagueCode, setLeagueCode] = useState('');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [tab, setTab] = useState("home");
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
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

  // Real results only. When the live feed has nothing (yet, or briefly down),
  // scores stay empty and the UI shows fixtures as pending — never simulated
  // numbers. The deterministic engine is reachable ONLY via the Demo toggle.
  const scores = demo ? ENGINE_SCORES : (live?.scores ?? {});
  const ko = demo ? ENGINE_KO : (live?.ko ?? []);

  const toggleDemo = useCallback((v: boolean) => {
    setDemo(v);
    try { localStorage.setItem('wc:demo', v ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;
  const leagueCodeRef = useRef(leagueCode);
  leagueCodeRef.current = leagueCode;
  const userRef = useRef(user);
  userRef.current = user;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const commitState = useCallback(async (mutator: (s: AppState) => AppState) => {
    const cur = withDefaults((await sget<AppState>("wc:state", true)) || stateRef.current || defaultState());
    const next = mutator(JSON.parse(JSON.stringify(cur)));
    setState(next);
    await sset("wc:state", next, true);
  }, []);

  const reload = useCallback(async (code: string) => {
    const s = await sget<AppState>("wc:state", true);
    const ns = s ? withDefaults(s) : defaultState();
    setState(ns);

    const u = userRef.current;
    if (u) void touchPresence(u.id);   // record this app-open for the roster's "last seen"
    // Identity follows the signed-in account: find the member linked to this
    // account across the league's teams. This is derived from shared state, so
    // the same account resolves to the same identity on every device.
    let m: MeState | null = null;
    if (u) {
      for (const t of ns.teams) {
        const mem = (t.members || []).find(mm => mm.uid === u.id);
        if (mem) {
          m = { id: mem.id, name: mem.name, teamId: t.id };
          // Capture the account email onto the member so the commissioner roster
          // can show who's who. One-time stamp; skip if already current.
          const email = u.email?.toLowerCase();
          if (email && mem.email !== email) {
            await commitState(s2 => {
              const mm = s2.teams.flatMap(tt => tt.members || []).find(x => x.id === mem.id);
              if (mm) mm.email = email;
              return s2;
            });
          }
          break;
        }
      }
    }
    // Reserved by the commissioner "by email" but not linked yet? Claim the
    // unclaimed member whose email matches this account, so the slot (team,
    // picks, history) follows them the moment they sign in. Never touch a member
    // already linked to a different account.
    if (!m && u?.email) {
      const email = u.email.toLowerCase();
      for (const t of ns.teams) {
        const mem = (t.members || []).find(mm => !mm.uid && mm.email?.toLowerCase() === email);
        if (mem) {
          m = { id: mem.id, name: mem.name, teamId: t.id };
          await commitState(s2 => {
            const mm = s2.teams.flatMap(tt => tt.members || []).find(x => x.id === mem.id);
            if (mm) { mm.uid = u.id; mm.email = email; }
            return s2;
          });
          break;
        }
      }
    }
    // Not linked yet? Fall back to this device's legacy identity (a member made
    // before accounts existed) and silently stamp it with the account so it
    // shows up on their other devices too — existing pools keep working.
    if (!m) {
      const legacy = await getMe(code);
      if (legacy && u) {
        const t = ns.teams.find(tt => tt.id === legacy.teamId);
        const mem = t?.members?.find(mm => mm.id === legacy.id);
        // Only adopt this device's saved member if it's unclaimed or already
        // ours — never one linked to a different account. Otherwise a second
        // person signing in on a shared device would inherit the first's team.
        if (mem && (!mem.uid || mem.uid === u.id)) {
          m = { id: mem.id, name: mem.name, teamId: t!.id };
          if (!mem.uid) {
            await commitState(s2 => {
              const tt = s2.teams.find(x => x.id === legacy.teamId);
              const mm = tt?.members?.find(x => x.id === legacy.id);
              if (mm) mm.uid = u.id;
              return s2;
            });
          }
        }
      } else {
        m = legacy || null;
      }
    }
    setMe(m);
    if (m) persistMe(code, m);

    // Register the active league in the switch list only once it has a real
    // name. Nameless leagues never go in the registry (they'd show as a
    // permanent "Unnamed league" phantom); the active one still shows in the
    // "This league" card from shared state regardless.
    if (ns.leagueName) {
      upsertLeague(code, ns.leagueName);
      if (u) await addUserLeague(u.id, code, ns.leagueName);
      setLeagues(listLeagues());
    }
    setLoaded(true);
  }, [commitState]);

  // bootstrap auth: resolve the current session, then react to sign-in/out.
  useEffect(() => {
    if (!AUTH_ON) return;
    let alive = true;
    getAuthUser().then(u => { if (alive) { setUser(u); setAuthReady(true); } });
    const unsub = onAuthChange(u => { if (alive) { setUser(u); setAuthReady(true); } });
    return () => { alive = false; unsub(); };
  }, []);

  // init: once auth is settled (and, when required, signed in), resolve the
  // active league + team invite, pull the account's leagues onto this device,
  // then load. Re-runs on sign-in so the right account's data loads.
  useEffect(() => {
    if (!authReady) return;
    if (AUTH_ON && !user) return;   // render shows SignIn instead
    let alive = true;
    (async () => {
      const code = activeLeague();
      leagueCodeRef.current = code;
      setLeagueCode(code);
      pruneLeagues();               // clear out any nameless/duplicate legacy entries
      if (user) await syncUserLeagues(user.id);   // merge the account's leagues with this device's
      setLeagues(listLeagues());
      try { setInviteTeamId(new URL(window.location.href).searchParams.get("team")); } catch { /* ignore */ }
      if (alive) await reload(code);
    })();
    return () => { alive = false; };
    // Keyed on user?.id (not the whole user object) so token refreshes, which
    // emit a fresh user object with the same id, don't trigger a full reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user?.id, reload]);

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

  const setMeBoth = useCallback(async (m: MeState | null) => {
    setMe(m);
    await persistMe(leagueCodeRef.current, m);
    if (m) {
      setInviteTeamId(null);
      try { window.history.replaceState(null, "", leagueLink(leagueCodeRef.current)); } catch { /* ignore */ }
    }
  }, []);

  // Stable loader for the commissioner accounts directory — reads the league via
  // ref so its identity never changes, avoiding a re-fetch on every poll tick.
  const loadAccounts = useCallback(() => listAccounts(leagueCodeRef.current), []);

  const api = useMemo(() => ({
    createTeam: async (teamName: string, playerName: string) => {
      const mid = uid(), tid = uid();
      await commitState(s => {
        s.teams.push({ id: tid, name: teamName, members: [{ id: mid, name: playerName, uid: user?.id }], picks: null });
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
        if (t) { t.members = t.members || []; t.members.push({ id: mid, name: playerName, uid: user?.id }); }
        return s;
      });
      await setMeBoth({ id: mid, name: playerName, teamId: tid });
      setTab("home");
    },
    // Claim an existing member on a new device: link it to this account so the
    // same identity (team, picks, history) follows you across every device.
    resume: async (tid: string, mid: string, nm: string) => {
      await commitState(s => {
        const t = s.teams.find(t => t.id === tid);
        const mem = t?.members?.find(m => m.id === mid);
        if (mem && user) mem.uid = user.id;
        return s;
      });
      await setMeBoth({ id: mid, name: nm, teamId: tid });
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
    // Rename yourself (the player), updating both the member record in shared
    // state and this device's identity so it shows everywhere immediately.
    renameMe: async (nm: string) => {
      const newName = nm.trim();
      if (!newName || !me) return;
      await commitState(s => {
        const t = s.teams.find(t => t.id === me.teamId);
        const mem = t?.members?.find(m => m.id === me.id);
        if (mem) mem.name = newName;
        return s;
      });
      await setMeBoth({ ...me, name: newName });
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
    setDraftTime: async (ts: number | null) => {
      await commitState(s => { s.draftAt = ts; return s; });
    },

    /* ---- commissioner roster admin (manages any team / person) ---- */
    addTeam: async (name: string) => {
      const nm = name.trim();
      if (!nm) return;
      await commitState(s => {
        s.teams.push({ id: uid(), name: nm, members: [], picks: null });
        return s;
      });
    },
    renameTeamById: async (teamId: string, name: string) => {
      const nm = name.trim();
      if (!nm) return;
      await commitState(s => {
        const t = s.teams.find(t => t.id === teamId);
        if (t) t.name = nm;
        return s;
      });
    },
    removeTeam: async (teamId: string) => {
      await commitState(s => { s.teams = s.teams.filter(t => t.id !== teamId); return s; });
      if (me?.teamId === teamId) { await setMeBoth(null); setMe(null); }
    },
    addMember: async (teamId: string, name: string, email?: string) => {
      const nm = name.trim();
      if (!nm) return;
      const em = email?.trim().toLowerCase() || undefined;
      await commitState(s => {
        const t = s.teams.find(t => t.id === teamId);
        if (t) { t.members = t.members || []; t.members.push({ id: uid(), name: nm, email: em }); }
        return s;
      });
    },
    renameMember: async (memberId: string, name: string) => {
      const nm = name.trim();
      if (!nm) return;
      await commitState(s => {
        const mem = s.teams.flatMap(t => t.members || []).find(m => m.id === memberId);
        if (mem) mem.name = nm;
        return s;
      });
      if (me?.id === memberId) await setMeBoth({ ...me, name: nm });
    },
    removeMember: async (memberId: string) => {
      await commitState(s => {
        for (const t of s.teams) t.members = (t.members || []).filter(m => m.id !== memberId);
        if (s.commissioner === memberId) s.commissioner = null;
        return s;
      });
      if (me?.id === memberId) { await setMeBoth(null); setMe(null); }
    },
    moveMember: async (memberId: string, toTeamId: string) => {
      await commitState(s => {
        let moved: typeof s.teams[number]['members'][number] | undefined;
        for (const t of s.teams) {
          const i = (t.members || []).findIndex(m => m.id === memberId);
          if (i >= 0) { moved = t.members[i]; t.members.splice(i, 1); break; }
        }
        const dest = s.teams.find(t => t.id === toTeamId);
        if (moved && dest) { dest.members = dest.members || []; dest.members.push(moved); }
        return s;
      });
      if (me?.id === memberId) await setMeBoth({ ...me, teamId: toTeamId });
    },
    setCommissioner: async (memberId: string) => {
      await commitState(s => { s.commissioner = memberId; return s; });
    },
  }), [commitState, setMeBoth, me, user]);

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

  const stageWins: StageWinner[] = useMemo(
    () => stageWinners(state.teams || [], scores, ko, state.scoring || DEFAULT_SCORING),
    [state.teams, state.scoring, scores, ko]
  );

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
    if (userRef.current) await addUserLeague(userRef.current.id, code, name);
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
    if (userRef.current) await removeUserLeague(userRef.current.id, code);
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

  const signOutNow = useCallback(async () => {
    await signOut();
    // Drop this device's saved identity so the next person to sign in here
    // isn't handed the previous account's team via the legacy fallback.
    await persistMe(leagueCodeRef.current, null);
    setUser(null);
    setMe(null);
    setLoaded(false);
    setShowSettings(false);
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

  if (AUTH_ON && !authReady) return (
    <div className="app">
      <div className="screen" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <div className="muted">Loading…</div>
      </div>
    </div>
  );

  if (AUTH_ON && !user) return <SignIn onSignedIn={setUser} />;

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
          <Onboarding state={state} defaultName={me?.name || ""} inviteTeamId={inviteTeamId} onJoin={api.joinTeam} onCreate={api.createTeam} onResume={api.resume} />
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
          {isCommish && <button className="hdr-btn" onClick={() => setShowSettings(true)} title="League settings"><Icon name="gear" size={18} /></button>}
          <button className="hdr-btn" onClick={() => setShowProfile(true)} title="You"><Avatar name={me?.name || user?.email || "?"} size={24} /></button>
        </div>
      </aside>

      {/* mobile top header */}
      <header className="hdr">
        <Mark size={36} />
        <LeagueSwitch name={leagueName} onClick={() => setShowLeagues(true)} />
        <button className="hdr-btn" onClick={copyLeagueLink} title="Copy league invite"><Icon name="share" size={16} /></button>
        {isCommish && <button className="hdr-btn" onClick={() => setShowSettings(true)} title="League settings"><Icon name="gear" size={18} /></button>}
        <button className="hdr-btn" onClick={() => setShowProfile(true)} title="You"><Avatar name={me?.name || user?.email || "?"} size={24} /></button>
      </header>

      <div className="screen">
        {tab === "home" && <MyTeam myTeam={myTeam!} state={state} scores={scores} ko={ko} standings={standings} setTab={setTab} onTeamInvite={copyTeamLink} isCommish={isCommish} commishName={commishName} onSetDraftTime={api.setDraftTime} />}
        {tab === "draft" && <DraftView state={state} isCommish={isCommish} commishName={commishName} onRunDraft={api.runDraft} onReset={api.resetDraft} onMovePot={api.movePot} toast={toast} />}
        {tab === "table" && <TableView state={state} scores={scores} standings={standings} movers={movers} myTeam={myTeam} stageWins={stageWins} />}
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
      {showSettings && isCommish && (
        <Settings
          state={state}
          onClose={() => setShowSettings(false)} onScoring={api.setScoring} onResetApp={resetApp}
          onOpenManage={() => { setShowSettings(false); setShowManage(true); }}
          demo={demo} onToggleDemo={toggleDemo} />
      )}
      {showManage && isCommish && (
        <Manage
          state={state} me={me} onClose={() => setShowManage(false)}
          onAddTeam={api.addTeam} onRenameTeam={api.renameTeamById} onRemoveTeam={api.removeTeam}
          onAddMember={api.addMember} onRenameMember={api.renameMember} onRemoveMember={api.removeMember}
          onMoveMember={api.moveMember} onSetCommissioner={api.setCommissioner}
          onLoadAccounts={loadAccounts} />
      )}
      {showProfile && (
        <Profile
          me={me} myTeam={myTeam} isCommish={isCommish} commishName={commishName}
          onClose={() => setShowProfile(false)}
          onRenameMe={api.renameMe} onRenameTeam={api.rename} onTeamInvite={copyTeamLink}
          onLeave={api.leave} onClaim={api.claimCommish}
          userEmail={user?.email ?? null} onSignOut={signOutNow} />
      )}
      {shareModal}
      {toastMsg && <div className="toast"><Icon name="check" size={16} />{toastMsg}</div>}
    </div>
  );
}
