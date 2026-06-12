// server/tick.ts
import { createClient } from "@supabase/supabase-js";

// api/_vapid.js
function vapidConfig() {
  const clean = (s) => (s || "").toString().trim().replace(/^['"]+|['"]+$/g, "").trim();
  const publicKey = clean(process.env.VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);
  const raw = clean(process.env.VAPID_SUBJECT);
  const email = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  let subject = /^https:\/\/\S+$/i.test(raw) ? raw : email ? `mailto:${email[0]}` : "";
  if (!subject) subject = "mailto:mknowles@true-north-companies.com";
  const messy = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].filter((k) => {
    const v = process.env[k];
    return v != null && v !== clean(v);
  });
  return { publicKey, privateKey, subject, subjectEnvSet: !!process.env.VAPID_SUBJECT, messy };
}

// api/_push.js
import webpush from "web-push";
var host = (ep) => {
  try {
    return new URL(ep).hostname;
  } catch {
    return "?";
  }
};
function configurePush(vapid) {
  if (!vapid?.publicKey || !vapid?.privateKey) return false;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return true;
}
async function leaguePushList(sb, league) {
  const { data } = await sb.from("app_kv").select("value").eq("key", `${league}:wc:push`).maybeSingle();
  return Array.isArray(data?.value) ? data.value : [];
}
async function sendToUser(sb, uid2, league, legacy, payload) {
  const { data: urow } = await sb.from("app_kv").select("value").eq("key", `user:${uid2}:push`).maybeSingle();
  const userSubs = Array.isArray(urow?.value) ? urow.value : [];
  const targets = /* @__PURE__ */ new Map();
  for (const e of legacy || []) if (e?.uid === uid2 && e?.sub?.endpoint) targets.set(e.sub.endpoint, e.sub);
  for (const s of userSubs) if (s?.endpoint) targets.set(s.endpoint, s);
  if (!targets.size) return { pushed: 0, matched: 0, failures: [] };
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || "/" });
  let pushed = 0;
  const failures = [];
  const dead = /* @__PURE__ */ new Set();
  for (const [endpoint, sub] of targets) {
    try {
      await webpush.sendNotification(sub, body);
      pushed++;
    } catch (e) {
      failures.push({ host: host(endpoint), code: e?.statusCode || 0, msg: (e?.body || e?.message || "").toString().slice(0, 160) });
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.add(endpoint);
    }
  }
  if (dead.size) {
    if (legacy && legacy.length) {
      const liveLeague = legacy.filter((e) => !dead.has(e?.sub?.endpoint));
      if (liveLeague.length !== legacy.length) {
        await sb.from("app_kv").upsert({ key: `${league}:wc:push`, value: liveLeague, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
      }
    }
    const liveUser = userSubs.filter((s) => !dead.has(s?.endpoint));
    if (liveUser.length !== userSubs.length) {
      await sb.from("app_kv").upsert({ key: `user:${uid2}:push`, value: liveUser, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    }
  }
  try {
    const entry = { ts: (/* @__PURE__ */ new Date()).toISOString(), league, matched: targets.size, pushed, failures, via: "tick" };
    const { data: lrow } = await sb.from("app_kv").select("value").eq("key", `user:${uid2}:pushlog`).maybeSingle();
    const log = Array.isArray(lrow?.value) ? lrow.value : [];
    log.unshift(entry);
    await sb.from("app_kv").upsert({ key: `user:${uid2}:pushlog`, value: log.slice(0, 5), updated_at: (/* @__PURE__ */ new Date()).toISOString() });
  } catch {
  }
  return { pushed, matched: targets.size, failures };
}

// src/data/fixtures.ts
var MATCHES = [
  { i: "g1", d: "2026-06-11T15:00", g: "A", h: "MEX", a: "RSA", c: "Mexico City" },
  { i: "g2", d: "2026-06-11T22:00", g: "A", h: "KOR", a: "CZE", c: "Guadalajara" },
  { i: "g3", d: "2026-06-12T15:00", g: "B", h: "CAN", a: "BIH", c: "Toronto" },
  { i: "g4", d: "2026-06-12T21:00", g: "D", h: "USA", a: "PAR", c: "Los Angeles" },
  { i: "g5", d: "2026-06-13T15:00", g: "C", h: "BRA", a: "MAR", c: "New York / NJ" },
  { i: "g6", d: "2026-06-13T18:00", g: "D", h: "AUS", a: "TUR", c: "Vancouver" },
  { i: "g7", d: "2026-06-13T21:00", g: "C", h: "HAI", a: "SCO", c: "Boston" },
  { i: "g8", d: "2026-06-14T00:00", g: "B", h: "QAT", a: "SUI", c: "SF Bay Area" },
  { i: "g9", d: "2026-06-14T13:00", g: "E", h: "GER", a: "CUW", c: "Houston" },
  { i: "g10", d: "2026-06-14T16:00", g: "E", h: "CIV", a: "ECU", c: "Philadelphia" },
  { i: "g11", d: "2026-06-14T19:00", g: "F", h: "NED", a: "JPN", c: "Dallas" },
  { i: "g12", d: "2026-06-14T22:00", g: "F", h: "SWE", a: "TUN", c: "Monterrey" },
  { i: "g13", d: "2026-06-15T12:00", g: "H", h: "ESP", a: "CPV", c: "Atlanta" },
  { i: "g14", d: "2026-06-15T15:00", g: "G", h: "BEL", a: "EGY", c: "Seattle" },
  { i: "g15", d: "2026-06-15T18:00", g: "H", h: "KSA", a: "URU", c: "Miami" },
  { i: "g16", d: "2026-06-15T21:00", g: "G", h: "IRN", a: "NZL", c: "Los Angeles" },
  { i: "g17", d: "2026-06-16T15:00", g: "I", h: "FRA", a: "SEN", c: "New York / NJ" },
  { i: "g18", d: "2026-06-16T18:00", g: "I", h: "IRQ", a: "NOR", c: "Boston" },
  { i: "g19", d: "2026-06-16T21:00", g: "J", h: "ARG", a: "ALG", c: "Kansas City" },
  { i: "g20", d: "2026-06-17T00:00", g: "J", h: "AUT", a: "JOR", c: "SF Bay Area" },
  { i: "g21", d: "2026-06-17T13:00", g: "K", h: "POR", a: "COD", c: "Houston" },
  { i: "g22", d: "2026-06-17T16:00", g: "L", h: "ENG", a: "CRO", c: "Dallas" },
  { i: "g23", d: "2026-06-17T19:00", g: "L", h: "GHA", a: "PAN", c: "Toronto" },
  { i: "g24", d: "2026-06-17T22:00", g: "K", h: "UZB", a: "COL", c: "Mexico City" },
  { i: "g25", d: "2026-06-18T12:00", g: "A", h: "CZE", a: "RSA", c: "Atlanta" },
  { i: "g26", d: "2026-06-18T15:00", g: "B", h: "SUI", a: "BIH", c: "Los Angeles" },
  { i: "g27", d: "2026-06-18T18:00", g: "B", h: "CAN", a: "QAT", c: "Vancouver" },
  { i: "g28", d: "2026-06-18T21:00", g: "A", h: "MEX", a: "KOR", c: "Guadalajara" },
  { i: "g29", d: "2026-06-19T15:00", g: "D", h: "USA", a: "AUS", c: "Seattle" },
  { i: "g30", d: "2026-06-19T18:00", g: "C", h: "SCO", a: "MAR", c: "Boston" },
  { i: "g31", d: "2026-06-19T21:00", g: "C", h: "BRA", a: "HAI", c: "Philadelphia" },
  { i: "g32", d: "2026-06-20T00:00", g: "D", h: "TUR", a: "PAR", c: "SF Bay Area" },
  { i: "g33", d: "2026-06-20T13:00", g: "F", h: "NED", a: "SWE", c: "Houston" },
  { i: "g34", d: "2026-06-20T16:00", g: "E", h: "GER", a: "CIV", c: "Toronto" },
  { i: "g35", d: "2026-06-20T20:00", g: "E", h: "ECU", a: "CUW", c: "Kansas City" },
  { i: "g36", d: "2026-06-21T00:00", g: "F", h: "TUN", a: "JPN", c: "Monterrey" },
  { i: "g37", d: "2026-06-21T12:00", g: "H", h: "ESP", a: "KSA", c: "Atlanta" },
  { i: "g38", d: "2026-06-21T15:00", g: "G", h: "BEL", a: "IRN", c: "Los Angeles" },
  { i: "g39", d: "2026-06-21T18:00", g: "H", h: "URU", a: "CPV", c: "Miami" },
  { i: "g40", d: "2026-06-21T21:00", g: "G", h: "NZL", a: "EGY", c: "Vancouver" },
  { i: "g41", d: "2026-06-22T13:00", g: "J", h: "ARG", a: "AUT", c: "Dallas" },
  { i: "g42", d: "2026-06-22T17:00", g: "I", h: "FRA", a: "IRQ", c: "Philadelphia" },
  { i: "g43", d: "2026-06-22T20:00", g: "I", h: "NOR", a: "SEN", c: "New York / NJ" },
  { i: "g44", d: "2026-06-22T23:00", g: "J", h: "JOR", a: "ALG", c: "SF Bay Area" },
  { i: "g45", d: "2026-06-23T13:00", g: "K", h: "POR", a: "UZB", c: "Houston" },
  { i: "g46", d: "2026-06-23T16:00", g: "L", h: "ENG", a: "GHA", c: "Boston" },
  { i: "g47", d: "2026-06-23T19:00", g: "L", h: "PAN", a: "CRO", c: "Toronto" },
  { i: "g48", d: "2026-06-23T22:00", g: "K", h: "COL", a: "COD", c: "Guadalajara" },
  { i: "g49", d: "2026-06-24T15:00", g: "B", h: "CAN", a: "SUI", c: "Vancouver" },
  { i: "g50", d: "2026-06-24T15:00", g: "B", h: "BIH", a: "QAT", c: "Seattle" },
  { i: "g51", d: "2026-06-24T18:00", g: "C", h: "SCO", a: "BRA", c: "Miami" },
  { i: "g52", d: "2026-06-24T18:00", g: "C", h: "MAR", a: "HAI", c: "Atlanta" },
  { i: "g53", d: "2026-06-24T21:00", g: "A", h: "MEX", a: "CZE", c: "Mexico City" },
  { i: "g54", d: "2026-06-24T21:00", g: "A", h: "KOR", a: "RSA", c: "Monterrey" },
  { i: "g55", d: "2026-06-25T16:00", g: "E", h: "ECU", a: "GER", c: "New York / NJ" },
  { i: "g56", d: "2026-06-25T16:00", g: "E", h: "CUW", a: "CIV", c: "Philadelphia" },
  { i: "g57", d: "2026-06-25T19:00", g: "F", h: "TUN", a: "NED", c: "Kansas City" },
  { i: "g58", d: "2026-06-25T19:00", g: "F", h: "JPN", a: "SWE", c: "Dallas" },
  { i: "g59", d: "2026-06-25T22:00", g: "D", h: "USA", a: "TUR", c: "Los Angeles" },
  { i: "g60", d: "2026-06-25T22:00", g: "D", h: "PAR", a: "AUS", c: "SF Bay Area" },
  { i: "g61", d: "2026-06-26T15:00", g: "I", h: "NOR", a: "FRA", c: "Boston" },
  { i: "g62", d: "2026-06-26T15:00", g: "I", h: "SEN", a: "IRQ", c: "Toronto" },
  { i: "g63", d: "2026-06-26T20:00", g: "G", h: "NZL", a: "BEL", c: "Vancouver" },
  { i: "g64", d: "2026-06-26T20:00", g: "G", h: "EGY", a: "IRN", c: "Seattle" },
  { i: "g65", d: "2026-06-26T23:00", g: "H", h: "URU", a: "ESP", c: "Guadalajara" },
  { i: "g66", d: "2026-06-26T23:00", g: "H", h: "CPV", a: "KSA", c: "Houston" },
  { i: "g67", d: "2026-06-27T17:00", g: "L", h: "PAN", a: "ENG", c: "New York / NJ" },
  { i: "g68", d: "2026-06-27T17:00", g: "L", h: "CRO", a: "GHA", c: "Philadelphia" },
  { i: "g69", d: "2026-06-27T19:30", g: "K", h: "COL", a: "POR", c: "Miami" },
  { i: "g70", d: "2026-06-27T19:30", g: "K", h: "COD", a: "UZB", c: "Atlanta" },
  { i: "g71", d: "2026-06-27T22:00", g: "J", h: "JOR", a: "ARG", c: "Dallas" },
  { i: "g72", d: "2026-06-27T22:00", g: "J", h: "ALG", a: "AUT", c: "Kansas City" }
];
var GROUP_MATCHES_OF = {};
MATCHES.forEach((m) => {
  (GROUP_MATCHES_OF[m.h] ||= []).push(m);
  (GROUP_MATCHES_OF[m.a] ||= []).push(m);
});
var MATCH_DATE = Object.fromEntries(
  MATCHES.map((m) => [m.i, m.d.slice(0, 10)])
);
var KO_ROUNDS = [
  { id: "R32", label: "Round of 32", when: "Jun 28 - Jul 3" },
  { id: "R16", label: "Round of 16", when: "Jul 4 - 7" },
  { id: "QF", label: "Quarterfinals", when: "Jul 9 - 11" },
  { id: "SF", label: "Semifinals", when: "Jul 14 - 15" },
  { id: "3rd", label: "Third place", when: "Jul 18" },
  { id: "Final", label: "Final", when: "Jul 19" }
];
var KO_LABEL = Object.fromEntries(
  KO_ROUNDS.map((r) => [r.id, r.label])
);
var MILESTONE_ORDER = ["R32", "R16", "QF", "SF", "Final"];

// src/data/nations.ts
var NATIONS = [
  // Favorites
  { id: "ESP", name: "Spain", flag: "es", pot: "FAV", c1: "#C60B1E", c2: "#FFC400" },
  { id: "ARG", name: "Argentina", flag: "ar", pot: "FAV", c1: "#75AADB", c2: "#0E3C7A" },
  { id: "FRA", name: "France", flag: "fr", pot: "FAV", c1: "#0055A4", c2: "#EF4135" },
  { id: "ENG", name: "England", flag: "gb-eng", pot: "FAV", c1: "#CF142B", c2: "#0A2342" },
  { id: "BRA", name: "Brazil", flag: "br", pot: "FAV", c1: "#009C3B", c2: "#FFDF00" },
  { id: "POR", name: "Portugal", flag: "pt", pot: "FAV", c1: "#006600", c2: "#FF0000" },
  { id: "NED", name: "Netherlands", flag: "nl", pot: "FAV", c1: "#FF6900", c2: "#21468B" },
  { id: "GER", name: "Germany", flag: "de", pot: "FAV", c1: "#DD0000", c2: "#111111" },
  { id: "BEL", name: "Belgium", flag: "be", pot: "FAV", c1: "#C8102E", c2: "#FDDA24" },
  { id: "CRO", name: "Croatia", flag: "hr", pot: "FAV", c1: "#FF0000", c2: "#0F1FA0" },
  { id: "MAR", name: "Morocco", flag: "ma", pot: "FAV", c1: "#C1272D", c2: "#006233" },
  { id: "URU", name: "Uruguay", flag: "uy", pot: "FAV", c1: "#0038A8", c2: "#FCD116" },
  { id: "COL", name: "Colombia", flag: "co", pot: "FAV", c1: "#FCD116", c2: "#003893" },
  { id: "SUI", name: "Switzerland", flag: "ch", pot: "FAV", c1: "#D52B1E", c2: "#AB1A12" },
  { id: "JPN", name: "Japan", flag: "jp", pot: "FAV", c1: "#BC002D", c2: "#101010" },
  { id: "USA", name: "USA", flag: "us", pot: "FAV", c1: "#3C3B6E", c2: "#B22234" },
  // Underdogs
  { id: "MEX", name: "Mexico", flag: "mx", pot: "UND", c1: "#006847", c2: "#CE1126" },
  { id: "SEN", name: "Senegal", flag: "sn", pot: "UND", c1: "#00853F", c2: "#E31B23" },
  { id: "ECU", name: "Ecuador", flag: "ec", pot: "UND", c1: "#FFD100", c2: "#034EA2" },
  { id: "NOR", name: "Norway", flag: "no", pot: "UND", c1: "#BA0C2F", c2: "#00205B" },
  { id: "AUS", name: "Australia", flag: "au", pot: "UND", c1: "#00843D", c2: "#FFCD00" },
  { id: "KOR", name: "South Korea", flag: "kr", pot: "UND", c1: "#003478", c2: "#C60C30" },
  { id: "AUT", name: "Austria", flag: "at", pot: "UND", c1: "#ED2939", c2: "#B71C2B" },
  { id: "CIV", name: "Ivory Coast", flag: "ci", pot: "UND", c1: "#FF8200", c2: "#009E60" },
  { id: "EGY", name: "Egypt", flag: "eg", pot: "UND", c1: "#CE1126", c2: "#1A1A1A" },
  { id: "SWE", name: "Sweden", flag: "se", pot: "UND", c1: "#006AA7", c2: "#FECC02" },
  { id: "TUR", name: "Turkiye", flag: "tr", pot: "UND", c1: "#E30A17", c2: "#B00710" },
  { id: "SCO", name: "Scotland", flag: "gb-sct", pot: "UND", c1: "#0065BF", c2: "#0A3B73" },
  { id: "IRN", name: "Iran", flag: "ir", pot: "UND", c1: "#239F40", c2: "#DA0000" },
  { id: "PAR", name: "Paraguay", flag: "py", pot: "UND", c1: "#D52B1E", c2: "#0038A8" },
  { id: "PAN", name: "Panama", flag: "pa", pot: "UND", c1: "#DA121A", c2: "#005293" },
  { id: "CAN", name: "Canada", flag: "ca", pot: "UND", c1: "#FF0000", c2: "#8B0000" },
  // Longshots
  { id: "CZE", name: "Czechia", flag: "cz", pot: "LNG", c1: "#11457E", c2: "#D7141A" },
  { id: "QAT", name: "Qatar", flag: "qa", pot: "LNG", c1: "#8A1538", c2: "#5E0E26" },
  { id: "BIH", name: "Bosnia & Herz.", flag: "ba", pot: "LNG", c1: "#002395", c2: "#FECB00" },
  { id: "TUN", name: "Tunisia", flag: "tn", pot: "LNG", c1: "#E70013", c2: "#B00010" },
  { id: "ALG", name: "Algeria", flag: "dz", pot: "LNG", c1: "#006233", c2: "#D21034" },
  { id: "KSA", name: "Saudi Arabia", flag: "sa", pot: "LNG", c1: "#006C35", c2: "#00502A" },
  { id: "RSA", name: "South Africa", flag: "za", pot: "LNG", c1: "#007749", c2: "#FFB81C" },
  { id: "NZL", name: "New Zealand", flag: "nz", pot: "LNG", c1: "#00247D", c2: "#CC142B" },
  { id: "COD", name: "DR Congo", flag: "cd", pot: "LNG", c1: "#007FFF", c2: "#CE1021" },
  { id: "UZB", name: "Uzbekistan", flag: "uz", pot: "LNG", c1: "#1EB53A", c2: "#0099B5" },
  { id: "JOR", name: "Jordan", flag: "jo", pot: "LNG", c1: "#007A3D", c2: "#CE1126" },
  { id: "CPV", name: "Cape Verde", flag: "cv", pot: "LNG", c1: "#003893", c2: "#F7D116" },
  { id: "IRQ", name: "Iraq", flag: "iq", pot: "LNG", c1: "#CE1126", c2: "#007A3B" },
  { id: "GHA", name: "Ghana", flag: "gh", pot: "LNG", c1: "#006B3F", c2: "#FCD116" },
  { id: "HAI", name: "Haiti", flag: "ht", pot: "LNG", c1: "#00209F", c2: "#D21034" },
  { id: "CUW", name: "Curacao", flag: "cw", pot: "LNG", c1: "#002B7F", c2: "#F9E814" }
];
var NATION = Object.fromEntries(NATIONS.map((n) => [n.id, n]));
var POT_KEYS = ["FAV", "UND", "LNG"];

// src/data/liveResults.ts
var NAME_TO_ID = Object.fromEntries(NATIONS.map((n) => [n.name, n.id]));
var ALIAS = {
  "Korea Republic": "KOR",
  "IR Iran": "IRN",
  "C\xF4te d'Ivoire": "CIV",
  "Cote d'Ivoire": "CIV",
  "T\xFCrkiye": "TUR",
  "Turkey": "TUR",
  "Bosnia and Herzegovina": "BIH",
  "Congo DR": "COD",
  "DR Congo": "COD",
  "Congo": "COD",
  "Cabo Verde": "CPV",
  "Cura\xE7ao": "CUW",
  "United States": "USA",
  "Czech Republic": "CZE",
  // legacy tla aliases (harmless if the feed ever sends codes again)
  URY: "URU"
};
function toId(name) {
  if (!name) return null;
  const id = NAME_TO_ID[name] || ALIAS[name] || (NATION[name] ? name : null);
  return id && NATION[id] ? id : null;
}
var STAGE_ROUND = {
  LAST_32: "R32",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  THIRD_PLACE: "3rd",
  FINAL: "Final"
};
var PAIR = {};
for (const m of MATCHES) PAIR[[m.h, m.a].sort().join("|")] = { mi: m.i, home: m.h };
function statusOf(s) {
  if (s === "FINISHED" || s === "AWARDED") return "ft";
  if (s === "IN_PLAY" || s === "PAUSED" || s === "LIVE" || s === "SUSPENDED") return "live";
  return null;
}
function mapLive(matches) {
  const scores = {};
  const ko = [];
  const liveNow = [];
  for (const m of matches) {
    const h = toId(m.home?.name ?? m.home?.tla);
    const a = toId(m.away?.name ?? m.away?.tla);
    if (m.stage === "GROUP_STAGE") {
      const st2 = statusOf(m.status);
      if (!st2 || !h || !a) continue;
      const f = PAIR[[h, a].sort().join("|")];
      if (st2 === "live") liveNow.push({ mi: f?.mi || null, round: null, h, a, date: m.date || "" });
      if (m.hs == null || m.as == null || !f) continue;
      scores[f.mi] = f.home === h ? { h: m.hs, a: m.as, st: st2 } : { h: m.as, a: m.hs, st: st2 };
      continue;
    }
    const round = STAGE_ROUND[m.stage];
    if (!round || !h || !a) continue;
    const st = statusOf(m.status);
    if (st === "live") liveNow.push({ mi: null, round, h, a, date: m.date || "" });
    const done = !!st && m.hs != null && m.as != null;
    let pk = null;
    if (m.pens && m.pens.home != null && m.pens.away != null) {
      pk = m.pens.home > m.pens.away ? h : a;
    } else if (done && m.hs === m.as && m.winner) {
      pk = m.winner === "HOME_TEAM" ? h : m.winner === "AWAY_TEAM" ? a : null;
    }
    ko.push({
      id: "api_" + m.id,
      round,
      h,
      a,
      h_s: done ? m.hs : null,
      a_s: done ? m.as : null,
      st: st || "sched",
      pk,
      d: (m.date || "").slice(0, 10)
    });
  }
  return { scores, ko, liveNow };
}
function upcomingFromFeed(matches) {
  const out = [];
  for (const m of matches) {
    if (m.status !== "TIMED" || !m.date) continue;
    const h = toId(m.home?.name ?? m.home?.tla);
    const a = toId(m.away?.name ?? m.away?.tla);
    if (!h || !a) continue;
    if (m.stage === "GROUP_STAGE") {
      const f = PAIR[[h, a].sort().join("|")];
      out.push({ key: `g:${f?.mi || m.id}`, h, a, kickoff: m.date, knockout: false });
    } else if (STAGE_ROUND[m.stage]) {
      out.push({ key: `k:api_${m.id}`, h, a, kickoff: m.date, knockout: true });
    }
  }
  return out;
}

// src/utils/helpers.ts
var uid = () => Math.random().toString(36).slice(2, 9);
var parseDate = (d) => /* @__PURE__ */ new Date(d + ":00-04:00");

// src/utils/scoring.ts
var STAGE_MATCH_COUNT = {
  Group: MATCHES.length,
  R32: 16,
  R16: 8,
  QF: 4,
  SF: 2,
  Final: 1
};
function koStage(round) {
  return round === "3rd" ? "Final" : round;
}
function nationStats(nid, scores, ko, scoring) {
  const st = {
    pts: 0,
    gf: 0,
    ga: 0,
    w: 0,
    d: 0,
    l: 0,
    played: 0,
    bonus: 0,
    games: [],
    champ: false,
    deepest: -1,
    total: 0,
    byStage: {}
  };
  const addStage = (stage, pts) => {
    if (pts) st.byStage[stage] = (st.byStage[stage] || 0) + pts;
  };
  (GROUP_MATCHES_OF[nid] || []).forEach((m) => {
    const s = scores[m.i];
    const counted = s && (s.st === "ft" || s.st === "live") && s.h != null && s.a != null;
    const isHome = m.h === nid;
    if (!counted) {
      st.games.push({ m, isHome, upcoming: true });
      return;
    }
    const gf = isHome ? s.h : s.a;
    const ga = isHome ? s.a : s.h;
    st.gf += gf;
    st.ga += ga;
    st.played++;
    let r;
    if (gf > ga) {
      r = "W";
      st.w++;
      st.pts += scoring.win;
      addStage("Group", scoring.win);
    } else if (gf === ga) {
      r = "D";
      st.d++;
      st.pts += scoring.draw;
      addStage("Group", scoring.draw);
    } else {
      r = "L";
      st.l++;
    }
    st.games.push({ m, isHome, gf, ga, r, live: s.st === "live" });
  });
  ko.forEach((k) => {
    if (k.h !== nid && k.a !== nid) return;
    const mi = MILESTONE_ORDER.indexOf(k.round === "3rd" ? "SF" : k.round);
    if (mi > st.deepest) st.deepest = mi;
    const counted = (k.st === "ft" || k.st === "live") && k.h_s != null && k.a_s != null;
    const isHome = k.h === nid;
    if (!counted) {
      st.games.push({ ko: k, isHome, upcoming: true });
      return;
    }
    const gf = isHome ? k.h_s : k.a_s;
    const ga = isHome ? k.a_s : k.h_s;
    st.gf += gf;
    st.ga += ga;
    st.played++;
    const stage = koStage(k.round);
    let r;
    if (gf > ga) {
      r = "W";
      st.w++;
      st.pts += scoring.win;
      addStage(stage, scoring.win);
    } else if (gf < ga) {
      r = "L";
      st.l++;
    } else {
      if (k.pk === nid) {
        r = "W(p)";
        st.w++;
        st.pts += scoring.win;
        addStage(stage, scoring.win);
      } else if (k.pk) {
        r = "L(p)";
        st.l++;
      } else {
        r = "D";
        st.d++;
        st.pts += scoring.draw;
        addStage(stage, scoring.draw);
      }
    }
    if (k.round === "Final" && (k.pk === nid || k.pk == null && gf > ga)) st.champ = true;
    st.games.push({ ko: k, isHome, gf, ga, r, live: k.st === "live", round: k.round });
  });
  if (scoring.bonuses) {
    for (let i = 0; i <= st.deepest; i++) {
      const b = scoring.b[MILESTONE_ORDER[i]] || 0;
      st.bonus += b;
      addStage(MILESTONE_ORDER[i], b);
    }
    if (st.champ) {
      st.bonus += scoring.b.CHAMP || 0;
      addStage("Final", scoring.b.CHAMP || 0);
    }
  }
  st.total = st.pts + st.bonus;
  return st;
}
function teamStats(team, scores, ko, scoring) {
  const per = {};
  let pts = 0, gf = 0, ga = 0, bonus = 0, played = 0, w = 0, d = 0, l = 0;
  const byStage = {};
  POT_KEYS.forEach((pk) => {
    const nid = team.picks?.[pk];
    if (!nid) return;
    const ns = nationStats(nid, scores, ko, scoring);
    per[pk] = ns;
    pts += ns.pts;
    gf += ns.gf;
    ga += ns.ga;
    bonus += ns.bonus;
    played += ns.played;
    w += ns.w;
    d += ns.d;
    l += ns.l;
    for (const [stage, v] of Object.entries(ns.byStage)) byStage[stage] = (byStage[stage] || 0) + v;
  });
  const total = pts + bonus;
  return { per, pts, bonus, total, gf, ga, gd: gf - ga, played, w, d, l, byStage };
}

// src/utils/matchNotify.ts
var nm = (id) => NATION[id]?.name || id;
var START_WINDOW = 20 * 60 * 1e3;
var signed = (n) => n > 0 ? `+${n}` : `${n}`;
var picksOf = (t) => Object.values(t.picks || {});
function holders(teams, h, a) {
  const out = [];
  for (const t of teams) {
    const p = picksOf(t);
    const nid = p.includes(h) ? h : p.includes(a) ? a : null;
    if (!nid) continue;
    for (const mem of t.members || []) out.push({ memberId: mem.id, name: mem.name, team: t, nid });
  }
  return out;
}
function pointsForGroup(team, matchId, scores, ko, scoring) {
  const now = teamStats(team, scores, ko, scoring).total;
  const s2 = { ...scores };
  if (s2[matchId]) s2[matchId] = { ...s2[matchId], st: "sched" };
  return now - teamStats(team, s2, ko, scoring).total;
}
function pointsForKo(team, k, scores, ko, scoring) {
  const now = teamStats(team, scores, ko, scoring).total;
  const ko2 = ko.map((x) => x === k ? { ...x, st: "sched" } : x);
  return now - teamStats(team, scores, ko2, scoring).total;
}
function detectMatchEvents(teams, scores, ko, scoring, watch, now = Date.now()) {
  const fresh = watch == null;
  const w = { ...watch || {} };
  const events = [];
  const startEvent = (key, h, a, when, knockout) => {
    if (w[key]) return;
    w[key] = now;
    const recent = when ? now - parseDate(when).getTime() < START_WINDOW : false;
    if (fresh || !recent) return;
    const rec = holders(teams, h, a);
    if (!rec.length) return;
    events.push({
      key,
      kind: "start",
      title: `\u26BD Kickoff \u2014 ${nm(h)} vs ${nm(a)}`,
      recipients: rec.map((r) => ({ memberId: r.memberId, name: r.name, body: `Your ${nm(r.nid)} is playing${knockout ? " a knockout" : ""} now. ${nm(h)} vs ${nm(a)}.` }))
    });
  };
  for (const m of MATCHES) {
    const s = scores[m.i];
    if (!s) continue;
    if (s.st === "live" || s.st === "ft") startEvent(`g:${m.i}:start`, m.h, m.a, MATCH_DATE[m.i], false);
    if (s.st === "ft" && s.h != null && s.a != null) {
      const key = `g:${m.i}:result`;
      if (!w[key]) {
        w[key] = now;
        const rec = fresh ? [] : holders(teams, m.h, m.a);
        if (rec.length) events.push({
          key,
          kind: "result",
          title: `Full time \u2014 ${nm(m.h)} ${s.h}\u2013${s.a} ${nm(m.a)}`,
          recipients: rec.map((r) => ({
            memberId: r.memberId,
            name: r.name,
            body: `${nm(m.h)} ${s.h}\u2013${s.a} ${nm(m.a)} \xB7 your ${nm(r.nid)}: ${signed(pointsForGroup(r.team, m.i, scores, ko, scoring))} pts`
          }))
        });
      }
    }
  }
  for (const k of ko || []) {
    const base = `k:${k.id}`;
    if (k.st === "live" || k.st === "ft") startEvent(`${base}:start`, k.h, k.a, k.d, true);
    if (k.st === "ft" && k.h_s != null && k.a_s != null) {
      const key = `${base}:result`;
      if (!w[key]) {
        w[key] = now;
        const rec = fresh ? [] : holders(teams, k.h, k.a);
        if (rec.length) events.push({
          key,
          kind: "result",
          title: `Full time \u2014 ${nm(k.h)} ${k.h_s}\u2013${k.a_s} ${nm(k.a)}`,
          recipients: rec.map((r) => ({
            memberId: r.memberId,
            name: r.name,
            body: `${nm(k.h)} ${k.h_s}\u2013${k.a_s} ${nm(k.a)} \xB7 your ${nm(r.nid)}: ${signed(pointsForKo(r.team, k, scores, ko, scoring))} pts`
          }))
        });
      }
    }
  }
  return { events, watch: w };
}
var REMIND_LEAD = 30 * 60 * 1e3;
var REMIND_FLOOR = 5 * 60 * 1e3;
function detectUpcoming(teams, upcoming, watch, now = Date.now(), leadMs = REMIND_LEAD) {
  const fresh = watch == null;
  const w = { ...watch || {} };
  const events = [];
  for (const u of upcoming) {
    const key = `${u.key}:soon`;
    if (w[key]) continue;
    const remain = new Date(u.kickoff).getTime() - now;
    if (!Number.isFinite(remain) || remain <= 0 || remain > leadMs) continue;
    w[key] = now;
    if (fresh || remain < REMIND_FLOOR) continue;
    const rec = holders(teams, u.h, u.a);
    if (!rec.length) continue;
    const mins = Math.max(5, Math.round(remain / 6e4 / 5) * 5);
    events.push({
      key,
      kind: "soon",
      title: `\u23F0 ${nm(u.h)} vs ${nm(u.a)} soon`,
      recipients: rec.map((r) => ({
        memberId: r.memberId,
        name: r.name,
        body: `Your ${nm(r.nid)} plays${u.knockout ? " a knockout" : ""} in about ${mins} minutes. ${nm(u.h)} vs ${nm(u.a)}.`
      }))
    });
  }
  return { events, watch: w };
}

// src/data/types.ts
var DEFAULT_SCORING = {
  win: 3,
  draw: 1,
  bonuses: true,
  b: { R32: 2, R16: 4, QF: 6, SF: 8, Final: 10, CHAMP: 15 }
};

// server/tick.ts
var NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };
var CAP = 200;
var kindOf = (k) => k === "start" ? "match-start" : k === "result" ? "match-result" : "match-soon";
async function handler(req, res) {
  const secret = process.env.TICK_SECRET;
  if (!secret) {
    res.status(200).json({ ok: false, error: "not_configured" });
    return;
  }
  const authh = req.headers.authorization || "";
  const qk = req.query?.key;
  const provided = (authh.startsWith("Bearer ") ? authh.slice(7).trim() : "") || (Array.isArray(qk) ? qk[0] : qk) || "";
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    res.status(200).json({ ok: false, error: "no_supabase" });
    return;
  }
  const sb = createClient(url, anonKey, NOAUTH);
  const pushOn = configurePush(vapidConfig());
  const base = process.env.PUBLIC_BASE_URL || (req.headers.host ? `https://${req.headers.host}` : "");
  let matches = [];
  try {
    const r = await fetch(`${base}/api/results`, { headers: { accept: "application/json" } });
    const j = await r.json();
    if (j?.source === "live" && Array.isArray(j.matches)) matches = j.matches;
  } catch (e) {
    res.status(200).json({ ok: false, error: "feed_error", detail: String(e?.message || e) });
    return;
  }
  if (!matches.length) {
    res.status(200).json({ ok: true, leagues: 0, note: "no live feed" });
    return;
  }
  const live = mapLive(matches);
  const upcoming = upcomingFromFeed(matches);
  const now = Date.now();
  const { data: rows, error } = await sb.from("app_kv").select("key,value").like("key", "%:wc:state");
  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }
  const report = [];
  for (const row of rows || []) {
    const league = String(row.key).replace(/:wc:state$/, "");
    const state = row.value || null;
    if (!state || !state.draftDone || !Array.isArray(state.teams) || !state.teams.length) continue;
    const teams = state.teams;
    const scoring = state.scoring || DEFAULT_SCORING;
    const { data: wrow } = await sb.from("app_kv").select("value").eq("key", `${league}:wc:matchwatch`).maybeSingle();
    const watch = wrow?.value && typeof wrow.value === "object" ? wrow.value : null;
    const r1 = detectMatchEvents(teams, live.scores, live.ko, scoring, watch, now);
    const r2 = detectUpcoming(teams, upcoming, r1.watch, now);
    const events = [...r1.events, ...r2.events];
    if (JSON.stringify(r2.watch) !== JSON.stringify(watch || {})) {
      await sb.from("app_kv").upsert({ key: `${league}:wc:matchwatch`, value: r2.watch, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    }
    if (!events.length) continue;
    const link = `${base}/?league=${league}`;
    const adds = events.flatMap((ev) => ev.recipients.map((rcp) => ({
      id: uid(),
      to: rcp.memberId,
      kind: kindOf(ev.kind),
      title: ev.title,
      body: rcp.body,
      ts: now,
      read: false
    })));
    if (adds.length) {
      const { data: nrow } = await sb.from("app_kv").select("value").eq("key", `${league}:wc:notifs`).maybeSingle();
      const cur = Array.isArray(nrow?.value) ? nrow.value : [];
      await sb.from("app_kv").upsert({ key: `${league}:wc:notifs`, value: [...cur, ...adds].slice(-CAP), updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    }
    let pushed = 0;
    if (pushOn) {
      const memberUid = /* @__PURE__ */ new Map();
      for (const t of teams) for (const m of t.members || []) if (m?.id && m?.uid) memberUid.set(m.id, m.uid);
      const legacy = await leaguePushList(sb, league);
      for (const ev of events) for (const rcp of ev.recipients) {
        const targetUid = memberUid.get(rcp.memberId);
        if (!targetUid) continue;
        const r = await sendToUser(sb, targetUid, league, legacy, { title: ev.title, body: rcp.body, url: link });
        pushed += r.pushed;
      }
    }
    report.push({ league, events: events.length, notifs: adds.length, pushed });
  }
  res.status(200).json({ ok: true, leagues: report.length, report });
}
export {
  handler as default
};
