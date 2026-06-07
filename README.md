# World Cup Family Draft · 2026

A lightweight web app for running a **family World Cup pool** at the 2026 USA ·
Canada · Mexico tournament. Couples (or solo players) form teams, a commissioner
runs a serpentine draft that hands each team **three nations** — one Favorite,
one Underdog, one Longshot — and then everyone races up the table as real
results roll in.

Built with **React + Vite + TypeScript + Tailwind**. No accounts, no install for
players — just share a link.

---

## How the game works

1. **Join.** Everyone opens the invite link, enters their name, and creates or
   joins a team. Your partner joins the *same* team from the same link.
2. **Set the pots (optional).** The commissioner can move nations between the
   Favorites / Underdogs / Longshots pots before drafting.
3. **Draft.** The commissioner runs the draft. It's *serpentine* (order
   reverses each round) and random within each pot, so every team ends up with
   one nation from each tier.
4. **Score.** As matches are played, the commissioner enters scores on the
   **Matches** tab (group stage fixtures are pre-loaded; knockout matchups are
   added as the bracket forms).
5. **Climb.** Points come from your nations' results plus knockout-round bonuses
   (configurable in Settings). The **Table** shows the live standings and who's
   moving; **Squads** shows every team's nations.

Default scoring: **Win 3 / Draw 1**, plus round bonuses
(R32 2, R16 4, QF 6, SF 8, Final 10, Champion 15) — all editable.

---

## Run it locally

```bash
npm install
npm run dev
```

Open the printed URL. With no extra setup, the app saves to your browser's
`localStorage` — perfect for trying it out on one device.

Other scripts:

```bash
npm run build      # production build
npm run preview    # preview the production build
npm run lint       # eslint
npm run typecheck  # tsc, no emit
```

---

## Playing as a family (shared mode)

To let everyone play together across phones and laptops, point the app at a free
[Supabase](https://supabase.com) project:

1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/20260607000000_app_kv.sql`.
3. Copy `.env.example` to `.env` and fill in:

   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

4. Restart `npm run dev` (or rebuild and deploy).

When configured, the header badge reads **LIVE** instead of **PREVIEW**, and the
**Invite** button copies a link containing a `?league=` code. Everyone who opens
that link shares the same pool. Different leagues (different codes) stay separate,
so one Supabase project can host many family pools.

> **Note:** this is a casual, link-shared game with no per-user auth. Anyone with
> a league's invite link can read and edit that league's data — that's the
> intended sharing model. Don't store anything sensitive.

### Storage fallback order

The app picks the best available backend at runtime:

| Priority | Backend          | Shared across devices? |
|----------|------------------|------------------------|
| 1        | `window.storage` (Bolt host) | yes |
| 2        | Supabase (if `.env` set)     | yes |
| 3        | `localStorage`               | no (single device)    |
| 4        | in-memory                    | no (session only)     |

---

## Project structure

```
src/
  App.tsx            # shell, nav, state orchestration, storage sync
  data/              # nations, group fixtures, types, default scoring
  utils/             # storage (layered backends), scoring, helpers
  views/             # Onboarding, MyTeam, DraftView, Leaderboard,
                     # MatchesView, Squads, Settings
  components/        # Flag, Icon, shared UI bits
supabase/migrations/ # shared key/value table for league mode
```
