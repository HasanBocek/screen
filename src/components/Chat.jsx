import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

const Chat = forwardRef(function Chat({ onSend, roster, selfId, selfName, title = 'Oda sohbeti' }, ref) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useImperativeHandle(ref, () => ({
    addIncoming(msg) {
      if (msg.clientId === selfId) return; // already echoed locally
      setMessages((m) => [...m, msg]);
    },
    addSystem(text) {
      setMessages((m) => [...m, { system: true, text, ts: Date.now() }]);
    },
  }));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, roster]);

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setMessages((m) => [...m, { self: true, username: selfName || 'You', text, ts: Date.now() }]);
    setDraft('');
  };

  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>{title}</span>
        <span className="chat-online">{roster.length} kişi odada</span>
      </div>
      <div className="chat-people">
        {roster.map((c) => (
          <span key={c.id} className={`chat-person ${c.role === 'broadcaster' ? 'host' : ''}`}>
            {c.username}{c.id === selfId ? ' (sen)' : ''}
          </span>
        ))}
      </div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="chat-empty">Henüz mesaj yok.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.self ? 'self' : ''} ${m.system ? 'system' : ''}`}>
            {!m.system && <span className="chat-author">{m.username}</span>}
            <span className="chat-text">{m.text}</span>
            <span className="chat-time">{time(m.ts)}</span>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Mesaj yaz…"
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>Gönder</button>
      </form>
    </div>
  );
});

export default Chat;
