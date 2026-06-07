/**
 * Serverless proxy for live match results (football-data.org).
 *
 * The API token is read from the FOOTBALL_DATA_TOKEN env var and never reaches
 * the browser. football-data.org also blocks direct browser calls (CORS), so
 * the front-end calls this same-origin endpoint instead.
 *
 * Returns normalized JSON the client maps to nations by their three-letter
 * abbreviation (tla). On any error it returns { source: "none", reason } with
 * HTTP 200 so the app cleanly falls back to its deterministic engine.
 *
 * Env:
 *   FOOTBALL_DATA_TOKEN        (required) personal API token
 *   FOOTBALL_DATA_COMPETITION  (optional) competition code, defaults to "WC"
 */

// Warm-instance cache to stay well under the free-tier rate limit.
let cache = { t: 0, data: null };
const TTL_MS = 30_000;

function normalize(json) {
  const matches = (json.matches || []).map((m) => ({
    id: m.id,
    stage: m.stage,            // GROUP_STAGE, LAST_16, QUARTER_FINALS, SEMI_FINALS, THIRD_PLACE, FINAL
    group: m.group || null,    // e.g. "GROUP_A"
    date: m.utcDate,
    status: m.status,          // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, ...
    home: { tla: m.homeTeam?.tla || null, name: m.homeTeam?.name || null, short: m.homeTeam?.shortName || null },
    away: { tla: m.awayTeam?.tla || null, name: m.awayTeam?.name || null, short: m.awayTeam?.shortName || null },
    hs: m.score?.fullTime?.home ?? null,
    as: m.score?.fullTime?.away ?? null,
    winner: m.score?.winner || null,        // HOME_TEAM | AWAY_TEAM | DRAW
    pens: m.score?.penalties || null,       // { home, away } when a shootout occurred
  }));
  return { source: "live", updated: Date.now(), count: matches.length, matches };
}

export default async function handler(req, res) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    res.status(200).json({ source: "none", reason: "FOOTBALL_DATA_TOKEN not set" });
    return;
  }

  const now = Date.now();
  if (cache.data && now - cache.t < TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({ ...cache.data, cached: true });
    return;
  }

  const comp = process.env.FOOTBALL_DATA_COMPETITION || "WC";
  try {
    const r = await fetch(`https://api.football-data.org/v4/competitions/${comp}/matches`, {
      headers: { "X-Auth-Token": token },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      res.status(200).json({ source: "none", reason: `http ${r.status}`, detail: body.slice(0, 300) });
      return;
    }
    const json = await r.json();
    const data = normalize(json);
    cache = { t: now, data };
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ source: "none", reason: String(e && e.message ? e.message : e) });
  }
}
