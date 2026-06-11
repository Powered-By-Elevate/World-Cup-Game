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

**Remaining gap (optional):** this only fires while *someone* in the league has the app open
(usually true during live matches). For 100% coverage when *nobody* is online, add the Vercel
cron below — it would reuse the same detection idea but needs the scoring/fixtures ported to JS:

The original server-cron plan, if you want full offline coverage:
- A Vercel **cron** (e.g. every 1–2 min) that pulls the football-data feed (same source as `src/data/liveResults.ts`), diffs against last-seen fixture states, and for each league maps fixtures → the members whose drafted nations are involved (`team.picks`), then:
  - on kickoff transition → `match-start` notif/push,
  - on full-time transition → `match-result` notif/push with points gained, computed via `utils/scoring` (`computeMovers`/`teamStats`) against the league's scoring config.
- Store `lastSeenFixtureState` per league in KV so the cron is idempotent.
- For users with the app open, a lighter client-side version could fire the in-app notif directly from the existing 60s live-results poll in `App.tsx`; the cron is what covers everyone else.

## Notes
- All shared data uses the existing league-namespaced KV (`sget/sset(key, true)`) — same store as chat. Read-modify-write is fine at family-pool volume; if write contention ever matters, move challenges/matches to dedicated Supabase tables with row-level realtime.
- Keep the in-app feed (`wc:notifs`) as the canonical notification history even after push lands.
