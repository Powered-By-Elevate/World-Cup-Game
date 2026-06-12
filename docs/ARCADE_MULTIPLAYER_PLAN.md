# Arcade multiplayer & notifications — plan

Status as of 2026-06-11. This tracks what shipped vs. what's intentionally deferred,
so a future session can pick up the deep infrastructure cleanly.

## Shipped (this session)
- **Arcade hub** with two sub-tabs: **Games** and **Leaderboards**.
- **Leaderboards** — per game (Penalty Streak, Soccer Stars), top 5, **one best score per person**, stored in league-shared KV (`wc:arcade:scores`) and polled. Soccer score = final goal margin; Penalty score = streak.
- **Async challenges** (`src/utils/arcade.ts`, `wc:arcade:challenges`): pick a game → **Single player** or **Multiplayer** → choose a league member. The challenger plays their leg immediately; the opponent gets a notification and an entry in their Arcade to play theirs; when both legs are in, the higher score wins and both players are notified. Incoming / outgoing / settled challenges render in the Games tab.
- **In-app notifications** (`src/utils/notify.ts`, `wc:notifs`): a league-shared, per-recipient feed driving a header **bell** + badge + panel. Wired for **challenge issued**, **challenge result**, and **chat messages** (whisper → recipient; global → everyone else). Polled every 5s like chat.

These cover the requested behaviour **for users with the app open**. The pieces below are what's needed to make it real-time and to reach users who are *not* in the app.

## Deferred — to build next

### 1. Real-time turn-based Soccer Stars
Today a Soccer Stars challenge is **asynchronous** (each player plays a solo leg vs. CPU; scores compared). True real-time turn-based play needs:
- A per-match shared doc `wc:arcade:match:<id>` holding `{ bodies, turn, score, seq }`.
- On each shot, the mover writes the resolved post-physics body state + increments `seq`; the opponent's client renders from that state and takes the next turn. Physics stays deterministic and authoritative on the mover's side (cheaper than lockstep).
- Replace the 5s poll with **Supabase Realtime** (postgres changes / broadcast channel) for this doc so turns feel live (sub-second), falling back to polling.
- Presence + a turn clock (auto-forfeit on timeout). Reconnect = re-read the doc by `seq`.

### 2. 30-second Penalty race mode
A second penalty mode distinct from streak: a 30s timer, most goals wins. Work:
- Add a `mode: 'streak' | 'race'` to `initPenaltyStreak`; in race mode show a countdown, auto-serve the next ball on resolve, count goals, end at 0s and report the goal count as the score.
- Multiplayer = both play their own 30s, compare counts (same async challenge plumbing already in place). Real-time-side-by-side is a later nicety.

### 3. Out-of-app web push (backgrounded users)
In-app notifications only fire while the app is open. For real push:
- There's already VAPID push for draft alerts: `enablePush(userId)` + the `/api/notify` endpoint (see `src/utils/storage.ts`, `draft-notifications.md`). It currently fans out to a whole league.
- Add a **targeted** mode to `/api/notify` (or a new `/api/push-user`) that takes `{ toUserId, title, body, url }`, looks up that user's stored push subscription(s), and sends. Member→account mapping exists (`member.uid`).
- Call it alongside each `pushNotifs(...)` so challenges / chat / match events also reach phones with the app closed. Keep in-app feed as the source of truth + history.

### 4. Match-start & match-result notifications — DONE (client-driven), cron still optional
**Shipped 2026-06-11** as a client-driven detector (`src/utils/matchNotify.ts`, wired in `App.tsx`):
the app's existing 60s live-feed poll reconciles fixtures against a shared `wc:matchwatch`
set, and on a kickoff (→ in-app + push "⚽ Kickoff") or full-time (→ "Full time — score · your
NATION: +N pts", points computed by diffing `teamStats` with/without that match) it fans out to
every member who drafted either nation. Deduped via `wc:matchwatch` (fires once per league across
all open clients); first run seeds silently (no backfill). Kickoff pings are gated to ±20 min of
the scheduled start so a late open doesn't ping stale ones.

### 4b. Server-side tick (offline coverage + advance reminder) — DONE 2026-06-12
The "nobody's online" gap is now closed by `api/tick.ts`, pinged every 5 min by a free
GitHub Actions cron (`.github/workflows/match-tick.yml`, public repo → free minutes). It is the
authoritative server counterpart to the client detector and **reuses the exact same pure logic** —
no port to JS. `src/data/liveResults.ts` was split into pure mappers (`mapLive`, `upcomingFromFeed`)
and `src/utils/matchNotify.ts` gained `detectUpcoming` for the "⏰ your match in ~30 min" reminder.

For every league the tick: reads `<league>:wc:state` + `<league>:wc:matchwatch`, fetches the feed via
our own `/api/results` (rides the shared cache — no extra Zafronix quota), runs
`detectMatchEvents` + `detectUpcoming`, **claims the events into `wc:matchwatch` before sending** so
a racing client/tick can't double-fire, writes the in-app feed (`<league>:wc:notifs`, canonical
history) and sends web push via the shared `api/_push.js` sender. Secret-gated by `TICK_SECRET`
(absent env → safe no-op). Client and server share the same watch/notifs keys so they run side by
side; first run per league seeds silently.

- **Advance reminder:** group/KO matches with feed status `TIMED` whose both teams are known, fired
  once in the [5 min, 30 min] window before kickoff (`REMIND_LEAD`/`REMIND_FLOOR` in matchNotify.ts).
  Parsed from the feed's ISO `kickoffUtc` via `new Date()` — NOT the ET-only `parseDate` used for the
  static fixtures.
- **One-time setup:** add a `TICK_SECRET` GitHub Actions secret AND the same value as a Vercel env
  var. Until both exist the endpoint no-ops and the cron prints a skip notice.
- **Known limitation (accepted):** the shared `wc:matchwatch` is read-modify-write; under a rare
  client/tick interleave a notification can duplicate (never silently drop). Fine at family scale.

## Notes
- All shared data uses the existing league-namespaced KV (`sget/sset(key, true)`) — same store as chat. Read-modify-write is fine at family-pool volume; if write contention ever matters, move challenges/matches to dedicated Supabase tables with row-level realtime.
- Keep the in-app feed (`wc:notifs`) as the canonical notification history even after push lands.
