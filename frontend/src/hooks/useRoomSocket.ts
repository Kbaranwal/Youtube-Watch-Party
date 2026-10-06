import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "../config";

export type Role = "host" | "moderator" | "participant";

export interface Participant {
  userId: string;
  username: string;
  role: Role;
}

export interface VideoState {
  videoId: string | null;
  playState: "playing" | "paused";
  currentTime: number;
  playbackRate: number;
}

export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  createdAt: string; // ISO timestamp from the server
}

// A pending "change video" request (visible to the host and moderators).
export interface VideoRequest {
  id: string;
  userId: string;
  username: string;
  videoId: string;
  createdAt: string;
}

// Status of the current user's own request.
export interface MyRequest {
  status: "pending" | "approved" | "rejected";
  videoId: string;
  by?: string;
}

// An emoji that floats over the video for a few seconds.
export interface FloatingReaction {
  id: number;
  emoji: string;
  username: string;
  left: number; // horizontal position in percent
}

// A short-lived popup message ("Alex joined").
export interface Notice {
  id: number;
  text: string;
}

// The reconnect token is stored per room and per browser tab (sessionStorage).
const tokenKey = (roomId: string) => `watchparty_token_${roomId}`;

export function useRoomSocket(roomId: string, username: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string | null>(null);
  const idCounter = useRef(0);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [videoState, setVideoState] = useState<VideoState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [requests, setRequests] = useState<VideoRequest[]>([]);
  const [myRequest, setMyRequest] = useState<MyRequest | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [roomMissing, setRoomMissing] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let ping: number | undefined;
    let retryTimer: number | undefined;
    let attempts = 0;
    let stopped = false;

    const pushNotice = (text: string) => {
      const id = ++idCounter.current;
      setNotices((prev) => [...prev.slice(-3), { id, text }]);
      window.setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 3500);
    };

    const pushReaction = (emoji: string, name: string) => {
      const id = ++idCounter.current;
      const item: FloatingReaction = { id, emoji, username: name, left: 8 + Math.random() * 80 };
      setReactions((prev) => [...prev.slice(-24), item]);
      window.setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3000);
    };

    const connect = () => {
      // Sending the saved token lets the server restore our identity and role.
      const token = sessionStorage.getItem(tokenKey(roomId));
      const query = new URLSearchParams({ username });
      if (token) query.set("token", token);

      const socket = new WebSocket(`${WS_URL}/ws/${roomId}?${query.toString()}`);
      ws = socket;
      wsRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        // Send a ping every 25 seconds so hosting platforms keep the connection open.
        ping = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      socket.onclose = (e) => {
        clearInterval(ping);
        if (stopped) return;
        setConnected(false);
        if (e.code === 4004) return setRoomMissing(true); // room does not exist
        if (e.code === 4001 || e.code === 4002 || e.code === 1000) return; // removed / replaced / left
        // Unexpected drop: retry with a growing delay (1s, 2s, 4s, ... up to 8s).
        const delay = Math.min(1000 * 2 ** attempts, 8000);
        attempts += 1;
        retryTimer = window.setTimeout(connect, delay);
      };

      socket.onmessage = (e) => {
        const d = JSON.parse(e.data);
        switch (d.type) {
          case "joined":
            // The server sends the token only to brand-new participants.
            if (d.token) sessionStorage.setItem(tokenKey(roomId), d.token);
            myIdRef.current = d.userId;
            setMyId(d.userId);
            setParticipants(d.participants);
            setVideoState({
              videoId: d.state.videoId,
              playState: d.state.playState,
              currentTime: d.state.currentTime,
              playbackRate: d.state.playbackRate ?? 1,
            });
            setChat(d.chat ?? []); // recent chat history
            setRequests(d.requests ?? []);
            setMyRequest(
              d.myRequest ? { status: "pending", videoId: d.myRequest.videoId } : null
            );
            break;
          case "user_joined":
            setParticipants(d.participants);
            if (d.userId !== myIdRef.current) pushNotice(`${d.username} joined`);
            break;
          case "user_left":
            setParticipants(d.participants);
            pushNotice(`${d.username} left`);
            break;
          case "participant_removed":
            setParticipants(d.participants);
            break;
          case "role_assigned":
            setParticipants(d.participants);
            pushNotice(`${d.username} is now ${d.role}`);
            break;
          case "sync_state":
            // Always create a new object so the player reacts to every update.
            setVideoState({
              videoId: d.videoId,
              playState: d.playState,
              currentTime: d.currentTime,
              playbackRate: d.playbackRate ?? 1,
            });
            break;
          case "chat":
            setChat((prev) => [
              ...prev,
              {
                userId: d.userId,
                username: d.username,
                message: d.message,
                createdAt: d.createdAt,
              },
            ]);
            break;
          case "reaction":
            pushReaction(d.emoji, d.username);
            break;
          case "requests_updated":
            setRequests(d.requests);
            break;
          case "request_status":
            setMyRequest({ status: d.status, videoId: d.videoId, by: d.by });
            break;
          case "error":
            setError(d.message);
            break;
          case "removed":
            setRemoved(true);
            break;
          // "pong" is ignored
        }
      };
    };

    // The first connection is delayed by a tick because React StrictMode runs effects
    // twice in development. The first run is cancelled by the cleanup, so the server
    // only ever sees a single connection.
    const startTimer = window.setTimeout(connect, 0);

    return () => {
      stopped = true;
      clearTimeout(startTimer);
      clearTimeout(retryTimer);
      clearInterval(ping);
      ws?.close();
    };
  }, [roomId, username]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Explicit leave: tell the server to remove us right away and forget the token.
  const leaveRoom = useCallback(() => {
    send({ type: "leave_room" });
    sessionStorage.removeItem(tokenKey(roomId));
  }, [roomId, send]);

  const me = participants.find((p) => p.userId === myId) ?? null;

  return {
    connected,
    myId,
    myRole: me?.role ?? "participant",
    participants,
    videoState,
    chat,
    requests,
    myRequest,
    clearMyRequest: () => setMyRequest(null),
    reactions,
    notices,
    error,
    clearError: () => setError(null),
    removed,
    roomMissing,
    send,
    leaveRoom,
  };
}