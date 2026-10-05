import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../hooks/useRoomSocket";

interface Props {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat({ messages, myId, onSend }: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="card chat">
      <h3>Chat</h3>
      <div className="messages">
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
        {messages.map((m, i) => {
          const mine = m.userId === myId;
          return (
            <div key={i} className={`bubble-row ${mine ? "mine" : "theirs"}`}>
              <div className="bubble">
                {!mine && <div className="sender">{m.username}</div>}
                <div>{m.message}</div>
                <div className="time">{formatTime(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="row">
        <input
          value={text}
          placeholder="Type a message..."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button onClick={submit}>Send</button>
      </div>
    </div>
  );
}