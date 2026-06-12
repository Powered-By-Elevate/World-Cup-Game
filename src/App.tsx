import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { NATION, POT_KEYS } from './data/nations';
import type { AppState, MeState, Scoring } from './data/types';
import { defaultState, withDefaults, DEFAULT_SCORING } from './data/types';
import {
  sget, sset, HAS_REAL, leagueLink, teamLink, parseLeagueCode,
  listLeagues, activeLeague, setActiveLeague, upsertLeague, removeLeague, pruneLeagues, newLeagueCode,
  getMe, setMe as persistMe, resetActiveLeague, clearLocal,
  AUTH_ON, getAuthUser, onAuthChange, signOut, syncUserLeagues, discoverMyLeagues, addUserLeague, removeUserLeague,
  listAccounts, touchPresence, enablePush, notifyDraftRun, sendAnnouncement, pushToMember, pushState,
  isIOS, isStandalone,
} from './utils/storage';
import type { League, AuthUser } from './utils/storage';
import { groupResults, knockoutResults } from './data/results';
import { fetchLiveResults } from './data/liveResults';
import type { LiveData } from './data/liveResults';
import { uid, shuffle } from './utils/helpers';
import { teamStats, computeMovers, stageWinners, stageComplete } from './utils/scoring';
import type { StandingEntry, StageWinner } from './utils/scoring';
import { computeAwards, aliveCount } from './utils/awards';
import { Icon, Mark } from './components/Icon';
import type { IconName } from './components/Icon';
import { Avatar, Celebration } from './components/shared';
import { fx } from './utils/fx';
import { Onboarding } from './views/Onboarding';
import { MyTeam } from './views/MyTeam';
import { SoccerStars } from './views/SoccerStars';
import { DraftView } from './views/DraftView';
import { TableView } from './views/Leaderboard';
import { MatchesView } from './views/MatchesView';
import { Squads } from './views/Squads';
import { Settings } from './views/Settings';
import { Manage } from './views/Manage';
import { TrophyRoom } from './views/TrophyRoom';
import { Arcade } from './views/Arcade';
import { recordScore, createChallenge, respondChallenge, winnerOf, GAME_META } from './utils/arcade';
import type { ArcadeGame, LaunchMode } from './utils/arcade';
import { loadNotifs, pushNotifs, unreadCount, mine, markAllRead } from './utils/notify';
import type { Notif } from './utils/notify';
import { detectMatchEvents } from './utils/matchNotify';
// Penalty Streak pulls in Three.js + the GLB/FBX loaders — lazy-load it so that
// weight only lands when someone actually opens the game.
const PenaltyStreak = lazy(() => import('./views/PenaltyStreak').then(m => ({ default: m.PenaltyStreak })));
import { Profile } from './views/Profile';
import { Leagues } from './views/Leagues';
import { SignIn } from './views/SignIn';
import { Chat } from './views/Chat';
import { loadChat, sendChat, visibleTo } from './utils/chat';
import type { ChatMessage } from './utils/chat';
import './styles.css';

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "home", label: "My Team", icon: "home" },
  { id: "draft", label: "Draft", icon: "draft" },
  { id: "table", label: "Table", icon: "table" },
  { id: "matches", label: "Matches", icon: "cal" },
  { id: "arcade", label: "Arcade", icon: "bolt" },
  { id: "squads", label: "Squads", icon: "users" },
  { id: "cabinet", label: "Cabinet", icon: "trophy" },
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
  const [showChat, setShowChat] = useState(false);
  const [launch, setLaunch] = useState<{ game: ArcadeGame; mode: LaunchMode } | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState<false | 'enable' | 'install'>(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const prevRank = useRef<number | null>(null);
  const launchDone = useRef(false);   // guard: a challenge leg settles once per launch
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatSeen, setChatSeen] = useState(0);
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
    } else {
      // Older leagues never wrote their name into SHARED state — it lived only
      // in the creator's device registry, so everyone else discovered the
      // league nameless. Backfill it from this device's registry; once any
      // device that knows the name loads the league, the name is shared.
      const known = listLeagues().find(l => l.code === code)?.name;
      if (known) {
        await commitState(s => { s.leagueName = known; return s; });
        if (u) await addUserLeague(u.id, code, known);
      }
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
      if (user) {
        await syncUserLeagues(user.id);     // merge the account's leagues with this device's
        await discoverMyLeagues(user.id);   // find leagues whose roster has you, wherever you joined
      }
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

  // poll league chat (global + whispers) while signed in with a team
  useEffect(() => {
    if (!loaded || !me) return;
    let alive = true;
    const tick = async () => { const c = await loadChat(); if (alive) setChat(c); };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [loaded, me, leagueCode]);

  // remember how far we've read this league's chat (drives the unread dot)
  useEffect(() => {
    try { setChatSeen(Number(localStorage.getItem(`wc:chat:seen:${leagueCode}`)) || 0); } catch { /* ignore */ }
  }, [leagueCode]);

  // poll the in-app notification feed (challenges, chat, match events)
  useEffect(() => {
    if (!loaded || !me) return;
    let alive = true;
    const tick = async () => { const n = await loadNotifs(); if (alive) setNotifs(n); };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [loaded, me, leagueCode]);

  // soundtrack the arrivals (in-app only — OS push sounds can't be customized):
  // ref's whistle for a new chat message, air horn for challenges/match alerts.
  // The refs start at -1 so the first poll after load/league-switch is silent.
  const chatSndRef = useRef(-1);
  const notifSndRef = useRef(-1);
  useEffect(() => { chatSndRef.current = -1; notifSndRef.current = -1; }, [leagueCode]);
  useEffect(() => {
    if (!me) return;
    const maxTs = chat.reduce((a, m) => (m.from !== me.id && visibleTo(me.id, m) && m.ts > a ? m.ts : a), 0);
    if (chatSndRef.current === -1) { chatSndRef.current = maxTs; return; }
    if (maxTs > chatSndRef.current) { chatSndRef.current = maxTs; fx.whistle(); }
  }, [chat, me]);
  useEffect(() => {
    if (!me) return;
    // chat notifs excluded — the whistle above already covers them
    const maxTs = notifs.reduce((a, n) => (n.to === me.id && n.kind !== 'chat' && n.ts > a ? n.ts : a), 0);
    if (notifSndRef.current === -1) { notifSndRef.current = maxTs; return; }
    if (maxTs > notifSndRef.current) { notifSndRef.current = maxTs; fx.horn(); }
  }, [notifs, me]);

  // one-time soft prompt to turn on notifications (the Enable tap is the gesture
  // iOS requires — a bare on-load requestPermission() is ignored on iPhone)
  useEffect(() => {
    if (!loaded || !me) return;
    try {
      const st = pushState();
      if (st === 'default' && localStorage.getItem('wc:pushprompt') !== 'done') setShowPushPrompt('enable');
      // iOS in a Safari tab can't do push at all — surface the Home-Screen step
      // instead of silently showing nothing (this is why some members never saw a prompt)
      else if (st === 'unsupported' && isIOS() && !isStandalone() &&
               localStorage.getItem('wc:installprompt') !== 'done') setShowPushPrompt('install');
    } catch { /* ignore */ }
  }, [loaded, me]);

  // self-heal: when permission is already granted, silently re-sync this
  // device's subscription on every open — covers re-installed Home-Screen apps
  // and accounts that enabled notifications while a different league was open.
  useEffect(() => {
    if (!loaded || !user) return;
    if (pushState() === 'granted') void enablePush(user.id);
  }, [loaded, user]);

  // Detect kickoffs / final results for the league's drafted nations and fan out
  // notifications (in-app feed + targeted push to whoever owns those nations).
  // Deduped via the shared wc:matchwatch set so it fires once per league however
  // many clients are open; the first run seeds silently (no backfill on launch).
  useEffect(() => {
    if (!loaded || !me || !stateRef.current.draftDone) return;
    if (!demo && !live) return;   // wait for real feed data before seeding, so the first
                                  // real poll (not an empty pre-fetch render) is the seed
    let alive = true;
    (async () => {
      const sc = demo ? ENGINE_SCORES : (live?.scores ?? {});
      const k = demo ? ENGINE_KO : (live?.ko ?? []);
      const teams = stateRef.current.teams || [];
      const scoring = stateRef.current.scoring || DEFAULT_SCORING;
      const watch = await sget<Record<string, number>>('wc:matchwatch', true);
      const { events, watch: next } = detectMatchEvents(teams, sc, k, scoring, watch);
      if (!alive) return;
      if (JSON.stringify(next) !== JSON.stringify(watch)) await sset('wc:matchwatch', next, true);  // claim before sending
      if (!events.length) return;
      await pushNotifs(events.flatMap(ev => ev.recipients.map(r => ({
        to: r.memberId, kind: ev.kind === 'start' ? 'match-start' as const : 'match-result' as const,
        ts: Date.now(), title: ev.title, body: r.body,
      }))));
      const link = leagueLink(leagueCodeRef.current);
      for (const ev of events) for (const r of ev.recipients) void pushToMember(leagueCodeRef.current, r.memberId, ev.title, r.body, link);
    })();
    return () => { alive = false; };
    // reads teams/scoring/draftDone via stateRef so it only re-runs on new feed data
  }, [live, demo, loaded, me]);

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
      let ran = false;
      await commitState(s => {
        const minPot = Math.min(...POT_KEYS.map(pk => (s.pots[pk] || []).length));
        if (s.teams.length < 1 || s.teams.length > minPot) return s;
        ran = true;
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
      // Fan out the reveal: push + email to everyone (server re-checks commissioner).
      if (ran) {
        const nations = Object.fromEntries(Object.keys(NATION).map(id => [id, { n: NATION[id].name, f: NATION[id].flag }]));
        void notifyDraftRun(leagueCodeRef.current, nations, leagueLink(leagueCodeRef.current));
      }
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
    // Single-holder: a funny trophy belongs to one team at a time (or nobody).
    setAwardHolder: async (awardId: string, teamId: string | null) => {
      await commitState(s => {
        s.awards = (s.awards || []).filter(a => a.awardId !== awardId);
        if (teamId) s.awards.push({ teamId, awardId });
        return s;
      });
    },
    // Lock in a "Call of the Day" pick. First call for a match wins — never
    // overwrite an existing one (UI only offers the un-kicked-off fixture).
    makeCall: async (matchId: string, nationId: string) => {
      if (!me) return;
      await commitState(s => {
        const all = (s.calls = s.calls || {});
        const mine = (all[me.id] = all[me.id] || {});
        if (mine[matchId]) return s;   // already locked
        mine[matchId] = nationId;
        return s;
      });
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

  // memberId → who they are, for the Best Caller leaderboard.
  const callerNames = useMemo(() => {
    const m: Record<string, { name: string; team: string }> = {};
    for (const t of state.teams || [])
      for (const mem of (t.members || [])) m[mem.id] = { name: mem.name, team: t.name };
    return m;
  }, [state.teams]);

  // everyone else in the league — the people you can whisper.
  const chatMembers = useMemo(() => {
    const out: { id: string; name: string; team: string }[] = [];
    for (const t of state.teams || [])
      for (const mem of (t.members || [])) if (mem.id !== me?.id) out.push({ id: mem.id, name: mem.name, team: t.name });
    return out;
  }, [state.teams, me?.id]);

  const chatUnread = useMemo(
    () => !!me && chat.some(m => m.from !== me.id && visibleTo(me.id, m) && m.ts > chatSeen),
    [chat, me, chatSeen],
  );

  const openChat = useCallback(() => {
    setShowChat(true);
    const maxTs = chat.reduce((a, m) => (m.ts > a ? m.ts : a), 0);
    setChatSeen(maxTs);
    try { localStorage.setItem(`wc:chat:seen:${leagueCodeRef.current}`, String(maxTs)); } catch { /* ignore */ }
  }, [chat]);

  const sendChatMsg = useCallback(async (to: string | null, text: string) => {
    const t = text.trim();
    if (!t || !me) return;
    const msg: ChatMessage = { id: uid(), from: me.id, fromName: me.name, to, text: t.slice(0, 1000), ts: Date.now() };
    const next = await sendChat(msg);
    setChat(next);
    // notify recipients in-app (a whisper → that person; global → everyone else)
    const body = t.slice(0, 120);
    const link = leagueLink(leagueCodeRef.current);
    if (to) {
      const cTitle = `${me.name} messaged you`;
      await pushNotifs([{ to, kind: 'chat', ts: Date.now(), title: cTitle, body }]);
      void pushToMember(leagueCodeRef.current, to, cTitle, body, link);
    } else if (chatMembers.length) {
      const gTitle = `${me.name} · league chat`;
      await pushNotifs(chatMembers.map(m => ({ to: m.id, kind: 'chat' as const, ts: Date.now(), title: gTitle, body })));
      for (const m of chatMembers) void pushToMember(leagueCodeRef.current, m.id, gTitle, body, link);   // push group chat too
    }
  }, [me, chatMembers]);

  const openNotifs = useCallback(async () => {
    setShowNotifs(true);
    if (me) { const n = await markAllRead(me.id); setNotifs(n); }
  }, [me]);

  // launch a game from the Arcade (solo, a new challenge, or answering one)
  const launchGame = useCallback((game: ArcadeGame, mode: LaunchMode) => {
    launchDone.current = false;
    setLaunch({ game, mode });
  }, []);

  // a game reported a score: always update the leaderboard; settle a challenge once
  const handleArcadeScore = useCallback(async (game: ArcadeGame, score: number) => {
    if (!me) return;
    // leaderboard: Soccer counts total wins (one per win), Penalty keeps best streak
    if (game === 'soccer') { if (score > 0) await recordScore('soccer', me.id, me.name, 1, 'add'); }
    else await recordScore('penalty', me.id, me.name, score, 'best');
    const cur = launch;
    if (!cur || launchDone.current) return;
    const mode = cur.mode;
    if (mode.kind === 'challenge') {
      launchDone.current = true;
      await createChallenge(game, me.id, me.name, mode.oppId, mode.oppName, score);
      const cTitle = `${me.name} challenged you`;
      const cBody = `${GAME_META[game].name} — they ${GAME_META[game].verb} ${score}. Play your leg!`;
      await pushNotifs([{ to: mode.oppId, kind: 'challenge', ts: Date.now(), title: cTitle, body: cBody }]);
      void pushToMember(leagueCodeRef.current, mode.oppId, cTitle, cBody, leagueLink(leagueCodeRef.current));
      toast('Challenge sent ⚔');
    } else if (mode.kind === 'respond') {
      launchDone.current = true;
      const ch = await respondChallenge(mode.challengeId, score);
      if (ch) {
        const w = winnerOf(ch);
        const line = (who: string) => w == null ? `Drew ${ch.fromScore}–${ch.toScore}` : w === who ? `You won ${ch.fromScore}–${ch.toScore}!` : `Lost ${ch.fromScore}–${ch.toScore}`;
        const rTitle = `${GAME_META[game].name} result`;
        await pushNotifs([
          { to: ch.from, kind: 'challenge-result', ts: Date.now(), title: rTitle, body: `vs ${ch.toName}: ${line(ch.from)}` },
          { to: ch.to,   kind: 'challenge-result', ts: Date.now(), title: rTitle, body: `vs ${ch.fromName}: ${line(ch.to)}` },
        ]);
        void pushToMember(leagueCodeRef.current, ch.from, rTitle, `vs ${ch.toName}: ${line(ch.from)}`, leagueLink(leagueCodeRef.current));
        toast(w == null ? 'Challenge drawn' : w === me.id ? 'You won the challenge! 🏆' : 'Challenge lost');
      }
    }
  }, [me, launch, toast]);

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

  // Celebrate when your team climbs to #1.
  useEffect(() => {
    if (!loaded || !myTeam || !state.draftDone || standings.length < 2) return;
    const rank = standings.findIndex(s => s.team.id === myTeam.id) + 1;
    const was = prevRank.current;
    prevRank.current = rank;
    if (was != null && was > 1 && rank === 1) { setCelebrate('👑 You took #1!'); fx.win(); }
  }, [standings, myTeam, loaded, state.draftDone]);

  const stageWins: StageWinner[] = useMemo(
    () => stageWinners(state.teams || [], scores, ko, state.scoring || DEFAULT_SCORING),
    [state.teams, state.scoring, scores, ko]
  );

  const awardsByTeam = useMemo(
    () => computeAwards({
      teams: state.teams || [], scores, ko, scoring: state.scoring || DEFAULT_SCORING,
      standings, movers, custom: state.awards || [],
    }),
    [state.teams, state.scoring, state.awards, scores, ko, standings, movers]
  );

  // How many of each couple's 3 nations are still alive (shown once knockouts begin).
  const { aliveByTeam, koStarted } = useMemo(() => {
    const groupDone = stageComplete('Group', scores, ko);
    const m: Record<string, number> = {};
    for (const t of state.teams || []) m[t.id] = aliveCount(t, ko, groupDone);
    return { aliveByTeam: m, koStarted: groupDone };
  }, [state.teams, scores, ko]);

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

  // opt this device into web push (covers challenges, chat, match alerts).
  // On iOS this only works once the site is added to the Home Screen.
  const enableDeviceNotifs = useCallback(async () => {
    if (!user) return;
    const ok = await enablePush(user.id);
    if (ok && me) {
      // immediate self-test: pushes to your own device so you can confirm delivery
      void pushToMember(leagueCodeRef.current, me.id, "Notifications are on ✅", "You'll get challenges, messages and match alerts right here.", leagueLink(leagueCodeRef.current));
    }
    toast(ok ? "Push on — sending a test to this device 🔔" : "Couldn't enable push (iPhone: open the app from your Home Screen, then try again)");
  }, [user, me, toast]);

  // on-demand test: pushes to your own device via the exact whisper path and
  // reports back whether the server found a subscription for you.
  const sendTestNotif = useCallback(async () => {
    if (!me) return;
    // iOS suppresses push banners while the app is on screen — the server holds
    // the test for 5s so you have time to swipe to your Home Screen and see it.
    toast("Test coming in 5 seconds — go to your Home Screen now 📲");
    const r = await pushToMember(leagueCodeRef.current, me.id, "Test notification 🔔", "If you see this, push works on this device.", leagueLink(leagueCodeRef.current), 5);
    if (!r) toast("Couldn't reach the push server");
    else if (r.failures && r.failures.length) {
      // delivery failed — show the push service's actual rejection so we can fix it
      const f = r.failures[0];
      toast(`${r.pushed || 0} sent, ${r.failures.length} failed — ${f.host || 'push service'} said ${f.code}${f.msg ? `: ${f.msg.slice(0, 80)}` : ''}`);
    }
    else if ((r.pushed || 0) > 0) toast(`Test sent to ${r.pushed} device${r.pushed === 1 ? '' : 's'} ✓`);
    else if (r.reason === 'target_not_linked') toast("Account not linked to push yet — sign in, then turn it on");
    else if ((r.matched || 0) === 0) toast("No devices subscribed for your account — turn notifications on, on each device");
    else toast("No subscription on this device — turn notifications on first");
  }, [me, toast]);

  // dismiss the one-time "turn on notifications" soft prompt (Enable fires the gesture).
  // The 'install' variant (iOS Safari tab, push unsupported) has its own flag and
  // never tries to subscribe — it just teaches Add to Home Screen.
  const dismissPushPrompt = useCallback((enable: boolean) => {
    const variant = showPushPrompt;
    setShowPushPrompt(false);
    try {
      localStorage.setItem(variant === 'install' ? 'wc:installprompt' : 'wc:pushprompt', 'done');
    } catch { /* ignore */ }
    if (enable && variant !== 'install') void enableDeviceNotifs();
  }, [showPushPrompt, enableDeviceNotifs]);

  const announce = useCallback(async (message: string) => {
    const subject = `📣 ${realLeagueName || 'World Cup pool'}`;
    const r = await sendAnnouncement(leagueCodeRef.current, subject, message, leagueLink(leagueCodeRef.current));
    toast(r ? `Sent to ${r.emailed} ${r.emailed === 1 ? 'inbox' : 'inboxes'}${r.pushed ? ` · ${r.pushed} push` : ''}` : "Couldn't send message");
  }, [realLeagueName, toast]);

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

  const notifUnread = me ? unreadCount(notifs, me.id) : 0;
  const myNotifs = me ? mine(notifs, me.id) : [];
  // Once the draft has run, the Draft tab is dead weight — drop it from the nav.
  // (The reveal still shows right after running via setTab('draft').)
  const navItems = state.draftDone ? NAV.filter(n => n.id !== "draft") : NAV;

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
          {navItems.map(n => (
            <button key={n.id} className={"sb-navb " + (tab === n.id ? "on" : "")} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} size={20} /><span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sb-bottom">
          <span className={`status ${HAS_REAL ? "live" : "preview"}`}><span className="dot" />{HAS_REAL ? "Live" : "Preview"}</span>
          <button className="hdr-btn chat-btn" onClick={openNotifs} title="Notifications"><Icon name="bell" size={17} />{notifUnread > 0 && <span className="chat-badge" />}</button>
          <button className="hdr-btn chat-btn" onClick={openChat} title="Chat"><Icon name="chat" size={17} />{chatUnread && <span className="chat-badge" />}</button>
          <button className="hdr-btn" onClick={copyLeagueLink} title="Copy league invite"><Icon name="share" size={16} /></button>
          {isCommish && <button className="hdr-btn" onClick={() => setShowSettings(true)} title="League settings"><Icon name="gear" size={18} /></button>}
          <button className="hdr-btn" onClick={() => setShowProfile(true)} title="You"><Avatar name={me?.name || user?.email || "?"} size={24} /></button>
        </div>
      </aside>

      {/* mobile top header — logo + bell removed so the league switcher can breathe */}
      <header className="hdr">
        <LeagueSwitch name={leagueName} onClick={() => setShowLeagues(true)} />
        <button className="hdr-btn chat-btn" onClick={openChat} title="Chat"><Icon name="chat" size={17} />{chatUnread && <span className="chat-badge" />}</button>
        <button className="hdr-btn" onClick={copyLeagueLink} title="Copy league invite"><Icon name="share" size={16} /></button>
        {isCommish && <button className="hdr-btn" onClick={() => setShowSettings(true)} title="League settings"><Icon name="gear" size={18} /></button>}
        <button className="hdr-btn" onClick={() => setShowProfile(true)} title="You"><Avatar name={me?.name || user?.email || "?"} size={24} /></button>
      </header>

      <div className="screen">
        {tab === "home" && <MyTeam myTeam={myTeam!} state={state} scores={scores} ko={ko} standings={standings} setTab={setTab} onTeamInvite={copyTeamLink} isCommish={isCommish} commishName={commishName} onSetDraftTime={api.setDraftTime} calls={state.calls || {}} meId={me!.id} names={callerNames} onCall={api.makeCall} liveNow={demo ? [] : (live?.liveNow ?? [])} />}
        {tab === "draft" && <DraftView state={state} isCommish={isCommish} commishName={commishName} onRunDraft={api.runDraft} onReset={api.resetDraft} onMovePot={api.movePot} toast={toast} />}
        {tab === "table" && <TableView state={state} scores={scores} standings={standings} movers={movers} myTeam={myTeam} stageWins={stageWins} awardsByTeam={awardsByTeam} aliveByTeam={aliveByTeam} koStarted={koStarted} />}
        {tab === "matches" && <MatchesView scores={scores} ko={ko} myTeam={myTeam} />}
        {tab === "arcade" && <Arcade calls={state.calls || {}} scores={scores} meId={me!.id} names={callerNames} onCall={api.makeCall} members={chatMembers} onLaunch={launchGame} />}
        {tab === "squads" && <Squads state={state} scores={scores} standings={standings} myTeam={myTeam} />}
        {tab === "cabinet" && <TrophyRoom teams={state.teams || []} awardsByTeam={awardsByTeam} myTeam={myTeam} isCommish={isCommish} onSetAwardHolder={api.setAwardHolder} onShare={toast} />}
      </div>

      <nav className="nav">
        <div className="nav-inner">
          {navItems.map(n => (
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
          onAnnounce={announce}
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
          userEmail={user?.email ?? null} onSignOut={signOutNow} onEnablePush={enableDeviceNotifs} onTestPush={sendTestNotif} />
      )}
      {showChat && (
        <Chat meId={me!.id} messages={chat} members={chatMembers} onSend={sendChatMsg} onClose={() => setShowChat(false)} />
      )}
      {showNotifs && (
        <div className="modal-bg" onClick={() => setShowNotifs(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="between" style={{ padding: "4px 18px 12px" }}>
              <h2 className="display" style={{ fontSize: 24 }}>Notifications</h2>
              <button className="hdr-btn" onClick={() => setShowNotifs(false)} style={{ border: "1.5px solid var(--line)" }}><Icon name="x" size={18} /></button>
            </div>
            <div style={{ padding: "0 14px 26px", maxHeight: "70vh", overflow: "auto" }}>
              {myNotifs.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", fontSize: 14, padding: "20px 0" }}>No notifications yet.</p>
              ) : myNotifs.map(n => (
                <div key={n.id} className="card flat pad" style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{n.title}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {launch?.game === 'soccer' && myTeam && (
        <SoccerStars team={myTeam} onClose={() => setLaunch(null)} onGameEnd={(meS, cpuS) => handleArcadeScore('soccer', meS - cpuS)} />
      )}
      {launch?.game === 'penalty' && (
        <Suspense fallback={<div className="pen-overlay" style={{ display: 'grid', placeItems: 'center', color: '#dfe5ea', fontWeight: 600 }}>Warming up the pitch…</div>}>
          <PenaltyStreak onClose={() => setLaunch(null)} onScore={(s) => handleArcadeScore('penalty', s)} />
        </Suspense>
      )}
      {shareModal}
      {showPushPrompt === 'enable' && (
        <div className="push-prompt">
          <span className="pp-ico" aria-hidden="true">🔔</span>
          <div className="pp-txt">
            <div className="pp-h">Turn on notifications</div>
            <div className="pp-s">Challenges, messages &amp; your teams' match results — on this device.</div>
          </div>
          <button className="btn btn-ink btn-sm" onClick={() => dismissPushPrompt(true)}>Enable</button>
          <button className="hdr-btn" onClick={() => dismissPushPrompt(false)} aria-label="Not now"><Icon name="x" size={16} /></button>
        </div>
      )}
      {showPushPrompt === 'install' && (
        <div className="push-prompt">
          <span className="pp-ico" aria-hidden="true">📲</span>
          <div className="pp-txt">
            <div className="pp-h">Get notifications on this iPhone</div>
            <div className="pp-s">Re-add the app to your Home Screen: <b>delete the old icon</b> if you have one, then in Safari tap <b>Share</b> → <b>Add to Home Screen</b>. Open it from there and turn notifications on.</div>
          </div>
          <button className="btn btn-ink btn-sm" onClick={() => dismissPushPrompt(false)}>Got it</button>
          <button className="hdr-btn" onClick={() => dismissPushPrompt(false)} aria-label="Not now"><Icon name="x" size={16} /></button>
        </div>
      )}
      {celebrate && <Celebration message={celebrate} onDone={() => setCelebrate(null)} />}
      {toastMsg && <div className="toast"><Icon name="check" size={16} />{toastMsg}</div>}
    </div>
  );
}
