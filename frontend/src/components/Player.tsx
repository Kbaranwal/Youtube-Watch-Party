import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoState } from "../hooks/useRoomSocket";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// The YouTube IFrame API script is loaded only once.
let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return apiPromise;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  videoState: VideoState | null;
  canControl: boolean;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
}

export default function Player({
  videoState,
  canControl,
  onPlay,
  onPause,
  onSeek,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);
  const latestState = useRef<VideoState | null>(videoState);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState<number | null>(null);

  // Apply the server's video state to the YouTube player.
  const applyState = useCallback((s: VideoState | null) => {
    const p = playerRef.current;
    if (!p || !readyRef.current || !s || !s.videoId) return;

    // A different video: load it (and start playing only if the room is playing).
    if (loadedVideoRef.current !== s.videoId) {
      loadedVideoRef.current = s.videoId;
      if (s.playState === "playing") p.loadVideoById(s.videoId, s.currentTime);
      else p.cueVideoById(s.videoId, s.currentTime);
      return;
    }

    // Same video: correct drift, then match play/pause.
    const drift = Math.abs(p.getCurrentTime() - s.currentTime);
    if (drift > 1 || s.playState === "paused") p.seekTo(s.currentTime, true);
    if (s.playState === "playing") p.playVideo();
    else p.pauseVideo();
  }, []);

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      // Give YouTube its own element so it does not replace a React-managed node.
      const target = document.createElement("div");
      containerRef.current.appendChild(target);

      playerRef.current = new window.YT.Player(target, {
        width: "100%",
        height: "100%",
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            applyState(latestState.current); // handles late joiners / early state
            interval = window.setInterval(() => {
              const p = playerRef.current;
              if (!p || !readyRef.current) return;
              setDuration(p.getDuration() || 0);
              setTime(p.getCurrentTime() || 0);
            }, 500);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      readyRef.current = false;
      loadedVideoRef.current = null;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [applyState]);

  // Re-apply whenever a new sync_state arrives.
  useEffect(() => {
    latestState.current = videoState;
    applyState(videoState);
  }, [videoState, applyState]);

  const now = () => playerRef.current?.getCurrentTime?.() ?? 0;
  const isPlaying = videoState?.playState === "playing";
  const hasVideo = !!videoState?.videoId;
  const disabled = !canControl || !hasVideo;

  const shown = seekValue ?? time;
  const percent = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  function commitSeek() {
    if (seekValue !== null) onSeek(seekValue);
    setSeekValue(null);
  }

  return (
    <div className="player">
      <div className="pl-video">
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {/* Transparent overlay: prevents users from clicking the YouTube player directly. */}
        <div style={{ position: "absolute", inset: 0 }} />
        {!hasVideo && (
          <div className="pl-empty">
            <div className="big">🎬</div>
            <div>No video yet</div>
            <small>
              {canControl
                ? "Paste a YouTube link below to start watching together."
                : "Send a video request using the box below."}
            </small>
          </div>
        )}
      </div>

      <div className="pl-controls">
        <button
          className="pl-btn"
          disabled={disabled}
          onClick={() => onSeek(Math.max(0, now() - 10))}
        >
          -10s
        </button>

        <button
          className="pl-play"
          disabled={disabled}
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => (isPlaying ? onPause(now()) : onPlay(now()))}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            {isPlaying ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>

        <button className="pl-btn" disabled={disabled} onClick={() => onSeek(now() + 10)}>
          +10s
        </button>

        <span className="pl-time">
          {formatTime(shown)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          className="pl-range"
          min={0}
          max={duration || 0}
          step={1}
          value={shown}
          disabled={disabled}
          style={{ "--p": `${percent}%` } as CSSProperties}
          onChange={(e) => setSeekValue(Number(e.target.value))}
          onMouseUp={commitSeek}
          onTouchEnd={commitSeek}
          onKeyUp={commitSeek}
        />
      </div>

      {!canControl && (
        <p className="pl-note">Only the host and moderators can control playback.</p>
      )}
    </div>
  );
}