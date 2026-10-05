import asyncio
import secrets
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from models import Participant, Role, hash_token

CHAT_HISTORY_LIMIT = 100  # messages kept in memory per room and sent to new joiners
STAFF_ROLES = {Role.HOST, Role.MODERATOR}


class Room:
    """A watch party room: participants, shared video state, chat, requests, broadcasting."""

    def __init__(self, room_id: str):
        self.room_id = room_id
        self.participants: dict[str, Participant] = {}
        self.chat: deque[dict] = deque(maxlen=CHAT_HISTORY_LIMIT)
        self.requests: dict[str, dict] = {}    # pending "change video" requests
        self.video_id: str | None = None
        self.play_state: str = "paused"        # "playing" or "paused"
        self._time: float = 0.0                # last known playback position (seconds)
        self._updated_at: float = time.time()  # when that position was recorded

    # ---------- video state ----------
    def get_current_time(self) -> float:
        # While playing, add the time elapsed since the last update.
        if self.play_state == "playing":
            return self._time + (time.time() - self._updated_at)
        return self._time

    def set_state(self, play_state=None, current_time=None, video_id=None):
        if video_id is not None:
            self.video_id = video_id
            self._time = 0.0
            self.play_state = "paused"
        if current_time is not None:
            self._time = current_time
        if play_state is not None:
            self.play_state = play_state
        self._updated_at = time.time()

    def state_dict(self) -> dict:
        return {
            "videoId": self.video_id,
            "playState": self.play_state,
            "currentTime": self.get_current_time(),
        }

    # ---------- chat ----------
    def add_message(self, user_id: str, username: str, text: str) -> dict:
        message = {
            "userId": user_id,
            "username": username,
            "message": text,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        self.chat.append(message)
        return message

    # ---------- video change requests ----------
    def add_request(self, user: Participant, video_id: str) -> dict:
        self.remove_requests_of(user.user_id)  # one pending request per user
        request = {
            "id": uuid.uuid4().hex[:8],
            "userId": user.user_id,
            "username": user.username,
            "videoId": video_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        self.requests[request["id"]] = request
        return request

    def pop_request(self, request_id: str) -> dict | None:
        return self.requests.pop(request_id, None)

    def request_of(self, user_id: str) -> dict | None:
        for r in self.requests.values():
            if r["userId"] == user_id:
                return r
        return None

    def remove_requests_of(self, user_id: str) -> bool:
        """Remove a user's pending request. Returns True if one existed."""
        ids = [rid for rid, r in self.requests.items() if r["userId"] == user_id]
        for rid in ids:
            del self.requests[rid]
        return bool(ids)

    def requests_list(self) -> list[dict]:
        return list(self.requests.values())

    # ---------- participants ----------
    def add_participant(self, p: Participant):
        # The first person to join (the room creator) becomes the host.
        if not self.participants:
            p.role = Role.HOST
        self.participants[p.user_id] = p

    def find_by_token(self, token: str) -> Participant | None:
        """Find the participant that owns this reconnect token."""
        token_hash = hash_token(token)
        for p in self.participants.values():
            if secrets.compare_digest(p.token_hash, token_hash):
                return p
        return None

    def remove_participant(self, user_id: str):
        removed = self.participants.pop(user_id, None)
        # If the host leaves, promote someone else (prefer users who are online).
        if removed and removed.role == Role.HOST and self.participants:
            candidates = [p for p in self.participants.values() if p.websocket is not None]
            (candidates or list(self.participants.values()))[0].role = Role.HOST
        return removed

    def assign_role(self, user_id: str, role: Role) -> bool:
        p = self.participants.get(user_id)
        if not p or p.role == Role.HOST:
            return False
        p.role = role
        return True

    def participants_list(self) -> list[dict]:
        return [p.to_dict() for p in self.participants.values()]

    def is_empty(self) -> bool:
        return len(self.participants) == 0

    # ---------- broadcast ----------
    async def _send_many(self, targets: list[Participant], message: dict):
        async def _send(p: Participant):
            if p.websocket is None:
                return  # temporarily disconnected
            try:
                await p.websocket.send_json(message)
            except Exception:
                pass  # The connection is gone; the disconnect handler cleans up.

        # Send concurrently so one slow client does not block the rest.
        await asyncio.gather(*(_send(p) for p in targets))

    async def broadcast(self, message: dict):
        await self._send_many(list(self.participants.values()), message)

    async def broadcast_to_staff(self, message: dict):
        """Send only to the host and moderators."""
        staff = [p for p in self.participants.values() if p.role in STAFF_ROLES]
        await self._send_many(staff, message)

    async def send_to(self, user_id: str, message: dict):
        p = self.participants.get(user_id)
        if p and p.websocket is not None:
            await p.websocket.send_json(message)