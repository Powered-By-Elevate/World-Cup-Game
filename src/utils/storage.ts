import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Layered key-value storage for the Family Draft.
 *
 * The app keeps two *shared* keys (`wc:state`, `wc:scores`) that every family
 * member must see, and one *private* key (`wc:me`) that is unique to each
 * device. We resolve the best available backend at runtime:
 *
 *   1. window.storage  - Bolt's sandbox shared-storage API (when hosted there)
 *   2. Supabase        - real cross-device sharing (when VITE_SUPABASE_* is set)
 *   3. localStorage    - single-device persistence (survives refreshes)
 *   4. memory          - last-resort fallback (SSR / private-mode failures)
 *
 * "Shared" reads/writes go to the chosen shared backend; private reads/writes
 * always stay on the local device. HAS_REAL is true only when a genuinely
 * shared backend is available, which the UI surfaces as LIVE vs PREVIEW.
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
    get: async (k) => {
      if (k in m) return { key: k, value: m[k] };
      throw new Error('nf');
    },
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
  } catch {
    return null;
  }
  return {
    get: async (k) => {
      const v = window.localStorage.getItem(k);
      if (v == null) throw new Error('nf');
      return { key: k, value: v };
    },
    set: async (k, v) => { window.localStorage.setItem(k, v); return { key: k, value: v }; },
    delete: async (k) => { window.localStorage.removeItem(k); return { key: k, deleted: true }; },
  };
}
const localStore = makeLocalStore();

/* -------------------------------- league id ------------------------------- */
/**
 * A short code that namespaces a family's shared data so multiple pools can
 * coexist on one Supabase project. Resolved from the invite link (?league=),
 * otherwise read from / generated into localStorage so the creator keeps a
 * stable pool. leagueLink() builds an invite URL that carries the code.
 */
function resolveLeague(): string {
  if (!hasWindow) return 'family';
  let code = '';
  try {
    code = new URL(window.location.href).searchParams.get('league') || '';
  } catch { /* ignore malformed URL */ }
  try {
    if (!code) code = window.localStorage?.getItem('wc:league') || '';
    if (!code) code = Math.random().toString(36).slice(2, 8);
    window.localStorage?.setItem('wc:league', code);
  } catch {
    if (!code) code = 'family';
  }
  return code;
}
export const LEAGUE = resolveLeague();

export function leagueLink(): string {
  if (!hasWindow) return '';
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('league', LEAGUE);
    return u.toString();
  } catch {
    return hasWindow ? window.location.href : '';
  }
}

/* --------------------------------- Supabase ------------------------------- */
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SUPA_ON = !!(SUPA_URL && SUPA_KEY);

let supa: SupabaseClient | null = null;
function makeSupaStore(): KV | null {
  if (!SUPA_ON) return null;
  try {
    supa = createClient(SUPA_URL!, SUPA_KEY!, { auth: { persistSession: false } });
  } catch (e) {
    console.error('supabase init failed', e);
    return null;
  }
  // Shared keys are scoped to the league so families never collide.
  const scoped = (k: string) => `${LEAGUE}:${k}`;
  return {
    get: async (k) => {
      const { data, error } = await supa!
        .from('app_kv').select('value').eq('key', scoped(k)).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('nf');
      return { key: k, value: JSON.stringify(data.value) };
    },
    set: async (k, v) => {
      const { error } = await supa!
        .from('app_kv')
        .upsert({ key: scoped(k), value: JSON.parse(v), updated_at: new Date().toISOString() });
      if (error) throw error;
      return { key: k, value: v };
    },
    delete: async (k) => {
      const { error } = await supa!.from('app_kv').delete().eq('key', scoped(k));
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

// Backend for SHARED keys, best-to-worst.
const sharedStore: KV = boltStore || supaStore || localStore || memStore;
// Backend for PRIVATE keys: always this device.
const privateStore: KV = localStore || memStore;

/** True when a genuinely shared backend is active (drives the LIVE badge). */
export const HAS_REAL = !!(boltStore || supaStore);

function pick(shared?: boolean): KV {
  return shared ? sharedStore : privateStore;
}

export async function sget<T>(key: string, shared?: boolean): Promise<T | null> {
  try {
    const r = await pick(shared).get(key);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}

export async function sset<T>(key: string, val: T, shared?: boolean): Promise<boolean> {
  try {
    await pick(shared).set(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('storage set failed', e);
    return false;
  }
}
