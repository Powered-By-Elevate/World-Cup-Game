/**
 * Serverless proxy for live match results (Zafronix WC API).
 *
 * The API key is read from the ZAFRONIX_API_KEY env var and never reaches
 * the browser; the front-end calls this same-origin endpoint instead.
 *
 * Free-tier notes: the feed carries every 2026 fixture with kickoff times,
 * flags matches `status: "live"` while they're in progress, and fills in
 * final scores once a match finishes. In-play scores are a Pro-tier feature,
 * so a live match reports its teams but null scores until full time.
 *
 * Returns normalized JSON the client maps to nations by team NAME. On any
 * error it returns { source: "none", reason } with HTTP 200 so the app
 * cleanly falls back to its deterministic engine.
 *
 * Env:
 *   ZAFRONIX_API_KEY   (required) API key, sent as X-API-Key
 *   ZAFRONIX_YEAR      (optional) tournament year, defaults to "2026"
 */

// Warm-instance cache to stay well under the free-tier rate limit.
let cache = { t: 0, data: null };
const TTL_MS = 30_000;

// zafronix stage → the stage constants the client already understands
const STAGE = {
  r32: "LAST_32", r16: "LAST_16", qf: "QUARTER_FINALS",
  sf: "SEMI_FINALS", thirdPlace: "THIRD_PLACE", final: "FINAL",
};

function normalize(json) {
  const matches = (json.data || []).map((m) => {
    const stage = m.stage && m.stage.startsWith("group") ? "GROUP_STAGE" : (STAGE[m.stage] || m.stage);
    const done = m.homeScore != null && m.awayScore != null;
    const status = done ? "FINISHED" : m.status === "live" ? "IN_PLAY" : "TIMED";
    // penalties comes as "4-2" or { home, away } when populated
    let pens = null;
    if (m.penalties && typeof m.penalties === "object" && m.penalties.home != null) {
      pens = { home: m.penalties.home, away: m.penalties.away };
    } else if (typeof m.penalties === "string" && /^\d+-\d+$/.test(m.penalties)) {
      const [ph, pa] = m.penalties.split("-").map(Number);
      pens = { home: ph, away: pa };
    }
    return {
      id: m.id,
      stage,
      group: m.stage && m.stage.startsWith("group_") ? "GROUP_" + m.stage.slice(6).toUpperCase() : null,
      date: m.kickoffUtc || m.date,
      status,
      home: { tla: null, name: m.homeTeam || null, short: m.homeRef || null },
      away: { tla: null, name: m.awayTeam || null, short: m.awayRef || null },
      hs: m.homeScore ?? null,
      as: m.awayScore ?? null,
      winner: done ? (m.homeScore > m.awayScore ? "HOME_TEAM" : m.awayScore > m.homeScore ? "AWAY_TEAM" : "DRAW") : null,
      pens,
    };
  });
  return { source: "live", updated: Date.now(), count: matches.length, matches };
}

export default async function handler(req, res) {
  const key = process.env.ZAFRONIX_API_KEY;
  if (!key) {
    res.status(200).json({ source: "none", reason: "ZAFRONIX_API_KEY not set" });
    return;
  }

  const now = Date.now();
  if (cache.data && now - cache.t < TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({ ...cache.data, cached: true });
    return;
  }

  const year = process.env.ZAFRONIX_YEAR || "2026";
  try {
    const r = await fetch(`https://api.zafronix.com/fifa/worldcup/v1/matches?year=${year}`, {
      headers: { "X-API-Key": key },
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
