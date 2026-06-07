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

const memStore = (() => {
  const m: Record<string, string> = {};
  return {
    get: async (k: string) => {
      if (k in m) return { key: k, value: m[k] };
      throw new Error("nf");
    },
    set: async (k: string, v: string) => {
      m[k] = v;
      return { key: k, value: v };
    },
    delete: async (k: string) => {
      delete m[k];
      return { key: k, deleted: true };
    },
    list: async () => ({ keys: Object.keys(m) }),
  };
})();

export const HAS_REAL = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
const STORE = HAS_REAL ? window.storage! : memStore;

export async function sget<T>(key: string, shared?: boolean): Promise<T | null> {
  try {
    const r = await STORE.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}

export async function sset<T>(key: string, val: T, shared?: boolean): Promise<boolean> {
  try {
    await STORE.set(key, JSON.stringify(val), shared);
    return true;
  } catch (e) {
    console.error("storage set failed", e);
    return false;
  }
}
