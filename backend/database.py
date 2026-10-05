import functools
import logging
import os
from datetime import datetime

import asyncpg
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env during local development

# Reuse uvicorn's logger so messages show up in the server console.
logger = logging.getLogger("uvicorn.error")

SCHEMA = """
CREATE TABLE IF NOT EXISTS rooms (
    room_id    TEXT PRIMARY KEY,
    video_id   TEXT,
    video_time DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
    room_id    TEXT NOT NULL REFERENCES rooms (room_id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    username   TEXT NOT NULL,
    role       TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id         BIGSERIAL PRIMARY KEY,
    room_id    TEXT NOT NULL REFERENCES rooms (room_id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    username   TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room_id, id);
"""

ROOM_TTL_DAYS = 7  # rooms inactive for this long are deleted at startup


def best_effort(default=None):
    """Make a database method safe: if the DB is not configured or a query fails,
    log the problem and return `default` instead of breaking real-time features."""

    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(self, *args, **kwargs):
            if self.pool is None:
                return default
            try:
                return await fn(self, *args, **kwargs)
            except Exception:
                logger.exception("Database error in %s", fn.__name__)
                return default

        return wrapper

    return decorator


class Database:
    """Thin PostgreSQL layer built on asyncpg (connection pool + raw SQL)."""

    def __init__(self):
        self.pool: asyncpg.Pool | None = None

    async def connect(self):
        url = os.getenv("DATABASE_URL")
        if not url:
            logger.warning("DATABASE_URL is not set: running without persistence.")
            return
        try:
            self.pool = await asyncpg.create_pool(url, min_size=1, max_size=5, timeout=10)
            async with self.pool.acquire() as conn:
                await conn.execute(SCHEMA)
                await conn.execute(
                    f"DELETE FROM rooms WHERE updated_at < now() - interval '{ROOM_TTL_DAYS} days'"
                )
            logger.info("Connected to PostgreSQL.")
        except Exception:
            logger.exception("Could not connect to PostgreSQL: running without persistence.")
            self.pool = None

    async def close(self):
        if self.pool:
            await self.pool.close()

    # ---------- rooms ----------
    @best_effort(default=True)
    async def create_room(self, room_id: str) -> bool:
        """Insert a new room. Returns False if this room code already exists."""
        result = await self.pool.execute(
            "INSERT INTO rooms (room_id) VALUES ($1) ON CONFLICT DO NOTHING", room_id
        )
        return result == "INSERT 0 1"

    @best_effort()
    async def load_room(self, room_id: str, chat_limit: int) -> dict | None:
        """Load a room with its participants and the most recent chat messages."""
        async with self.pool.acquire() as conn:
            room = await conn.fetchrow(
                "SELECT room_id, video_id, video_time FROM rooms WHERE room_id = $1",
                room_id,
            )
            if room is None:
                return None
            participants = await conn.fetch(
                "SELECT user_id, username, role, token_hash FROM participants "
                "WHERE room_id = $1 ORDER BY joined_at",
                room_id,
            )
            messages = await conn.fetch(
                """
                SELECT user_id, username, body, created_at FROM (
                    SELECT id, user_id, username, body, created_at
                    FROM messages WHERE room_id = $1 ORDER BY id DESC LIMIT $2
                ) recent ORDER BY id
                """,
                room_id,
                chat_limit,
            )
        return {
            "room_id": room["room_id"],
            "video_id": room["video_id"],
            "video_time": room["video_time"],
            "participants": [dict(r) for r in participants],
            "messages": [
                {
                    "userId": m["user_id"],
                    "username": m["username"],
                    "message": m["body"],
                    "createdAt": m["created_at"].isoformat(),
                }
                for m in messages
            ],
        }

    @best_effort()
    async def save_room_state(self, room_id: str, video_id: str | None, video_time: float):
        await self.pool.execute(
            "UPDATE rooms SET video_id = $2, video_time = $3, updated_at = now() "
            "WHERE room_id = $1",
            room_id,
            video_id,
            video_time,
        )

    # ---------- participants ----------
    @best_effort()
    async def save_participant(self, room_id: str, p):
        await self.pool.execute(
            """
            INSERT INTO participants (room_id, user_id, username, role, token_hash)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (room_id, user_id)
            DO UPDATE SET username = EXCLUDED.username, role = EXCLUDED.role
            """,
            room_id,
            p.user_id,
            p.username,
            p.role.value,
            p.token_hash,
        )

    @best_effort()
    async def delete_participant(self, room_id: str, user_id: str):
        await self.pool.execute(
            "DELETE FROM participants WHERE room_id = $1 AND user_id = $2",
            room_id,
            user_id,
        )

    # ---------- chat ----------
    @best_effort()
    async def save_message(self, room_id: str, message: dict):
        await self.pool.execute(
            "INSERT INTO messages (room_id, user_id, username, body, created_at) "
            "VALUES ($1, $2, $3, $4, $5)",
            room_id,
            message["userId"],
            message["username"],
            message["message"],
            datetime.fromisoformat(message["createdAt"]),
        )
        await self.pool.execute(
            "UPDATE rooms SET updated_at = now() WHERE room_id = $1", room_id
        )