/* ============================================================
   LEAGUE CHAT — a global thread everyone in the league sees, plus 1:1
   "whispers" between two members. Stored in shared KV (league-namespaced,
   like every other shared key) and polled. Fully isolated from team scoring.

   Privacy note: whispers are FAMILY-grade private — the UI only shows a DM to
   its two participants. They live in the same league-shared store as everything
   else, so this is social privacy, not cryptographic privacy.
   ============================================================ */
import { sget, sset } from './storage';

export interface ChatMessage {
  id: string;
  from: string;        // sender memberId
  fromName: string;    // denormalized name for display
  to: string | null;   // null = global; a memberId = whisper to that person
  text: string;
  ts: number;          // epoch ms
}

const KEY = 'wc:chat';
const CAP = 300;        // keep the last N so the stored blob stays small

export async function loadChat(): Promise<ChatMessage[]> {
  const arr = await sget<ChatMessage[]>(KEY, true);
  return Array.isArray(arr) ? arr : [];
}

/** Append a message (read-modify-write; fine for a family pool's volume). */
export async function sendChat(msg: ChatMessage): Promise<ChatMessage[]> {
  const cur = await loadChat();
  const next = [...cur, msg].slice(-CAP);
  await sset(KEY, next, true);
  return next;
}

/** Messages this member may see: global + any whisper to/from them. */
export function visibleTo(meId: string, m: ChatMessage): boolean {
  return m.to == null || m.to === meId || m.from === meId;
}

/** One conversation: peer = null → the global thread; a memberId → that whisper. */
export function thread(messages: ChatMessage[], meId: string, peer: string | null): ChatMessage[] {
  if (peer == null) return messages.filter(m => m.to == null);
  return messages.filter(m =>
    (m.from === meId && m.to === peer) || (m.from === peer && m.to === meId),
  );
}
