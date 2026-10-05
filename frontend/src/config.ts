// In development the backend runs on port 8000 of the same machine. Using the page's
// hostname lets the app also work when opened from another device on the network.
// In production the frontend and backend are served from the same origin.
export const API_URL: string =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV
    ? `http://${window.location.hostname}:8000`
    : window.location.origin);

// http -> ws, https -> wss (a secure page must use wss)
export const WS_URL: string = API_URL.replace(/^http/, "ws");