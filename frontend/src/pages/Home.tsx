import { useState } from "react";
import { API_URL } from "../config";

interface Props {
  initialRoom: string;
  onEnter: (roomId: string, username: string) => void;
}

export default function Home({ initialRoom, onEnter }: Props) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState(initialRoom);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const name = username.trim();

  async function createRoom() {
    if (!name) return setError("Please enter your name.");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/rooms`, { method: "POST" });
      const data = await res.json();
      onEnter(data.roomId, name); // the creator joins immediately and becomes the host
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    const id = code.trim().toUpperCase();
    if (!name) return setError("Please enter your name.");
    if (!id) return setError("Please enter a room code.");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/rooms/${id}`);
      if (!res.ok) {
        setError("Room not found. Check the code and try again.");
        return;
      }
      onEnter(id, name);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home">
      <div className="hero">
        <div className="logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <h1>YouTube Watch Party</h1>
        <p className="tagline">Watch YouTube together with friends.</p>
      </div>

      <div className="card form">
        <label style={{ marginTop: 0 }}>Your name</label>
        <input
          value={username}
          maxLength={30}
          placeholder="Eg. Krishna"
          onChange={(e) => setUsername(e.target.value)}
        />

        <button className="primary" disabled={loading} onClick={createRoom}>
          Create Room
        </button>

        <div className="divider">or join an existing room</div>

        <label>Room code</label>
        <input
          value={code}
          maxLength={6}
          placeholder="Eg. AB12CD"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && joinRoom()}
        />
        <button disabled={loading} onClick={joinRoom}>
          Join Room
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}