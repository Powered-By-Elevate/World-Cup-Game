import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MeState } from '../data/types';

/**
 * Multi-league key-value storage.
 *
 * Shared keys (wc:state) are namespaced by the ACTIVE league code so several
 * family pools coexist on one backend. Private keys (the per-league identity
 * wc:me:<code>, plus the local league registry) stay on the device.
 *
 * Backend preference: window.storage (Bolt) → Supabase → localStorage → memory.
 */

declare global {
  interface Window {
    storage?: {
      get: (key: string, shared?: boolean) => Promise<{ key: string; value: string }>;
      set: (key: string, value: string, shared?: boolean) => Promise<{ key: string; value: string }>;
      delete: (key: string, shared?: boolean) => Promise<{ key: string; deleted: boolean }>;
      list: (shared?: boolean) => Promise<{ keys: string[] }>;
    };
  }
}

interface KV {
  get: (k: string) => Promise<{ key: string; value: string }>;
  set: (k: string, v: string) => Promise<{ key: string; value: string }>;
  delete: (k: string) => Promise<{ key: string; deleted: boolean }>;
}

const hasWindow = typeof window !== 'undefined';

/* --------------------------------- memory --------------------------------- */
const memStore: KV = (() => {
  const m: Record<string, string> = {};
  return {
    get: async (k) => { if (k in m) return { key: k, value: m[k] }; throw new Error('nf'); },
    set: async (k, v) => { m[k] = v; return { key: k, value: v }; },
    delete: async (k) => { delete m[k]; return { key: k, deleted: true }; },
  };
})();

/* ------------------------------ localStorage ------------------------------ */
function makeLocalStore(): KV | null {
  try {
    if (!hasWindow || !window.localStorage) return null;
    const probe = '__wc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch { return null; }
  return {
    get: async (k) => { const v = window.localStorage.getItem(k); if (v == null) throw new Error('nf'); return { key: k, value: v }; },
    set: async (k, v) => { window.localStorage.setItem(k, v); return { key: k, value: v }; },
    delete: async (k) => { window.localStorage.removeItem(k); return { key: k, deleted: true }; },
  };
}
const localStore = makeLocalStore();

/* plain localStorage helpers for the local league registry */
function lsGet<T>(k: string, d: T): T {
  try { const v = hasWindow ? window.localStorage.getItem(k) : null; return v ? JSON.parse(v) as T : d; } catch { return d; }
}
function lsSet(k: string, v: unknown) { try { if (hasWindow) window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

/* ============================================================
   LEAGUES
   ============================================================ */
export type League = { code: string; name: string };

export function newLeagueCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function listLeagues(): League[] {
  const raw = lsGet<League[]>('wc:leagues', []);
  if (!Array.isArray(raw)) return [];
  // Always return a de-duped, valid registry. A corrupted store (duplicate
  // codes, blank codes) must never produce duplicate rows or let a single
  // remove() wipe several leagues at once.
  const byCode = new Map<string, League>();
  for (const l of raw) {
    if (!l || typeof l.code !== 'string' || !l.code) continue;
    const cur = byCode.get(l.code);
    if (!cur) byCode.set(l.code, { code: l.code, name: l.name || '' });
    else if (!cur.name && l.name) cur.name = l.name;   // keep the named version
  }
  return [...byCode.values()];
}
export function upsertLeague(code: string, name: string) {
  if (!code) return;
  const ls = listLeagues();
  const i = ls.findIndex(l => l.code === code);
  if (i >= 0) { if (name) ls[i].name = name; }
  else if (name) ls.push({ code, name });   // never persist a nameless league
  else return;
  lsSet('wc:leagues', ls);
}
export function removeLeague(code: string) {
  lsSet('wc:leagues', listLeagues().filter(l => l.code !== code));
}
/** Normalize the stored registry: only named, unique, valid-code leagues.
 *  Clears out nameless "phantom" leagues left by older versions. */
export function pruneLeagues(): League[] {
  const clean = listLeagues().filter(l => l.name);
  lsSet('wc:leagues', clean);
  return clean;
}

let _active: string | null = null;
export function activeLeague(): string {
  if (_active) return _active;
  let code = '';
  try { if (hasWindow) code = new URL(window.location.href).searchParams.get('league') || ''; } catch { /* ignore */ }
  if (!code) code = lsGet<string>('wc:activeLeague', '');
  if (!code) { const ls = listLeagues(); code = ls[0]?.code || newLeagueCode(); }
  _active = code;
  lsSet('wc:activeLeague', code);
  return code;
}
export function setActiveLeague(code: string) { _active = code; lsSet('wc:activeLeague', code); }

/* ---- invite links ---- */
function baseUrl(): URL | null {
  if (!hasWindow) return null;
  try { const u = new URL(window.location.href); u.search = ''; u.hash = ''; return u; } catch { return null; }
}
export function leagueLink(code = activeLeague()): string {
  const u = baseUrl(); if (!u) return '';
  u.searchParams.set('league', code);
  return u.toString();
}
export function teamLink(teamId: string, code = activeLeague()): string {
  const u = baseUrl(); if (!u) return '';
  u.searchParams.set('league', code);
  u.searchParams.set('team', teamId);
  return u.toString();
}
/** Pull a league code out of a pasted invite link or raw code. */
export function parseLeagueCode(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';
  try { const u = new URL(s); const q = u.searchParams.get('league'); if (q) return q; } catch { /* not a url */ }
  const m = s.match(/league=([a-z0-9]+)/i);
  if (m) return m[1];
  if (/^[a-z0-9]{4,12}$/i.test(s)) return s;
  return '';
}

/* ============================================================
   Supabase
   ============================================================ */
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SUPA_ON = !!(SUPA_URL && SUPA_KEY);

let supa: SupabaseClient | null = null;
function makeSupaStore(): KV | null {
  if (!SUPA_ON) return null;
  try {
    supa = createClient(SUPA_URL!, SUPA_KEY!, {
      // Persist the auth session so a device stays signed in across reloads and
      // refreshes tokens silently. This is what makes one account follow you
      // across desktop, mobile Safari and the home-screen app.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  catch (e) { console.error('supabase init failed', e); return null; }
  return {
    get: async (k) => {
      const { data, error } = await supa!.from('app_kv').select('value').eq('key', k).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('nf');
      return { key: k, value: JSON.stringify(data.value) };
    },
    set: async (k, v) => {
      const { error } = await supa!.from('app_kv').upsert({ key: k, value: JSON.parse(v), updated_at: new Date().toISOString() });
      if (error) throw error;
      return { key: k, value: v };
    },
    delete: async (k) => {
      const { error } = await supa!.from('app_kv').delete().eq('key', k);
      if (error) throw error;
      return { key: k, deleted: true };
    },
  };
}
const supaStore = makeSupaStore();

/* ------------------------------ backend choice ---------------------------- */
const boltStore: KV | null = (hasWindow && window.storage && typeof window.storage.get === 'function')
  ? {
      get: (k) => window.storage!.get(k, true),
      set: (k, v) => window.storage!.set(k, v, true),
      delete: (k) => window.storage!.delete(k, true),
    }
  : null;

const sharedStore: KV = boltStore || supaStore || localStore || memStore;
const privateStore: KV = localStore || memStore;

/** True when a genuinely shared backend is active (drives the LIVE badge). */
export const HAS_REAL = !!(boltStore || supaStore);

/** Shared keys are namespaced by the active league; private keys are not. */
function scoped(key: string, shared?: boolean): string {
  return shared ? `${activeLeague()}:${key}` : key;
}

export async function sget<T>(key: string, shared?: boolean): Promise<T | null> {
  try {
    const r = await (shared ? sharedStore : privateStore).get(scoped(key, shared));
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
export async function sset<T>(key: string, val: T, shared?: boolean): Promise<boolean> {
  try { await (shared ? sharedStore : privateStore).set(scoped(key, shared), JSON.stringify(val)); return true; }
  catch (e) { console.error('storage set failed', e); return false; }
}

/* ---- per-league identity (device cache; the account is the source of truth) ---- */
export async function getMe(code: string): Promise<MeState | null> { return sget<MeState>(`wc:me:${code}`, false); }
export async function setMe(code: string, me: MeState | null): Promise<boolean> { return sset(`wc:me:${code}`, me, false); }

/* ============================================================
   AUTH (Supabase email magic link / OTP code)
   ============================================================ */

/** True when accounts are available (requires a configured Supabase backend). */
export const AUTH_ON = SUPA_ON;

export interface AuthUser { id: string; email: string | null; }

function redirectTo(): string | undefined {
  if (!hasWindow) return undefined;
  try { const u = new URL(window.location.href); u.hash = ''; return u.toString(); } catch { return undefined; }
}

/** Send a sign-in email containing both a 6-digit code and a magic link. */
export async function signInWithEmail(email: string): Promise<void> {
  if (!supa) throw new Error('Accounts need a Supabase backend');
  const { error } = await supa.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
}

/** Verify the 6-digit code the user typed in. Returns the signed-in user. */
export async function verifyCode(email: string, token: string): Promise<AuthUser | null> {
  if (!supa) throw new Error('Accounts need a Supabase backend');
  const { data, error } = await supa.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw error;
  const u = data.user;
  return u ? { id: u.id, email: u.email ?? null } : null;
}

/** The currently signed-in user, or null. */
export async function getAuthUser(): Promise<AuthUser | null> {
  if (!supa) return null;
  const { data } = await supa.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? null } : null;
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!supa) return () => {};
  const { data } = supa.auth.onAuthStateChange((_e, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  if (supa) { try { await supa.auth.signOut(); } catch { /* ignore */ } }
}

/* ---- accounts directory (commissioner only) ----
   Emails + last login live in Supabase's auth.users, which the anon key can't
   read. The /api/users serverless endpoint (service-role) returns them, gated
   to the league commissioner. Returns [] when unavailable (not configured, not
   the commissioner, or no backend) so the UI falls back to inline lite emails. */
export interface Account {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  /** Last time the account actually opened the app (our own presence stamp,
   *  epoch ms). Truer "last seen" than last_sign_in_at, which only changes on
   *  a fresh authentication. Absent until they next open the app. */
  lastSeen?: number | null;
}

export async function listAccounts(league: string): Promise<Account[]> {
  if (!supa || !league) return [];
  try {
    const { data } = await supa.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return [];
    const r = await fetch(`/api/users?league=${encodeURIComponent(league)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const accounts: Account[] = Array.isArray(j.accounts) ? j.accounts : [];
    // Merge in our own last-opened presence (read with the anon key).
    const seen = (await sget<Record<string, number>>('wc:seen', true)) || {};
    for (const a of accounts) a.lastSeen = seen[a.id] ?? null;
    return accounts;
  } catch { return []; }
}

/** Stamp "this account just opened the app" into the league's shared presence
 *  map. Throttled per device (10 min) so reopening doesn't spam writes. */
export async function touchPresence(uid: string): Promise<void> {
  if (!supa || !uid) return;
  try {
    const guard = `wc:seen:wrote:${activeLeague()}:${uid}`;
    const last = Number(lsGet<string>(guard, '0')) || 0;
    if (Date.now() - last < 10 * 60 * 1000) return;
    const map = (await sget<Record<string, number>>('wc:seen', true)) || {};
    map[uid] = Date.now();
    await sset('wc:seen', map, true);
    lsSet(guard, String(Date.now()));
  } catch { /* presence is best-effort */ }
}

/* ---- per-account league registry (follows you across devices) ----
   Stored in the SHARED backend under a per-user key (not league-namespaced),
   so the leagues you belong to appear on every device you sign into. */
export async function getUserLeagues(uid: string): Promise<League[]> {
  try {
    const r = await sharedStore.get(`user:${uid}:leagues`);
    const arr = r ? JSON.parse(r.value) : [];
    return Array.isArray(arr) ? arr.filter((l: League) => l && l.code) : [];
  } catch { return []; }
}

async function setUserLeagues(uid: string, leagues: League[]): Promise<void> {
  try { await sharedStore.set(`user:${uid}:leagues`, JSON.stringify(leagues)); } catch (e) { console.error('setUserLeagues failed', e); }
}

/** Merge this device's local registry with the account's, write both back, and
 *  return the merged list. This is what connects pools a family already built
 *  (held in device-local storage) to their new account on first sign-in. */
export async function syncUserLeagues(uid: string): Promise<League[]> {
  const byCode = new Map<string, League>();
  for (const l of [...await getUserLeagues(uid), ...listLeagues()]) {
    if (!l || !l.code) continue;
    const cur = byCode.get(l.code);
    if (!cur) byCode.set(l.code, { code: l.code, name: l.name || '' });
    else if (!cur.name && l.name) cur.name = l.name;   // keep the named version
  }
  const merged = [...byCode.values()];
  await setUserLeagues(uid, merged);
  lsSet('wc:leagues', merged);   // reflect on this device too
  return merged;
}

/** Add (or rename) one league in the account's registry. */
export async function addUserLeague(uid: string, code: string, name: string): Promise<void> {
  if (!code || !name) return;
  const cur = await getUserLeagues(uid);
  const i = cur.findIndex(l => l.code === code);
  if (i >= 0) { if (name) cur[i].name = name; } else { cur.push({ code, name }); }
  await setUserLeagues(uid, cur);
}

/** Remove one league from the account's registry. */
export async function removeUserLeague(uid: string, code: string): Promise<void> {
  const cur = await getUserLeagues(uid);
  await setUserLeagues(uid, cur.filter(l => l.code !== code));
}

/* ============================================================
   RESET (testing) — wipe the active league's pool + all local app data
   ============================================================ */
export async function resetActiveLeague(): Promise<void> {
  try { await sset('wc:state', null, true); } catch { /* ignore */ }
  try { await sset('wc:scores', {}, true); } catch { /* ignore */ }
}
export function clearLocal(): void {
  try {
    if (hasWindow) {
      Object.keys(window.localStorage).filter(k => k.startsWith('wc:')).forEach(k => window.localStorage.removeItem(k));
    }
  } catch { /* ignore */ }
  _active = null;
}
