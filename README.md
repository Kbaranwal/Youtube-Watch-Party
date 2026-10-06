<div align="center">

# 🎬 YouTube Watch Party

**Watch YouTube together, perfectly in sync.**

Create a room, invite your friends and watch one video in real time, with role-based control, live chat and emoji reactions.

![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![WebSockets](https://img.shields.io/badge/Realtime-WebSockets-8A2BE2)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Render](https://img.shields.io/badge/Deployed%20on-Render-46E3B7?logo=render&logoColor=white)

### [🚀 Live Demo](https://youtube-watch-party-1-aie0.onrender.com) &nbsp;·&nbsp; [📘 API Docs](https://youtube-watch-party-59ej.onrender.com/docs) &nbsp;·&nbsp; [🐞 Report an issue](https://github.com/Kbaranwal/Youtube-Watch-Party/issues)

</div>

> **Note:** the backend runs on a free hosting tier and goes to sleep after a period of inactivity. The first visit can take up to a minute to wake it up. After that everything is instant.

---

## 📑 Table of contents

- [Quick tour](#-quick-tour)
- [Features](#-features)
- [Assignment checklist](#-assignment-checklist)
- [Roles and permissions](#-roles-and-permissions)
- [Architecture](#-architecture)
- [How real-time sync works](#-how-real-time-sync-works)
- [WebSocket events](#-websocket-events)
- [Database](#-database)
- [Tech stack](#-tech-stack)
- [Project structure](#-project-structure)
- [Getting started](#-getting-started)
- [Deployment](#-deployment)
- [Design decisions and trade-offs](#-design-decisions-and-trade-offs)
- [Scaling](#-scaling)
- [Limitations and roadmap](#-limitations-and-roadmap)
- [Author](#-author)

---

## 🧭 Quick tour

1. Open the [live demo](https://youtube-watch-party-1-aie0.onrender.com), enter your name and click **Create Room**. You become the **Host**.
2. Click **Copy invite link** and open it in another browser window or on your phone. The second user joins as a **Participant**.
3. As Host, paste a YouTube link and click **Change video**. Press play, pause or drag the slider, and the other screen follows instantly.
4. Promote the second user to **Moderator** from the participant list and watch their controls switch on.
5. Try the chat, emoji reactions, playback speed and fullscreen.

## 📸 Screenshots

<p align="center">
  <img src="C:\Users\kbara\OneDrive\Desktop\Youtube Watch Party System\docs\home.png" width="48%" alt="Home page">
  <img src="C:\Users\kbara\OneDrive\Desktop\Youtube Watch Party System\docs\room-host.png" width="48%" alt="Watch room, Host view">
</p>
<p align="center">
  <img src="C:\Users\kbara\OneDrive\Desktop\Youtube Watch Party System\docs\room-participant.png" width="48%" alt="Participant view">
  <img src="C:\Users\kbara\OneDrive\Desktop\Youtube Watch Party System\docs\room-moderator.png" width="48%" alt="Moderator view">
</p>

---

## ✨ Features

### Core

- **Room-based model:** create a room, get a 6-character code and a shareable invite link.
- **Real-time synchronization:** play, pause, seek, change video and playback speed are identical for everyone in the room.
- **YouTube IFrame API:** an embedded, fully controllable player. YouTube's own controls are hidden and replaced with custom ones, so nobody can break the sync by clicking the video.
- **WebSockets:** bidirectional, low-latency communication between the browser and the FastAPI server.
- **Role-based access control:** Host, Moderator and Participant, enforced on the server for every event.
- **Host tools:** assign roles, remove participants and transfer the Host role.
- **Live participant list** with roles. Controls are disabled for users who are not allowed to use them.

### Extras

- 🙋 **Video change requests:** a Participant can request a video, and the Host or a Moderator approves or rejects it.
- 💬 **Live chat** in a WhatsApp-style layout (your messages on the right, others on the left) with history of the last 100 messages.
- 🔥 **Emoji reactions** that float over the video for everyone.
- 🔔 **Notifications** when someone joins, leaves or gets a new role.
- ⏩ **Playback speed** (0.25x to 2x), synced for the whole room.
- 🔤 **Subtitles** and ⛶ **fullscreen**, as personal settings that only affect your own screen.
- 🔁 **Refresh-proof identity:** a page refresh or a short network drop keeps your name and role.
- 💾 **Persistent rooms:** rooms, participants and chat history are saved in PostgreSQL and survive a server restart.
- 🧱 **Object-oriented backend:** `Room`, `Participant`, `MessageHandler`, `RoomManager` and `Database` classes.

---

## ✅ Assignment checklist

| Requirement | Status |
|---|---|
| Create a room (creator becomes Host) | ✅ |
| Join a room via link or code (joiner becomes Participant) | ✅ |
| Display participants with their roles | ✅ |
| Host can assign roles (Participant ↔ Moderator) | ✅ |
| Host can remove participants | ✅ |
| Playback controls restricted to Host and Moderator | ✅ |
| Play/pause, seek and change-video synchronization | ✅ |
| Backend validates permissions before processing events | ✅ |
| Role updates are broadcast to the room | ✅ |
| Participant requests, Host/Moderator approves changes | ✅ for video changes |
| Transfer Host (bonus) | ✅ |
| Text chat (bonus) | ✅ |
| Emoji reactions (bonus) | ✅ |
| OOP structure for the WebSocket server (bonus) | ✅ |
| Persistent rooms in a database (bonus) | ✅ PostgreSQL |
| Scalability design (bonus) | 📝 Designed, not implemented (see [Scaling](#-scaling)) |
| Authentication (bonus) | ❌ Not implemented |
| Deployed with a public URL | ✅ Render |

---

## 🔐 Roles and permissions

Permissions are checked **on the server** before any event is processed. Hiding a button in the UI is only a convenience, never the security.

| Action | 👑 Host | 🛡️ Moderator | 👤 Participant |
|---|:---:|:---:|:---:|
| Play, pause, seek | ✅ | ✅ | ❌ |
| Change video | ✅ | ✅ | ❌ (can send a request) |
| Change playback speed | ✅ | ✅ | ❌ |
| Approve or reject video requests | ✅ | ✅ | ❌ |
| Assign roles | ✅ | ❌ | ❌ |
| Remove participants | ✅ | ❌ | ❌ |
| Transfer Host | ✅ | ❌ | ❌ |
| Chat, reactions, fullscreen, subtitles | ✅ | ✅ | ✅ |

If the Host leaves, the next participant is promoted to Host automatically so a room never ends up without one.

---

## 🏗 Architecture

```mermaid
flowchart LR
    subgraph Browser["Browser (React + Vite)"]
        UI["UI components"]
        Hook["useRoomSocket hook"]
        YT["YouTube IFrame Player"]
    end
    subgraph Render["Render (FastAPI)"]
        API["HTTP API: create / check room"]
        WS["WebSocket endpoint /ws/room_id"]
        H["MessageHandler + permissions"]
        R["Room and Participant objects (in memory)"]
    end
    DB[("PostgreSQL on Neon")]

    UI --> Hook
    Hook -->|"POST /rooms"| API
    Hook <-->|"WebSocket events"| WS
    WS --> H
    H --> R
    R -->|"broadcast"| WS
    Hook --> YT
    R -.->|"rooms, participants, chat"| DB
```

**In short:**

1. The browser creates a room over **HTTP** (`POST /rooms`) and then opens a **WebSocket** to `/ws/{room_id}`.
2. Every action (play, pause, chat...) is sent as a small JSON event over the WebSocket.
3. The server's `MessageHandler` checks the sender's role, updates the in-memory `Room`, and **broadcasts** the result to everyone in the room.
4. Each browser applies the broadcast to its own YouTube player and UI.
5. Rooms, participants and chat are saved in PostgreSQL in the background, so they can be restored after a restart.

---

## ⏱ How real-time sync works

```mermaid
sequenceDiagram
    participant H as Host
    participant S as FastAPI server
    participant P as Participant

    H->>S: pause (WebSocket)
    S->>S: Is the sender a Host or Moderator?
    S->>S: Update the room state
    S-->>H: sync_state
    S-->>P: sync_state
    P->>P: YouTube player pauses
    P->>S: pause (WebSocket)
    S-->>P: error: permission denied
```

- **The server is the single source of truth.** It stores the video, the play state, the playback position and the speed.
- The current position is calculated on demand: `saved position + elapsed time × speed`. The server does not need to tick every second.
- On every `sync_state`, each client applies the state to its player. If its position drifts by **more than 1 second**, it jumps to the correct position.
- A user who joins late receives the current state inside the `joined` message, so they start in the right place.
- YouTube's controls are hidden and a transparent layer sits over the video. Only the custom controls (which send events to the server) can change playback.

---

## 📡 WebSocket events

Connection: `ws://<host>/ws/{room_id}?username=<name>&token=<optional reconnect token>`

### Client → Server

| Event | Payload | Who can send it |
|---|---|---|
| `play` / `pause` | `{ time }` | Host, Moderator |
| `seek` | `{ time }` | Host, Moderator |
| `change_video` | `{ videoId }` (URL or ID) | Host, Moderator |
| `set_rate` | `{ rate }` | Host, Moderator |
| `request_video` | `{ videoId }` | Participant |
| `approve_request` / `reject_request` | `{ requestId }` | Host, Moderator |
| `assign_role` | `{ userId, role }` | Host |
| `remove_participant` | `{ userId }` | Host |
| `transfer_host` | `{ userId }` | Host |
| `chat` | `{ message }` | Everyone |
| `reaction` | `{ emoji }` | Everyone |
| `leave_room` | `{}` | Everyone |
| `ping` | `{}` | Everyone (keep-alive) |

### Server → Client

| Event | Meaning |
|---|---|
| `joined` | Your identity, role, participants, video state, chat history and pending requests |
| `user_joined` / `user_left` | Someone joined or left (includes the updated participant list) |
| `role_assigned` | A role changed (includes the updated participant list) |
| `participant_removed` / `removed` | A user was removed / you were removed |
| `sync_state` | `{ videoId, playState, currentTime, playbackRate }` |
| `chat` / `reaction` | A chat message / an emoji reaction |
| `requests_updated` | Pending video requests (sent to Host and Moderators only) |
| `request_status` | Result of your own video request |
| `error` | A rejected action, for example *permission denied* |
| `pong` | Reply to `ping` |

### HTTP endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/rooms` | Create a room and return its code |
| `GET` | `/rooms/{room_id}` | Check that a room exists |

Interactive API docs are available at `/docs`.

---

## 🗄 Database

PostgreSQL (hosted on Neon) with three tables. They are created automatically on startup.

| Table | Purpose | Main columns |
|---|---|---|
| `rooms` | Room code and last video state | `room_id`, `video_id`, `video_time`, `updated_at` |
| `participants` | Who is in a room and their role | `room_id`, `user_id`, `username`, `role`, `token_hash` |
| `messages` | Chat history | `id`, `room_id`, `user_id`, `username`, `body`, `created_at` |

- Reconnect tokens are stored **hashed (SHA-256)**, never in plain text.
- Rooms inactive for 7 days are deleted at startup.
- Database access is **best effort**: if the database is unavailable, real-time features keep working from memory and only persistence is paused.

---

## 🧰 Tech stack

| Layer | Technology | Used for |
|---|---|---|
| Frontend | React, TypeScript, Vite | UI, room pages, custom video controls |
| Video | YouTube IFrame Player API | Embedded, scriptable player |
| Realtime | WebSockets (FastAPI + Starlette) | Two-way events between server and clients |
| Backend | Python, FastAPI, Uvicorn | HTTP API, WebSocket server, room logic |
| Database | PostgreSQL, asyncpg | Persistent rooms, participants and chat |
| Hosting | Render (backend and static site), Neon (database) | Public deployment |

---

## 📂 Project structure

```
Youtube-Watch-Party/
├── backend/
│   ├── main.py            # FastAPI app: HTTP routes and the WebSocket endpoint
│   ├── room.py            # Room class: participants, video state, chat, broadcast
│   ├── models.py          # Participant class, Role enum, token hashing
│   ├── permissions.py     # Which role may perform which action
│   ├── handlers.py        # MessageHandler: validate, update state, broadcast, persist
│   ├── room_manager.py    # Active rooms in memory, restore from the database
│   ├── database.py        # PostgreSQL layer (asyncpg), best-effort persistence
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/         # Home (create / join) and Room
│       ├── components/    # Player, Chat, ParticipantList, Reactions, requests...
│       ├── hooks/         # useRoomSocket (WebSocket + state), useFullscreen
│       └── config.ts      # Backend URL (env based)
└── README.md
```

---

## 🚀 Getting started

### Prerequisites

- Python 3.12 or newer
- Node.js 20 or newer
- (Optional) a PostgreSQL database. Without one, the app still works and keeps everything in memory.

### 1. Clone the repository

```bash
git clone https://github.com/Kbaranwal/Youtube-Watch-Party.git
cd Youtube-Watch-Party
```

### 2. Run the backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

Optional: create `backend/.env` to enable PostgreSQL.

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

Start the server:

```bash
uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000` (docs at `/docs`). With a database configured you will see `Connected to PostgreSQL.` in the console.

### 3. Run the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. In development the frontend talks to the backend on port `8000` of the same machine.

### Environment variables

| Variable | Where | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | Backend | No | PostgreSQL connection string. Without it, rooms live in memory only |
| `VITE_API_URL` | Frontend (build time) | Production | Public URL of the backend, for example `https://your-backend.onrender.com` |
| `PYTHON_VERSION` | Render | Recommended | Python version to build with, for example `3.12.7` |

> Never commit `.env` files. The repository ignores them.

---

## ☁️ Deployment

The app runs as two Render services plus a hosted database.

**Backend (Render Web Service)**

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Environment | `DATABASE_URL`, `PYTHON_VERSION` |

**Frontend (Render Static Site)**

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |
| Environment | `VITE_API_URL` = the backend URL |

**Database:** Neon PostgreSQL, in the same region as the backend (Singapore) to keep latency low.

Pushing to the `main` branch triggers an automatic redeploy.

---

## 🧠 Design decisions and trade-offs

- **Rooms live in memory, PostgreSQL is a backup.** In-memory state keeps real-time events fast. The database stores rooms, participants and chat so a restart does not lose them. After a restart a room is restored on first use, with the video paused at its last saved position.
- **Server-authoritative sync.** The server owns the video state, which makes late joiners and drift correction simple and keeps clients consistent.
- **Permissions on the server.** Every restricted event is validated before it changes any state. The UI only reflects the rules.
- **Refresh-proof identity without accounts.** On first join the browser receives a secret token (kept per tab). The server stores only its hash. After a refresh or a short disconnect the token restores the same user and role, and a 30-second grace period stops a refresh from kicking the Host out.
- **Custom player controls.** YouTube's built-in controls are hidden so nobody can change playback outside the sync rules.
- **Honest limits of the YouTube API.** YouTube no longer supports setting video quality from the embedded player API, so quality is chosen automatically by YouTube. Subtitles use an undocumented player module, so they are a best-effort personal setting.
- **Best-effort persistence.** A database problem never breaks live features. It is logged, and the app continues from memory.

---

## 📈 Scaling

The current deployment runs a **single backend instance**, which is enough for many concurrent rooms because WebSocket connections are mostly idle and every event only reaches one room. Scale testing has not been done yet.

To scale horizontally the design would be:

1. **Redis Pub/Sub** between servers. Each server publishes room events to a channel such as `room:ABC123` and every server delivers them to its own connected users.
2. **Room state in Redis** instead of process memory, so any server can serve any room.
3. A **load balancer** in front of the servers (or sticky routing by room code).
4. Sending **small participant updates** instead of the full list, to avoid quadratic growth in very large rooms.

---

## 🛣 Limitations and roadmap

- No authentication. Identity is a per-tab session token, so closing the tab starts a new identity.
- No rate limiting and no maximum room size yet.
- Pending video requests and emoji reactions are not persisted (they are short-lived).
- CORS is open for the demo and should be restricted to the frontend domain in production.
- Quality selection is not possible with YouTube embeds, and subtitles depend on the video having them.
- Free hosting means a cold start after inactivity.

**Ideas for next steps:** user accounts, rate limits and room size limits, Redis-backed scaling, a load test script, and unit tests for the permission rules.

---

## 👨‍💻 Author

**Krishna Baranwal**
B.Tech in Computer Science and Engineering (Data Science)

GitHub: [@Kbaranwal](https://github.com/Kbaranwal)

---

<div align="center">

If you liked this project, consider giving it a ⭐

</div>
