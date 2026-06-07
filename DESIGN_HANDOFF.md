# World Cup Family Draft — Design Handoff

> **Read this first.** You're picking up an app you didn't build. This document
> explains *everything*: what it is, every screen, the data behind it, the
> current look, and where we want the redesign to go. The goal is a **full
> visual re-skin** — make it modern, fun, flag-forward, and genuinely
> eye-catching — without breaking how it works.

---

## 1. What this app is

**World Cup Family Draft** is a private pool game families play during the 2026
World Cup (USA · Canada · Mexico). Think fantasy football, but dead simple and
built for a family group chat:

1. Everyone opens a shared invite link and makes or joins a **team** (a "couple"
   — e.g. two partners share one team).
2. One person is the **commissioner**. They run a **draft** that randomly gives
   each team **three nations** — one from each tier: a **Favorite**, an
   **Underdog**, and a **Longshot**.
3. As real matches happen, scores get entered. Each team earns points from how
   their three nations perform, plus bonuses for going deep into the knockouts.
4. Everyone watches the **live table** to see who's winning. Last couple
   standing (whoever's nations go furthest) wins.

It's casual, social, and emotional — you're rooting for *your* countries against
your family. The brand should feel like that: celebratory, a little competitive,
full of national color and pride.

**Platform:** mobile-first web app (people open it on their phones during
matches). It's a single screen with a bottom tab bar — **not** a multi-page site.

---

## 2. Tech stack & how to work in it

- **React 18 + TypeScript + Vite.** Single-page app.
- **Styling today:** one hand-written stylesheet, `src/styles.css`, using CSS
  custom properties (design tokens) + a small vocabulary of class names
  (`.card`, `.btn`, `.chip`, `.mrow`, etc.), plus some inline styles in
  components. **Tailwind is installed and available** if you'd prefer it.
- **Icons:** custom inline SVGs in `src/components/Icon.tsx`. `lucide-react` is
  installed and fine to use.
- **No other UI/icon/animation libraries are currently used.** You may add
  animation libs (e.g. Framer Motion) if the design calls for it.

### The golden rule for the redesign
All screens are **presentational components driven by props** from one
controller (`src/App.tsx`). The game logic, data, and storage are separate and
**should not be touched**:

- `src/data/` — nations, fixtures, types (the source of truth). Don't edit.
- `src/utils/` — scoring, storage, helpers. Don't edit `storage.ts`
  (it powers cross-device family sync).
- `src/App.tsx` — owns all state and passes data + callbacks down.

You can freely rewrite anything in `src/views/` and `src/components/` and
`src/styles.css`, restructure JSX, swap the class system for Tailwind, change
fonts/colors/layout — as long as each view keeps rendering the same data and
calling the same callbacks. Component prop signatures are the contract; the
visuals inside are yours.

### File map
```
src/
  App.tsx              # shell: header, bottom nav, routing-by-tab, all state
  main.tsx             # React entry
  index.css            # near-empty base
  styles.css           # ALL current styling + design tokens  ← redesign target
  data/
    nations.ts         # 48 nations: id, name, flag code, pot, 2 brand colors
    fixtures.ts        # 72 group matches + knockout round definitions
    types.ts           # app state shapes, default scoring
  utils/
    scoring.ts         # standings, per-nation stats, "biggest mover" math
    storage.ts         # shared persistence (DO NOT EDIT)
    helpers.ts         # date/time formatting, shuffle, clamp
  components/
    Flag.tsx           # the flag chip (central to the brand) ← see §6
    Icon.tsx           # inline SVG icon set
    shared.tsx         # Avatar, TeamFlags, teamGradient(), Countdown
  views/
    Onboarding.tsx     # join/create a team
    MyTeam.tsx         # "home" tab
    DraftView.tsx      # the draft
    Leaderboard.tsx    # exports TableView (the "table" tab) + Leaderboard
    MatchesView.tsx    # group + knockout score entry
    Squads.tsx         # everyone's teams
    Settings.tsx       # modal: scoring rules, team, commissioner
public/                # favicon.svg, og.png, icons (see §9 — can be redone)
```

---

## 3. The data model (what every screen is showing)

Understanding these makes the screens make sense.

- **Nation** — a country. Has: `id` (e.g. `"BRA"`), `name` (`"Brazil"`), a
  `flag` code for the image, a `pot` (`FAV` | `UND` | `LNG`), and **two brand
  colors `c1`/`c2`** pulled from its flag. There are **48 nations, 16 per pot.**
  The two colors are used for the flag fallback and to generate each team's
  signature gradient — *lean into these in the design.*

- **Pots / tiers** — three of them, each with its own identity:
  | Pot | Label | Tag | Accent color (today) |
  |-----|-------|-----|----------------------|
  | `FAV` | Favorites | POT 1 | gold `#FFC53D` |
  | `UND` | Underdogs | POT 2 | cyan `#5EE1E6` |
  | `LNG` | Longshots | POT 3 | magenta `#F19BFF` |

- **Team** ("couple") — `name`, a list of **members** (people), and `picks`
  (one nation per pot, after the draft).

- **Member** — a person with a name. One of them may be the **commissioner**
  (gets a 👑).

- **Match** — a group-stage fixture: home nation, away nation, group letter,
  date/time, host city. **72 of them**, across **12 groups (A–L)**.

- **KOMatch** — a knockout match someone adds as the bracket forms (round,
  two nations, score, optional penalty-shootout winner).

- **Score** — home/away goals + status (`sched` | `live` | `ft`).

- **Scoring rules** (configurable): points per win/draw, plus cumulative
  knockout bonuses (reach R32, R16, QF, SF, Final, win it all).

- **Standings** — computed per team: total points, goals for/against, goal
  difference, W/D/L, plus a per-nation breakdown.

---

## 4. Every screen, in detail

The app has a **sticky header**, a **content area** that swaps by tab, and a
**fixed bottom nav** with 5 tabs. A **Settings modal** opens from the header.

### Global chrome
- **Header:** wordmark ("World Cup / FAMILY DRAFT · 2026"), a **LIVE/PREVIEW**
  status pill (LIVE = family sync is on), an **Invite** button (copies the share
  link), and a **Settings** gear. Header hides everything but the wordmark
  during onboarding.
- **Bottom nav (5 tabs):** **My Team**, **Draft**, **Table**, **Matches**,
  **Squads**. Active tab is highlighted.
- **Background:** very dark near-black with soft radial color glows (lime, cyan,
  gold), faint horizontal "pitch lines," and a subtle film grain. This ambient,
  stadium-at-night feeling is worth keeping in spirit.

### A. Onboarding (shown until you've joined a team)
Two steps:
1. **Your name** — single input, Continue.
2. **Join or create a team** — a list of existing teams (each shows its members)
   with a Join button, plus a "start a new team" input. There's a big hero
   banner: *"Family Draft — Draft 3 nations. Track every game. Last couple
   standing wins the World Cup."*

This is the first impression — make it sing.

### B. My Team (`home` tab)
The player's personal dashboard:
- **Hero card** tinted with the team's own nation-colors gradient: team name,
  current **points + rank**, the team's **three flags** with names and pot tags,
  and the **member chips**.
- If the draft hasn't run: a prompt to go to the Draft.
- **Next match** card with a live **countdown** to your next nation's kickoff.
- **Your fixtures** — a chronological list of every match involving your three
  nations (group + knockout), with scores/status.

### C. Draft (`draft` tab)
Three states:
1. **Before the draft:**
   - A "Serpentine draft" explainer card. Commissioner sees a big **Run the
     draft** button (disabled with a helpful reason if there aren't enough teams
     or a pot is too small). Non-commissioners see a "locked" notice.
   - **Pot editor:** the three pots listed with their nations, plus a "Not in the
     draft" bin. Commissioner can tap a nation to move it between pots or pull it
     out (via a small modal).
2. **Draft running:** a dramatic **"on the clock"** reveal — picks animate in one
   at a time (team name + the nation they got + pot tag), with a **draft board**
   ticker building up below. This is the *fun centerpiece* — it should feel like
   a live TV draft reveal.
3. **Draft complete:** a 🎉 confirmation, the full board, and a "Re-draft"
   option for the commissioner.

### D. Table (`table` tab)
Segmented control with two modes:
- **Couples** (the main event):
  - **"Biggest mover"** hero card — the team that gained the most points on the
    latest matchday, with their flags and a big `+N`.
  - **Live standings** — ranked, expandable rows. Each row: rank (gold/silver/
    bronze for top 3), team gradient bar, name (trophy on #1), the team's flags,
    and PTS / GD / GF stats, plus a small green ▲ if they moved up. Tap to expand
    a per-nation breakdown (each nation's record, goals, bonus, "CHAMPION" tag).
- **Groups:** the actual **12 World Cup group tables** (A–L), live, with
  qualification coloring (top 2 green, 3rd amber) and the player's own nations
  highlighted.

### E. Matches (`matches` tab)
Where results get entered. Segmented: **Group stage** / **Knockouts**.
- **Group stage:** filter chips (**All / My nations / Live now**), matches grouped
  by **day**. Each match is a row (home flag+name, score or kickoff time, FT/LIVE
  badge, away flag+name). Tap a row to open an inline **score editor**
  (steppers for each team's goals, a Scheduled/Live/Final toggle).
- **Knockouts:** a form to **add a matchup** as the bracket forms (round + two
  nations), then rounds (R32 → Final) each listing their matches with the same
  inline editor. The KO editor adds a **"won on penalties"** toggle when a
  knockout match is level at full time.

### F. Squads (`squads` tab)
A directory of **all teams**: each card shows the team's gradient, name (YOU
badge on yours), members (👑 on the commissioner), points, and their three
nations with per-nation points.

### G. Settings (modal, from the header gear)
- **Scoring:** steppers for Win/Draw points; a Round-bonuses on/off toggle; when
  on, steppers for each milestone (R32/R16/QF/SF/Final/Champion).
- **Commissioner:** claim/become commissioner.
- **Your team:** rename, leave team.
- **Sync status** line (LIVE vs PREVIEW).

---

## 5. Reusable components & the current visual system

### Components you'll restyle
- **`Flag`** — the single most important brand element (see §6).
- **`Icon`** — inline-SVG icon set (home, draft, table, calendar, users, gear,
  share, bolt, trophy). Replace with lucide-react or custom if you like.
- **`Avatar`** — a person's initial in a colored circle.
- **`TeamFlags`** — a team's three flags in a row.
- **`teamGradient(team)`** — builds a CSS gradient from a team's three nation
  colors. This is how each team gets a unique signature look — *a great hook to
  amplify.*
- **`Countdown`** — live ticking countdown to a kickoff.

### Current design tokens (in `src/styles.css`)
These are the starting palette — **you are free to redefine the whole system.**
```
Background   --bg     #070B0A   (near-black)
Text         --txt    #F2F6F1   muted --mut #92A096   fainter --mut2 #6B786F
Surfaces     --panel  rgba(255,255,255,.045)   --panel2 rgba(255,255,255,.07)
Hairlines    --line / --line2  (subtle white borders)
Accent       --lime   #C7FF4E   ← primary action / highlight color today
Gold         --gold   #FFC53D   (Favorites, #1 rank)
Live         --live   #FF4D4D   (live matches)
Pot accents  gold #FFC53D · cyan #5EE1E6 · magenta #F19BFF
```
**Fonts:** `Archivo Black` for big display/headlines (uppercase, tight), `Hanken
Grotesk` for body. Loaded from Google Fonts in `styles.css`.

**Shape language today:** rounded corners (cards ~18–22px), pill chips/badges,
soft shadows, dark glassy panels on a near-black gradient backdrop.

**Class vocabulary** (if you keep CSS): `.card`, `.hero`, `.btn`/`.btn-lime`/
`.btn-ghost`, `.chip`(+`.on`), `.pill`/`.live-badge`/`.ft-badge`, `.eyebrow`
(tiny uppercase label), `.h2`, `.mrow` (match row), `.lb-row` (leaderboard row),
`.statbox`, `.seg` (segmented control), `.stepper`, `.tick`/`.onclock` (draft),
`.member`, `.flagrow`, `.toast`, `.modal`/`.modal-bg`, `.wc-nav`/`.navb`,
`.daterow`.

### Motion that exists today (keep the spirit, elevate it)
- Draft picks slide/fade in one by one ("on the clock" reveal).
- Live badge blinks; the LIVE sync dot pulses.
- Toasts slide up; the settings sheet slides from the bottom.

---

## 6. The flag system (brand-critical)

Flags are the heart of this app — every screen is covered in them, and the brand
should be **built around nations and flags.**

- `Flag.tsx` renders `https://flagcdn.com/w160/<code>.png` (e.g. `br`, `gb-eng`).
- If the image fails, it falls back to a **two-tone gradient** of that nation's
  `c1`/`c2` colors with the country code — so flags never break.
- Today flags are simple rounded rectangles. **This is a big opportunity:**
  consider flag treatments that feel premium and fun — consistent framing, subtle
  depth/shine, circular vs. rounded, motion on reveal, flags as the primary
  visual texture of cards and heroes, nation-color gradients bleeding into
  backgrounds, etc. Every team already has a unique color identity via
  `teamGradient()` — make teams feel like *brands*.

---

## 7. Layout & responsiveness

- **Mobile-first.** Content column is centered, ~`max-width: 560px`. Most usage
  is on phones during matches.
- **Fixed bottom nav** (thumb-reachable) + **sticky header**. Keep content clear
  of both (there's bottom padding for the nav).
- It should still look intentional on desktop (centered column is fine, but feel
  free to make larger breakpoints richer if you want).

---

## 8. Design direction (the brief)

**Make it super modern, fun, and unmistakably about nations and flags.** This is
a family game during the world's biggest tournament — it should feel like a
celebration, not a spreadsheet.

Creative anchors (direction, not prescription — bring your own ideas):
- **Flag-forward & nation-colored.** Let countries' colors drive the palette per
  team/screen. Big, proud, textural use of flags.
- **Broadcast / matchday energy.** Bold display type, score-bug styling, "LIVE"
  states, a draft reveal that feels like a televised event.
- **Playful and tactile.** Satisfying micro-interactions, celebratory moments
  (draft reveal, a team taking #1, a nation becoming CHAMPION), confetti-worthy
  highs. It's competitive *and* warm.
- **A real brand.** A memorable wordmark/logo and a cohesive identity (the
  current soccer-ball mark and lime/gold palette are just a starting point — feel
  free to evolve or replace). It should be screenshot-worthy in a family chat.
- **Trophy/championship motifs** are welcome (it's a Cup), as are subtle
  pitch/stadium textures.
- **Accessibility:** keep strong contrast, legible type, and clear live/score
  states.

What to preserve conceptually: the dark, premium, stadium-at-night mood reads
well and makes flags pop — but that's a starting point, not a requirement. The
**information** on each screen (§4) and the **component contracts** (§2) are what
must survive; the visuals are entirely open.

---

## 9. Brand assets (current — replaceable)

In `public/` (all can be redesigned):
- `favicon.svg` — current mark: a soccer ball on a dark roundel.
- `favicon-32.png`, `apple-touch-icon.png` — raster icons.
- `og.png` — 1200×630 social share image (title + ball + pot color chips).
- Meta tags live in `index.html` (title, description, Open Graph, Twitter,
  `theme-color`). Update these if the brand changes.
> The PNGs were generated from SVG with `sharp`. If you want, deliver new SVG
> source art and we can regenerate the raster sizes.

---

## 10. Practical checklist for the redesign

- Run it: `npm install && npm run dev`. (To see real data, run the draft and
  enter a few scores; with no backend it persists locally on your device.)
- Restyle within `src/views/`, `src/components/`, and `src/styles.css` (or move
  to Tailwind). Keep each component's **props/callbacks** intact.
- Don't edit `src/data/*` or `src/utils/storage.ts`.
- Keep the 5-tab structure and the data shown on each screen; reorganize the
  *presentation* freely.
- Verify before handing back: `npm run typecheck`, `npm run lint`, `npm run
  build` should all pass.
- Hit every state: onboarding, empty/pre-draft, the draft reveal, populated
  table (couples + groups), match & knockout editors, settings modal, and the
  LIVE vs PREVIEW header states.

Have fun with it — this one's begging to be beautiful.
