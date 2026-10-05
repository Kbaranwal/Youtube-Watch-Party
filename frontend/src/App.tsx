import { useState } from "react";
import Home from "./pages/Home";
import Room from "./pages/Room";

interface Session {
  roomId: string;
  username: string;
}

const SESSION_KEY = "watchparty_session";

// After a page refresh, restore the session if the URL still points to the same room.
function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Session;
    const roomInUrl = new URLSearchParams(window.location.search)
      .get("room")
      ?.toUpperCase();
    return roomInUrl && roomInUrl === saved.roomId ? saved : null;
  } catch {
    return null;
  }
}

export default function App() {
  // If the user arrives via an invite link (?room=CODE), the code is pre-filled.
  const initialRoom =
    new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  const [session, setSession] = useState<Session | null>(loadSession);

  function enter(roomId: string, username: string) {
    const next = { roomId, username };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    window.history.replaceState(null, "", `?room=${roomId}`);
    setSession(next);
  }

  function leave() {
    sessionStorage.removeItem(SESSION_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    setSession(null);
  }

  if (!session) return <Home initialRoom={initialRoom} onEnter={enter} />;
  return <Room roomId={session.roomId} username={session.username} onLeave={leave} />;
}