import { useState } from "react";
import { useRoomSocket } from "../hooks/useRoomSocket";
import Player from "../components/Player";
import ParticipantList from "../components/ParticipantList";
import Chat from "../components/Chat";
import RequestVideo from "../components/RequestVideo";
import PendingRequests from "../components/PendingRequests";
import { FloatingReactions, ReactionBar } from "../components/Reactions";

interface Props {
  roomId: string;
  username: string;
  onLeave: () => void;
}

export default function Room({ roomId, username, onLeave }: Props) {
  const {
    connected, myId, myRole, participants, videoState, chat,
    requests, myRequest, clearMyRequest, reactions, notices,
    error, clearError, removed, roomMissing, send, leaveRoom,
  } = useRoomSocket(roomId, username);

  const [videoInput, setVideoInput] = useState("");
  const [copied, setCopied] = useState(false);

  const canControl = myRole === "host" || myRole === "moderator";

  if (roomMissing) {
    return (
      <div className="home">
        <div className="card">
          <p>This room no longer exists. It may have ended or the server restarted.</p>
          <button className="primary" style={{ width: "100%" }} onClick={onLeave}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (removed) {
    return (
      <div className="home">
        <div className="card">
          <p>The host removed you from this room.</p>
          <button className="primary" style={{ width: "100%" }} onClick={onLeave}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function changeVideo() {
    const v = videoInput.trim();
    if (!v) return;
    send({ type: "change_video", videoId: v }); // the server extracts the ID from a URL
    setVideoInput("");
  }

  function handleLeave() {
    leaveRoom(); // remove us from the room immediately
    onLeave();
  }

  return (
    <div className="room">
      <header className="topbar">
        <div className="brand">
          <div className="mini-logo" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <b>Watch Party</b>
          <span className="code-chip">{roomId}</span>
          <span className={connected ? "status on" : "status"}>
            {connected ? "Connected" : "Reconnecting..."}
          </span>
          <span className={`badge ${myRole}`}>{myRole}</span>
        </div>
        <div className="row">
          <button onClick={copyLink}>{copied ? "Copied!" : "Copy invite link"}</button>
          <button onClick={handleLeave}>Leave</button>
        </div>
      </header>

      {error && (
        <div className="toast" onClick={clearError}>
          {error} (click to dismiss)
        </div>
      )}

      <div className="layout">
        <div className="left">
          <div className="card player-card">
            <div className="stage">
              <Player
                videoState={videoState}
                canControl={canControl}
                onPlay={(time) => send({ type: "play", time })}
                onPause={(time) => send({ type: "pause", time })}
                onSeek={(time) => send({ type: "seek", time })}
              />
              <FloatingReactions items={reactions} />
            </div>

            <ReactionBar onReact={(emoji) => send({ type: "reaction", emoji })} />

            {canControl ? (
              <div className="row" style={{ marginTop: 14 }}>
                <input
                  value={videoInput}
                  placeholder="Paste a YouTube link or video ID"
                  onChange={(e) => setVideoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && changeVideo()}
                />
                <button className="primary" style={{ whiteSpace: "nowrap" }} onClick={changeVideo}>
                  Change video
                </button>
              </div>
            ) : (
              <RequestVideo
                myRequest={myRequest}
                onRequest={(videoId) => send({ type: "request_video", videoId })}
                onDismiss={clearMyRequest}
              />
            )}
          </div>
        </div>

        <div className="right">
          {canControl && <PendingRequests requests={requests} send={send} />}
          <ParticipantList
            participants={participants}
            myId={myId}
            myRole={myRole}
            send={send}
          />
          <Chat
            messages={chat}
            myId={myId}
            onSend={(message) => send({ type: "chat", message })}
          />
        </div>
      </div>

      <div className="notices">
        {notices.map((n) => (
          <div key={n.id} className="notice">
            {n.text}
          </div>
        ))}
      </div>
    </div>
  );
}