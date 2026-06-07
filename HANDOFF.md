# Session Handoff — World Cup Family Draft

> For the next Claude (or developer) picking this up. Read this top to bottom
> before changing anything. It captures what the app is, how it's built, what's
> done, the non-obvious decisions, and what's left. A companion doc,
> `DESIGN_HANDOFF.md`, covers the visual design system in depth.

---

## 1. What this is

A private, mobile-first web app for running a **family World Cup pool** during the
2026 tournament (USA · Canada · Mexico). Couples form **teams**; a commissioner
runs a **serpentine draft** that gives each team **three nations** (one Favorite,
one Underdog, one Longshot); everyone climbs a **live table** as real results
come in. Multiple **leagues** let different branches of a family run separate
pools.

- **Live site:** https://world-cup-game-zeta.vercel.app/
- **Repo:** `Powered-By-Elevate/World-Cup-Game` (GitHub)
- **Branches:** work happens on `claude/vision-project-setup-NdV29`, then
  fast-forward-merged to `main`. Vercel auto-deploys `main`.
- **Hosting:** Vercel (Vite static build + a serverless function in `api/`).

---

## 2. Tech stack

- **React 18 + TypeScript + Vite.** Single-page app; tabs are state, no router.
- **Styling:** one stylesheet, `src/styles.css` (CSS custom properties + a small
  class vocabulary) + some inline styles. Tailwind is installed but barely used.
- **Fonts:** Anton (display), Hanken Grotesk (body), Archivo (labels) — loaded in
  `index.html`.
- **Icons:** custom inline SVGs in `src/components/Icon.tsx` (lucide also available).
- **Backend:** Supabase (key-value table) for shared state; football-data.org for
  live results via a Vercel serverless proxy.

### Commands
```
npm install
npm run dev        # local dev (http://localhost:5173)
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint  (2 known harmless react-refresh warnings in shared.tsx)
```
**Always run typecheck + lint + build before committing.** No test framework is
configured; those three are the gate.

---

## 3. File map

```
api/
  results.js              # serverless proxy → football-data.org (live results)
src/
  App.tsx                 # shell: state, leagues, results wiring, nav, routing
  main.tsx, index.css     # entry + base
  styles.css              # ALL visual styling + design tokens  (MATCHDAY)
  data/
    nations.ts            # 48 nations: id, name, flag(code), pot, c1/c2 colors
    fixtures.ts           # 72 group fixtures (REAL 2026 schedule) + KO round defs
    types.ts              # AppState/Team/Scoring/etc + defaultState/withDefaults
    results.ts            # deterministic fallback engine (group + KO)
    liveResults.ts        # maps /api/results feed → scores + KO bracket
  utils/
    scoring.ts            # teamStats, nationStats, groupTable, computeMovers
    storage.ts            # multi-league KV, invites, reset, per-league identity
    helpers.ts            # date/time, shuffle, clamp, uid
  components/
    Flag.tsx              # circular ring-framed flag (brand-critical)
    Icon.tsx              # icon set + Mark (wordmark logo)
    shared.tsx            # Avatar, Member, TeamFlags, teamGradient, Countdown, Confetti, PotTag
  views/
    Onboarding.tsx        # name → join/create team (+ team-invite focused join)
    MyTeam.tsx            # "home" tab
    DraftView.tsx         # pre-draft / reveal animation / done
    Leaderboard.tsx       # exports TableView (Couples + Groups)
    MatchesView.tsx       # READ-ONLY group + knockout results
    Squads.tsx            # all teams
    Settings.tsx          # scoring rules, commissioner, team, demo toggle, reset
    Leagues.tsx           # create / join / switch leagues + invites
```

---

## 4. Data model (what each screen shows)

- **Nation** — `{ id, name, flag (flagcdn code), pot: FAV|UND|LNG, c1, c2 }`. 48
  total, 16 per pot. `c1/c2` drive flag fallback + team gradients.
- **Pots/tiers** — FAV (gold), UND (cyan), LNG (magenta).
- **Team** — `{ id, name, members[], picks: {FAV,UND,LNG} | null }`.
- **AppState** (shared per league) — `teams, draftDone, board, scoring, ko, pots,
  commissioner, leagueName, v`. (`ko` in state is unused now — results are derived;
  see §6.)
- **Scoring** — `{ win, draw, bonuses, b: {R32,R16,QF,SF,Final,CHAMP} }`.
- **MeState** (per device, per league) — `{ id, name, teamId }`.

---

## 5. Leagues, identity, invites, reset  (`utils/storage.ts`, `App.tsx`)

- **Multi-league:** every shared key is namespaced by the **active league code**
  (`scoped(key, shared) => \`${activeLeague()}:${key}\``). Works on all backends
  (Supabase / localStorage / memory), not just Supabase.
- **League registry** lives in localStorage: `wc:leagues` (list of `{code,name}`),
  `wc:activeLeague`. `leagueName` is also stored in shared state so all members see it.
- **Per-league identity:** `wc:me:<code>` (per device). Switching leagues loads a
  different identity — this fixed cross-league bleed.
- **Two invites:**
  - **League invite** → `?league=CODE` → join the league, pick/create a team.
  - **Team invite** → `?league=CODE&team=TEAMID` → Onboarding shows a focused
    "Join {team}" flow (drops the person straight onto that team).
  - Built via `leagueLink()` / `teamLink()`; parsed by `parseLeagueCode()`.
  - UI: header/sidebar **globe** button opens the **Leagues sheet** (invites,
    switch, create, join); "Invite your partner" also on My Team + Settings.
- **Reset (testing):** Settings → Testing → **Reset app** → `resetActiveLeague()`
  (nulls the league's shared pool) + `clearLocal()` (wipes `wc:*`), then reloads to
  a fresh new league at onboarding.

---

## 6. Results — **NO MANUAL ENTRY** (hard product rule)

There is **zero** score/match entry anywhere. Do not reintroduce editors. Results
are sourced automatically, two ways, selected in `App.tsx`:

1. **Live feed (primary):** `src/data/liveResults.ts` calls **`/api/results`**
   (the Vercel serverless proxy → football-data.org, competition `WC`). It maps
   each real match onto our fixtures by **unordered team pairing** (orientation-safe)
   and builds the **KO bracket** as the feed fills teams in. App polls every 60s.
   - **tla → our id:** identical for all 48 nations except **Uruguay** (`URY` → our
     `URU`), handled by the `ALIAS` map. Our `fixtures.ts` is already the real 2026
     schedule, so only score-mapping is needed (no fixture rebuild).
   - KO bonuses apply as soon as a nation appears in a round — correct, because the
     feed only fills a KO slot once a team has advanced.
2. **Deterministic engine (fallback):** `src/data/results.ts` produces a full,
   identical-on-every-device simulated tournament. Used when the feed is
   unreachable, AND when the user flips **Settings → Results → Demo results** ON
   (so scoring is testable before real matches are played).

Selection logic in `App.tsx`:
`scores = demo ? ENGINE : (live ?? ENGINE)` (same for `ko`). `live` is `null` only
when the fetch fails; an empty-but-reachable feed (pre-tournament) yields real
"all scheduled / 0 pts" state.

> **Pre-tournament behavior is correct, not a bug:** with the real feed and no
> matches played yet, the Table is all zeros and Matches show kickoff times. Turn
> **Demo results ON** to exercise scoring end to end.

### Scoring engine (`utils/scoring.ts`) — unchanged, fed by derived data
`nationStats` (per nation: W/D/L, GF/GA, round bonus, champion) → `teamStats`
(sums a team's 3 picks) → standings sorted by total/GD/GF. `computeMovers` finds
the biggest mover on the latest matchday. `groupTable` builds the 12 live group
tables.

---

## 7. Environment variables (set in Vercel → Settings → Environment Variables)

| Var | Where used | Notes |
|-----|-----------|-------|
| `VITE_SUPABASE_URL` | client build | enables shared cross-device play (LIVE badge) |
| `VITE_SUPABASE_ANON_KEY` | client build | the **anon/publishable** key only |
| `FOOTBALL_DATA_TOKEN` | `api/results.js` (server) | secret; never in client/repo |
| `FOOTBALL_DATA_COMPETITION` | `api/results.js` | optional, defaults to `WC` |

- `VITE_*` are inlined at **build time** → set them, then **redeploy**.
- Supabase migration: `supabase/migrations/20260607000000_app_kv.sql` (a single
  `app_kv` key/value table with anon read/write RLS — fine for a casual family pool).
- `.env` is gitignored; `.env.example` documents all four.

---

## 8. Design system (see `DESIGN_HANDOFF.md` for full detail)

**"MATCHDAY"** — bright, poster-forward, broadcast energy. Cream paper (`--paper
#F4EEE1`) + ink (`--ink #15120C`) + acid-lime (`--lime #C8F23C`); Anton display
type; **circular pot-ring-framed flags** (gold/cyan/magenta) as the repeating
texture; team-gradient hero cards; score-bug rows; TV-style draft reveal with
confetti. Tokens are the `:root` block at the top of `styles.css`.

**Responsive:** mobile is the base layout (sticky header + bottom nav). Desktop
(`@media min-width:900px`, appended at the bottom of `styles.css`) swaps to a
**left sidebar rail** + wider centered content + centered dialog modals. Mobile
rules are untouched by the desktop layer.

---

## 9. ⚠️ Constraints of the *cloud* session this was built in (why a visual pass is still owed)

This project was built almost entirely in **Claude Code on the web** (a sandboxed
cloud container) which has **no browser and a locked-down network** (all external
hosts return `Host not in allowlist`; even the headless-browser download is
blocked). Consequences:

- **The rendered UI has never been visually verified.** Everything passed
  typecheck/lint/build and was ported carefully from the design source, but no one
  has confirmed pixel output. **This is the #1 outstanding task.** A local session
  (or Remote Control + Playwright/Chrome DevTools MCP) can and should do a real
  visual QA pass on mobile and desktop.
- The live `/api/results` feed and Supabase could not be hit from the sandbox; the
  feed shape was confirmed from JSON the user pasted (104 matches, all 12 groups +
  full KO tree; confirmed real tla codes). Re-verify mapping once real matches play.

---

## 10. Outstanding / next tasks (priority order)

1. **Full visual QA** (mobile + desktop) — every screen + state: onboarding,
   draft pre/reveal/done, My Team, Table (Couples + Groups), Matches (group + KO),
   Squads, Settings, Leagues sheet, toast, modals, LIVE vs PREVIEW header. Fix
   spacing/overflow/type/contrast issues. Use a browser MCP locally.
2. **Confirm env vars in Vercel** (`VITE_SUPABASE_*`, `FOOTBALL_DATA_TOKEN`) and
   that the header shows **LIVE**; verify the Leagues flow and both invite links on
   real devices.
3. **Validate live results during a real match** — score mapping, status (live/ft),
   KO bracket filling, penalty winners, champion + bonuses.
4. **Polish ideas** (optional): "nation becomes CHAMPION" celebration; richer
   draft reveal; empty/first-run states; the 2 react-refresh lint warnings (split
   non-component exports out of `shared.tsx` if you want them gone).

---

## 11. Non-obvious gotchas

- **No manual score entry — ever.** It was an explicit hard requirement. Don't add it back.
- `state.ko` exists in the type but is **not** the source of truth; KO comes from
  `liveResults`/`results`. Scoring/views receive `ko` as a prop from `App.tsx`.
- **Demo toggle** (`wc:demo` in localStorage) swaps to the simulated tournament —
  the only way to see non-zero scores before the real tournament starts.
- **Reset** intentionally lands you in a brand-new empty league (fresh code), not
  the one you reset.
- Our `fixtures.ts` already equals the real 2026 schedule; don't replace it.
- Uruguay alias `URY → URU` lives in `liveResults.ts`; if other feed codes ever
  mismatch our ids, add them there.

---

## 12. Working agreement

- Develop on `claude/vision-project-setup-NdV29`; commit with clear messages; then
  `git checkout main && git merge --ff-only <branch>` and push **both** so Vercel
  redeploys.
- Keep typecheck/lint/build green before every push.
- Don't commit secrets. Keep API keys in Vercel env only.
