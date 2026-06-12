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
 * RATE LIMITS — the free tier allows only 250 upstream requests/day, shared
 * across all Zafronix APIs. A single browser polls this endpoint every minute
 * (~1,440/day), so a per-instance memory cache is not enough on Vercel: each
 * browser polls independently and requests fan out across cold/short-lived
 * serverless instances, so most polls would otherwise hit Zafronix live and
 * blow the quota within hours. We therefore cache the normalized feed in
 * Supabase `app_kv` (shared by ALL instances and users), so upstream call
 * volume is bounded by SHARED_TTL_MS, not by traffic. On 429 we back off and
 * keep serving the last-good payload rather than dropping to source:"none".
 *
 * Returns normalized JSON the client maps to nations by team NAME. On any
 * error with no cached data it returns { source: "none", reason } with HTTP
 * 200 so the app cleanly falls back to its deterministic engine.
 *
 * Env:
 *   ZAFRONIX_API_KEY   (required) API key, sent as X-API-Key
 *   ZAFRONIX_YEAR      (optional) tournament year, defaults to "2026"
 *   ZAFRONIX_TTL_MS    (optional) shared-cache freshness, defaults to 10 min
 *   SUPABASE_URL / SUPABASE_ANON_KEY (fall back to VITE_*) — shared cache store
 */

import { createClient } from '@supabase/supabase-js';

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const CACHE_KEY = 'wc:results:cache';

// How long a good payload is served before we ask upstream again. At 15 min a
// continuously-polled endpoint makes ~96 upstream calls/day — comfortably under
// the 250/day free tier even in a pathological 24/7 case. The free tier has no
// in-play scores anyway, so a final score appearing up to 15 min late is fine.
const SHARED_TTL_MS = Number(process.env.ZAFRONIX_TTL_MS) || 15 * 60_000;
// After a 429 (quota exhausted) wait this long before retrying upstream; keep
// serving the last-good payload meanwhile so the app stays on live data.
const BACKOFF_429_MS = 30 * 60_000;
// 429 with NO snapshot cached yet (e.g. the fix shipped after the quota was
// already blown): retry sooner so we grab the FIRST opening as the rolling 24h
// window drains and seed the cache. 10 min = ≤144 upstream attempts/day, still
// under the 250/day cap even if rejected requests count — so it can't perpetuate
// the exhaustion. Once seeded we fall back to the longer BACKOFF_429_MS.
const BACKOFF_SEED_MS = 10 * 60_000;
// After any other upstream failure, retry sooner.
const BACKOFF_ERR_MS = 2 * 60_000;
// L1: warm-instance cache in front of the shared store, to avoid a Supabase
// round-trip on every poll that lands on the same instance.
const L1_TTL_MS = 20_000;

let l1 = { t: 0, payload: null };

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

function sbClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, NOAUTH);
}

// Shared cache row shape: { good, goodAt, nextTry }
//   good    — last successful normalized payload (or null)
//   goodAt  — epoch ms it was fetched
//   nextTry — epoch ms before which we must not call upstream (backoff)
async function readShared(sb) {
  if (!sb) return null;
  try {
    const { data } = await sb.from('app_kv').select('value').eq('key', CACHE_KEY).maybeSingle();
    return data?.value || null;
  } catch { return null; }
}

async function writeShared(sb, value) {
  if (!sb) return;
  try {
    await sb.from('app_kv').upsert({ key: CACHE_KEY, value, updated_at: new Date().toISOString() });
  } catch { /* best-effort; cache is an optimization, not a source of truth */ }
}

export default async function handler(req, res) {
  const key = process.env.ZAFRONIX_API_KEY;
  if (!key) {
    res.status(200).json({ source: "none", reason: "ZAFRONIX_API_KEY not set" });
    return;
  }

  const now = Date.now();
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");

  // L1: warm-instance hit
  if (l1.payload && now - l1.t < L1_TTL_MS) {
    res.status(200).json({ ...l1.payload, cached: true });
    return;
  }

  const sb = sbClient();
  const shared = await readShared(sb);

  // L2: shared payload still fresh → serve without touching upstream
  if (shared?.good && now - shared.goodAt < SHARED_TTL_MS) {
    l1 = { t: now, payload: shared.good };
    res.status(200).json({ ...shared.good, cached: true });
    return;
  }

  // In backoff (e.g. after a 429): don't call upstream. Serve last-good if we
  // have any, otherwise tell the client to fall back.
  if (shared?.nextTry && now < shared.nextTry) {
    if (shared.good) {
      l1 = { t: now, payload: shared.good };
      res.status(200).json({ ...shared.good, cached: true, stale: true });
    } else {
      res.status(200).json({ source: "none", reason: "rate_limited_backoff" });
    }
    return;
  }

  const year = process.env.ZAFRONIX_YEAR || "2026";
  try {
    const r = await fetch(`https://api.zafronix.com/fifa/worldcup/v1/matches?year=${year}`, {
      headers: { "X-API-Key": key },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      const backoff = r.status === 429 ? (shared?.good ? BACKOFF_429_MS : BACKOFF_SEED_MS) : BACKOFF_ERR_MS;
      // Preserve last-good payload; just set the backoff window.
      await writeShared(sb, {
        good: shared?.good || null,
        goodAt: shared?.goodAt || 0,
        nextTry: now + backoff,
      });
      if (shared?.good) {
        l1 = { t: now, payload: shared.good };
        res.status(200).json({ ...shared.good, cached: true, stale: true });
      } else {
        res.status(200).json({ source: "none", reason: `http ${r.status}`, detail: body.slice(0, 300) });
      }
      return;
    }
    const json = await r.json();
    const data = normalize(json);
    l1 = { t: now, payload: data };
    await writeShared(sb, { good: data, goodAt: now, nextTry: 0 });
    res.status(200).json(data);
  } catch (e) {
    await writeShared(sb, {
      good: shared?.good || null,
      goodAt: shared?.goodAt || 0,
      nextTry: now + BACKOFF_ERR_MS,
    });
    if (shared?.good) {
      l1 = { t: now, payload: shared.good };
      res.status(200).json({ ...shared.good, cached: true, stale: true });
    } else {
      res.status(200).json({ source: "none", reason: String(e && e.message ? e.message : e) });
    }
  }
}
