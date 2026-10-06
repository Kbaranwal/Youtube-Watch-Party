import { useCallback, useEffect, useRef, useState } from "react";

// Fullscreen for one element. Uses the browser Fullscreen API when it is available; on
// browsers without it (for example iPhone Safari) it falls back to a CSS full-viewport
// overlay.
export function useFullscreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState(false);
  const [fallback, setFallback] = useState(false);

  // Track the browser's own fullscreen state (it also changes when the user presses Esc).
  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Fallback mode: close on Esc and stop the page behind from scrolling.
  useEffect(() => {
    if (!fallback) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFallback(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [fallback]);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fallback) {
      setFallback(false);
      return;
    }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* fall back to the overlay below */
      }
    }
    setFallback(true);
  }, [fallback]);

  return { ref, isFullscreen: native || fallback, fallback, toggle };
}