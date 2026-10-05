import asyncio
import secrets
import string
from typing import Callable

from database import Database
from models import Participant, Role
from room import CHAT_HISTORY_LIMIT, Room


class RoomManager:
    """Keeps active rooms in memory and loads them from PostgreSQL on demand."""

    def __init__(self, db: Database):
        self.db = db
        self.rooms: dict[str, Room] = {}
        # Called with a room right after it is restored from the database.
        self.on_restore: Callable[[Room], None] | None = None
        self._lock = asyncio.Lock()

    async def create_room(self) -> Room:
        alphabet = string.ascii_uppercase + string.digits
        while True:
            code = "".join(secrets.choice(alphabet) for _ in range(6))
            if code in self.rooms:
                continue
            if await self.db.create_room(code):  # False if the code exists in the DB
                break
        room = Room(code)
        self.rooms[code] = room
        return room

    async def get_room(self, room_id: str) -> Room | None:
        room_id = room_id.upper()
        room = self.rooms.get(room_id)
        if room:
            return room

        # Not in memory (e.g. after a server restart): try the database.
        async with self._lock:
            room = self.rooms.get(room_id)  # another request may have loaded it
            if room:
                return room
            data = await self.db.load_room(room_id, CHAT_HISTORY_LIMIT)
            if not data:
                return None
            room = self._restore(data)
            self.rooms[room_id] = room
        if self.on_restore:
            self.on_restore(room)
        return room

    def unload_room(self, room_id: str):
        """Drop a room from memory. Its data stays in the database."""
        self.rooms.pop(room_id, None)

    def _restore(self, data: dict) -> Room:
        room = Room(data["room_id"])
        room.video_id = data["video_id"]
        # Playback always resumes paused at the last saved position.
        room.set_state(play_state="paused", current_time=data["video_time"])
        room.chat.extend(data["messages"])
        for row in data["participants"]:
            room.participants[row["user_id"]] = Participant(
                user_id=row["user_id"],
                username=row["username"],
                role=Role(row["role"]),
                websocket=None,  # nobody is connected yet
                token_hash=row["token_hash"],
            )
        return room