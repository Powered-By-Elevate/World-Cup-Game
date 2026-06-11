/* ============================================================
   IN-APP NOTIFICATIONS — a league-shared feed, one entry per
   recipient (like chat whispers). Polled by the app; drives the
   header bell badge + panel. Covers in-session delivery for every
   event type; out-of-app web-push for backgrounded users is a
   server concern tracked in docs/ARCADE_MULTIPLAYER_PLAN.md.
   ============================================================ */
import { sget, sset } from './storage';
import { uid } from './helpers';

export type NotifKind = 'challenge' | 'challenge-result' | 'chat' | 'match-start' | 'match-result';

export interface Notif {
  id: string;
  to: string;          // recipient memberId
  kind: NotifKind;
  title: string;
  body: string;
  ts: number;
  read: boolean;
}

const KEY = 'wc:notifs';
const CAP = 200;

export async function loadNotifs(): Promise<Notif[]> {
  const r = await sget<Notif[]>(KEY, true);
  return Array.isArray(r) ? r : [];
}

/** Append one or more notifications (read-modify-write; family-pool volume). */
export async function pushNotifs(items: Array<Omit<Notif, 'id' | 'read'>>): Promise<void> {
  if (!items.length) return;
  const cur = await loadNotifs();
  const add: Notif[] = items.map(i => ({ ...i, id: uid(), read: false }));
  await sset(KEY, [...cur, ...add].slice(-CAP), true);
}

export function mine(notifs: Notif[], meId: string): Notif[] {
  return notifs.filter(n => n.to === meId).sort((a, b) => b.ts - a.ts);
}
export function unreadCount(notifs: Notif[], meId: string): number {
  return notifs.reduce((a, n) => a + (n.to === meId && !n.read ? 1 : 0), 0);
}
export async function markAllRead(meId: string): Promise<Notif[]> {
  const cur = await loadNotifs();
  let changed = false;
  for (const n of cur) if (n.to === meId && !n.read) { n.read = true; changed = true; }
  if (changed) await sset(KEY, cur, true);
  return cur;
}
