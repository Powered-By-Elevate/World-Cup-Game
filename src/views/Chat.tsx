import { useState, useRef, useEffect, useMemo } from 'react';
import type { ChatMessage } from '../utils/chat';
import { thread } from '../utils/chat';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/shared';

export interface ChatPeer { id: string; name: string; team: string }

interface Props {
  meId: string;
  messages: ChatMessage[];
  members: ChatPeer[];                       // everyone else in the league
  onSend: (to: string | null, text: string) => void;
  onClose: () => void;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ap}`;
}

export function Chat({ meId, messages, members, onSend, onClose }: Props) {
  const [peer, setPeer] = useState<string | null>(null);   // null = global
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const convo = useMemo(() => thread(messages, meId, peer), [messages, meId, peer]);
  const peerInfo = peer ? members.find(m => m.id === peer) : null;

  // which peers we have any whisper history with (drives the selector dot)
  const hasWhisper = useMemo(() => {
    const set = new Set<string>();
    for (const m of messages) {
      if (m.to == null) continue;
      if (m.from === meId) set.add(m.to);
      else if (m.to === meId) set.add(m.from);
    }
    return set;
  }, [messages, meId]);

  // keep pinned to the newest message
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [convo.length, peer]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(peer, t);
    setText('');
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-grab" />
        <div className="between" style={{ padding: '4px 18px 12px' }}>
          <h2 className="display" style={{ fontSize: 24 }}>{peerInfo ? peerInfo.name : 'League Chat'}</h2>
          <button className="hdr-btn" onClick={onClose} style={{ border: '1.5px solid var(--line)' }}><Icon name="x" size={18} /></button>
        </div>

        {/* recipient selector: Everyone + each member */}
        <div className="scroll-x" style={{ padding: '0 18px 12px', margin: 0 }}>
          <button className={`chip ${peer === null ? 'on' : ''}`} onClick={() => setPeer(null)} style={{ flex: '0 0 auto' }}>
            <Icon name="globe" size={14} /> Everyone
          </button>
          {members.map(mem => (
            <button key={mem.id} className={`chip ${peer === mem.id ? 'on' : ''}`} onClick={() => setPeer(mem.id)} style={{ flex: '0 0 auto', paddingLeft: 4 }}>
              <Avatar name={mem.name} size={22} />
              {mem.name.split(' ')[0]}
              {hasWhisper.has(mem.id) ? <span className="chat-dot" /> : null}
            </button>
          ))}
        </div>

        {peerInfo && (
          <div className="muted" style={{ fontSize: 11.5, padding: '0 18px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="bolt" size={12} /> Private whisper — just you and {peerInfo.name.split(' ')[0]}.
          </div>
        )}

        {/* messages */}
        <div ref={listRef} className="chat-msgs">
          {convo.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', fontSize: 13.5, margin: 'auto', padding: '30px 20px', lineHeight: 1.5 }}>
              {peer === null ? 'No messages yet — say hi to the league 👋' : `Start a private chat with ${peerInfo?.name.split(' ')[0]} 👋`}
            </div>
          ) : convo.map((m, i) => {
            const mine = m.from === meId;
            const prev = convo[i - 1];
            const showName = peer === null && !mine && (!prev || prev.from !== m.from);
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {showName && <span className="chat-meta">{m.fromName}</span>}
                <div className={`chat-b ${mine ? 'me' : 'them'}`}>{m.text}</div>
                <span className="chat-meta" style={{ opacity: .7 }}>{timeLabel(m.ts)}</span>
              </div>
            );
          })}
        </div>

        {/* composer */}
        <div className="chat-compose">
          <input
            className="ipt"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={peer === null ? 'Message everyone…' : `Whisper to ${peerInfo?.name.split(' ')[0]}…`}
            maxLength={1000}
          />
          <button className="btn btn-ink" onClick={submit} disabled={!text.trim()} style={{ flex: '0 0 auto', width: 52, padding: 0 }}>
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
