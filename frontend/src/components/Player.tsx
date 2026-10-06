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

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface Props {
  videoState: VideoState | null;
  canControl: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
  onSetRate: (rate: number) => void;
}

export default function Player({
  videoState,
  canControl,
  isFullscreen,
  onToggleFullscreen,
  onPlay,
  onPause,
  onSeek,
  onSetRate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);
  const latestState = useRef<VideoState | null>(videoState);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionNote, setCaptionNote] = useState("");

  // Apply the server's video state to the YouTube player.
  const applyState = useCallback((s: VideoState | null) => {
    const p = playerRef.current;
    if (!p || !readyRef.current || !s || !s.videoId) return;
    const rate = s.playbackRate ?? 1;

    // A different video: load it (and start playing only if the room is playing).
    if (loadedVideoRef.current !== s.videoId) {
      loadedVideoRef.current = s.videoId;
      if (s.playState === "playing") p.loadVideoById(s.videoId, s.currentTime);
      else p.cueVideoById(s.videoId, s.currentTime);
      p.setPlaybackRate(rate);
      return;
    }

    // Same video: correct drift, then match play/pause and speed.
    const drift = Math.abs(p.getCurrentTime() - s.currentTime);
    if (drift > 1 || s.playState === "paused") p.seekTo(s.currentTime, true);
    if (s.playState === "playing") p.playVideo();
    else p.pauseVideo();
    if (p.getPlaybackRate() !== rate) p.setPlaybackRate(rate);
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
          // A freshly loaded video can reset the speed, so apply the room speed again.
          onStateChange: () => {
            const p = playerRef.current;
            const s = latestState.current;
            if (!p || !s) return;
            const rate = s.playbackRate ?? 1;
            if (p.getPlaybackRate() !== rate) p.setPlaybackRate(rate);
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

  // Close the settings menu when clicking outside of it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e: Event) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [menuOpen]);

  // Subtitles are a personal setting: they only affect this viewer. YouTube does not
  // officially support toggling them at runtime, so this is best-effort.
  function setCaptions(on: boolean) {
    const p = playerRef.current;
    setCaptionsOn(on);
    setCaptionNote("");
    if (!p || !readyRef.current) return;
    try {
      if (!on) {
        p.unloadModule("captions");
        return;
      }
      p.loadModule("captions");
      window.setTimeout(() => {
        try {
          const tracks = p.getOption("captions", "tracklist") as
            | { languageCode: string }[]
            | undefined;
          if (!tracks || tracks.length === 0) {
            setCaptionNote("No subtitles found for this video.");
            return;
          }
          const pick = tracks.find((t) => t.languageCode.startsWith("en")) ?? tracks[0];
          p.setOption("captions", "track", { languageCode: pick.languageCode });
        } catch {
          setCaptionNote("Subtitles are not available for this video.");
        }
      }, 1200);
    } catch {
      setCaptionNote("Subtitles are not available for this video.");
    }
  }

  const now = () => playerRef.current?.getCurrentTime?.() ?? 0;
  const isPlaying = videoState?.playState === "playing";
  const hasVideo = !!videoState?.videoId;
  const disabled = !canControl || !hasVideo;
  const rate = videoState?.playbackRate ?? 1;

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
        {/* Transparent overlay: prevents clicks on the YouTube player. Double-click
            toggles fullscreen. */}
        <div
          style={{ position: "absolute", inset: 0 }}
          onDoubleClick={onToggleFullscreen}
        />
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

        <div className="pl-settings" ref={settingsRef}>
          <button
            className="pl-btn pl-gear"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Settings"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            {rate !== 1 && <span className="rate">{rate}x</span>}
          </button>

          {menuOpen && (
            <div className="pl-menu">
              <div className="pl-menu-title">Playback speed</div>
              <div className="pl-menu-grid">
                {RATES.map((r) => (
                  <button
                    key={r}
                    className={r === rate ? "active" : ""}
                    disabled={!canControl || !hasVideo}
                    onClick={() => onSetRate(r)}
                  >
                    {r === 1 ? "Normal" : `${r}x`}
                  </button>
                ))}
              </div>
              <small>
                {canControl
                  ? "Speed applies to everyone in the room."
                  : "Only the host and moderators can change the speed for the room."}
              </small>

              <div className="pl-menu-title">Subtitles (only for you)</div>
              <div className="pl-menu-grid">
                <button className={!captionsOn ? "active" : ""} onClick={() => setCaptions(false)}>
                  Off
                </button>
                <button
                  className={captionsOn ? "active" : ""}
                  disabled={!hasVideo}
                  onClick={() => setCaptions(true)}
                >
                  On
                </button>
              </div>
              {captionNote && <small>{captionNote}</small>}

              <div className="pl-menu-title">Quality</div>
              <small>
                Chosen automatically by YouTube based on your connection and player size.
                Embedded players cannot set it manually.
              </small>
            </div>
          )}
        </div>

        <button
          className="pl-btn pl-fs"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            {isFullscreen ? (
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
            ) : (
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            )}
          </svg>
        </button>
      </div>

      {!canControl && (
        <p className="pl-note">Only the host and moderators can control playback.</p>
      )}
    </div>
  );
}