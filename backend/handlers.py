import asyncio
import re

from fastapi import WebSocket

from database import Database
from models import Participant, Role
from permissions import can
from room import STAFF_ROLES, Room
from room_manager import RoomManager

# How long a disconnected user keeps their seat (and role) before being removed.
RECONNECT_GRACE_SECONDS = 30

# Emoji reactions allowed in a room (compared without the invisible variation selector).
ALLOWED_REACTIONS = {"\U0001F44D", "\u2764", "\U0001F602", "\U0001F62E", "\U0001F525", "\U0001F44F"}

# Playback speeds the room can use (the same list YouTube offers).
ALLOWED_RATES = {0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0}


def extract_video_id(value: str) -> str | None:
    """Extract an 11-character YouTube video ID from a URL or a raw ID."""
    value = value.strip()
    if re.fullmatch(r"[\w-]{11}", value):
        return value
    m = re.search(r"(?:v=|youtu\.be/|embed/|shorts/)([\w-]{11})", value)
    return m.group(1) if m else None


class MessageHandler:
    """Handles every incoming event: validate permission, update state, broadcast, persist."""

    def __init__(self, manager: RoomManager, db: Database):
        self.manager = manager
        self.db = db

    async def handle(self, room: Room, sender: Participant, data: dict):
        action = data.get("type")

        # Role enforcement happens on the server, never only in the UI.
        restricted = {"play", "pause", "seek", "change_video", "set_rate",
                      "approve_request", "reject_request",
                      "assign_role", "remove_participant", "transfer_host"}
        if action in restricted and not can(sender.role, action):
            return await self._error(
                sender, f"Permission denied: your role cannot perform '{action}'."
            )

        if action == "play":
            room.set_state(play_state="playing", current_time=data.get("time"))
            await room.broadcast({"type": "sync_state", **room.state_dict()})
            await self._save_state(room)

        elif action == "pause":
            room.set_state(play_state="paused", current_time=data.get("time"))
            await room.broadcast({"type": "sync_state", **room.state_dict()})
            await self._save_state(room)

        elif action == "seek":
            time_value = data.get("time")
            if not isinstance(time_value, (int, float)):
                return await self._error(sender, "A valid 'time' is required for seek.")
            room.set_state(current_time=float(time_value))
            await room.broadcast({"type": "sync_state", **room.state_dict()})
            await self._save_state(room)

        elif action == "change_video":
            video_id = extract_video_id(str(data.get("videoId", "")))
            if not video_id:
                return await self._error(sender, "Invalid YouTube URL or video ID.")
            room.set_state(video_id=video_id)
            await room.broadcast({"type": "sync_state", **room.state_dict()})
            await self._save_state(room)

        elif action == "set_rate":
            rate = data.get("rate")
            if not isinstance(rate, (int, float)) or float(rate) not in ALLOWED_RATES:
                return await self._error(sender, "Unsupported playback speed.")
            room.set_rate(float(rate))
            await room.broadcast({"type": "sync_state", **room.state_dict()})

        elif action == "request_video":
            await self._request_video(room, sender, data)

        elif action in ("approve_request", "reject_request"):
            await self._resolve_request(room, sender, data, approve=action == "approve_request")

        elif action == "assign_role":
            await self._assign_role(room, sender, data)

        elif action == "remove_participant":
            await self._remove_participant(room, sender, data)

        elif action == "transfer_host":
            await self._transfer_host(room, sender, data)

        elif action == "chat":
            text = str(data.get("message", "")).strip()[:500]
            if text:
                message = room.add_message(sender.user_id, sender.username, text)
                await room.broadcast({"type": "chat", **message})
                await self.db.save_message(room.room_id, message)

        elif action == "reaction":
            # Live-only: reactions are broadcast to everyone but never stored.
            emoji = str(data.get("emoji", ""))
            if emoji.replace("\ufe0f", "") in ALLOWED_REACTIONS:
                await room.broadcast({"type": "reaction", "userId": sender.user_id,
                                      "username": sender.username, "emoji": emoji})

        elif action == "leave_room":
            # Explicit leave: remove immediately, without the reconnect grace period.
            ws = sender.websocket
            await self.leave(room, sender)
            try:
                if ws is not None:
                    await ws.close(code=1000)
            except Exception:
                pass

        elif action == "ping":
            # Keep-alive: hosting platforms close idle WebSocket connections.
            await sender.websocket.send_json({"type": "pong"})

        else:
            await self._error(sender, f"Unknown event: {action}")

    async def _save_state(self, room: Room):
        await self.db.save_room_state(room.room_id, room.video_id, room.get_current_time())

    # ---------- video change requests ----------
    async def _request_video(self, room: Room, sender: Participant, data: dict):
        if sender.role in STAFF_ROLES:
            return await self._error(sender, "You can change the video directly.")
        video_id = extract_video_id(str(data.get("videoId", "")))
        if not video_id:
            return await self._error(sender, "Invalid YouTube URL or video ID.")
        room.add_request(sender, video_id)
        await self._send(sender, {"type": "request_status", "status": "pending",
                                  "videoId": video_id})
        await self._notify_staff(room)

    async def _resolve_request(self, room: Room, sender: Participant, data: dict,
                               approve: bool):
        request = room.pop_request(str(data.get("requestId", "")))
        if not request:
            return await self._error(
                sender, "Request not found. It may already have been handled."
            )
        if approve:
            room.set_state(video_id=request["videoId"])
            await room.broadcast({"type": "sync_state", **room.state_dict()})
            await self._save_state(room)
        requester = room.participants.get(request["userId"])
        if requester:
            await self._send(requester, {
                "type": "request_status",
                "status": "approved" if approve else "rejected",
                "videoId": request["videoId"],
                "by": sender.username,
            })
        await self._notify_staff(room)

    async def _notify_staff(self, room: Room):
        """Send the current list of pending requests to the host and moderators."""
        await room.broadcast_to_staff(
            {"type": "requests_updated", "requests": room.requests_list()}
        )

    # ---------- host-only actions ----------
    async def _assign_role(self, room: Room, sender: Participant, data: dict):
        target = room.participants.get(data.get("userId"))
        try:
            new_role = Role(data.get("role"))
        except ValueError:
            return await self._error(sender, "Invalid role.")
        if not target or new_role == Role.HOST:
            return await self._error(
                sender, "Invalid user or role. Use transfer_host to make someone the host."
            )
        if target.user_id == sender.user_id:
            return await self._error(sender, "You cannot change your own role.")
        room.assign_role(target.user_id, new_role)
        if new_role in STAFF_ROLES:
            room.remove_requests_of(target.user_id)  # staff do not need to request
        await room.broadcast({"type": "role_assigned", "userId": target.user_id,
                              "username": target.username, "role": new_role.value,
                              "participants": room.participants_list()})
        await self.db.save_participant(room.room_id, target)
        await self._notify_staff(room)  # a new moderator now sees pending requests

    async def _remove_participant(self, room: Room, sender: Participant, data: dict):
        target = room.participants.get(data.get("userId"))
        if not target or target.user_id == sender.user_id:
            return await self._error(sender, "Invalid user.")
        # Notify everyone (including the removed user), then close their connection.
        room.remove_participant(target.user_id)
        had_request = room.remove_requests_of(target.user_id)
        self._cancel_pending_leave(target)
        await room.broadcast({"type": "participant_removed", "userId": target.user_id,
                              "participants": room.participants_list()})
        await self.db.delete_participant(room.room_id, target.user_id)
        if had_request:
            await self._notify_staff(room)
        if target.websocket is not None:
            try:
                await target.websocket.send_json({"type": "removed"})
                await target.websocket.close(code=4001)
            except Exception:
                pass

    async def _transfer_host(self, room: Room, sender: Participant, data: dict):
        target = room.participants.get(data.get("userId"))
        if not target or target.user_id == sender.user_id:
            return await self._error(sender, "Invalid user.")
        target.role = Role.HOST
        sender.role = Role.MODERATOR
        room.remove_requests_of(target.user_id)
        await room.broadcast({"type": "role_assigned", "userId": target.user_id,
                              "username": target.username, "role": Role.HOST.value,
                              "participants": room.participants_list()})
        await self.db.save_participant(room.room_id, target)
        await self.db.save_participant(room.room_id, sender)
        await self._notify_staff(room)

    # ---------- connection lifecycle ----------
    async def reconnect(self, participant: Participant, websocket: WebSocket):
        """Attach a new socket to an existing participant (page refresh / network drop)."""
        self._cancel_pending_leave(participant)
        old = participant.websocket
        participant.websocket = websocket  # set first so the old socket's cleanup is ignored
        if old is not None:
            try:
                await old.close(code=4002)  # replaced by a newer connection
            except Exception:
                pass

    async def disconnect(self, room: Room, participant: Participant, websocket: WebSocket):
        """Called when a socket closes. The user gets a grace period before removal."""
        # Ignore if the participant is already gone, or already reconnected on a new socket.
        if room.participants.get(participant.user_id) is not participant:
            return
        if participant.websocket is not websocket:
            return
        participant.websocket = None
        participant.leave_task = asyncio.create_task(
            self._leave_after_grace(room, participant)
        )

    def start_grace_for_all(self, room: Room):
        """Called when a room is restored from the database. Nobody is connected yet, so
        every saved participant gets the usual grace period to reconnect."""
        for p in room.participants.values():
            if p.websocket is None and p.leave_task is None:
                p.leave_task = asyncio.create_task(self._leave_after_grace(room, p))

    async def _leave_after_grace(self, room: Room, participant: Participant):
        try:
            await asyncio.sleep(RECONNECT_GRACE_SECONDS)
        except asyncio.CancelledError:
            return
        if participant.websocket is None:  # still not back
            await self.leave(room, participant)

    def _cancel_pending_leave(self, participant: Participant):
        task = participant.leave_task
        if task and task is not asyncio.current_task():
            task.cancel()
        participant.leave_task = None

    async def leave(self, room: Room, participant: Participant):
        """Remove a participant for good and tell the room."""
        # If the participant was already removed (kicked), there is nothing to do.
        if room.participants.get(participant.user_id) is not participant:
            return
        self._cancel_pending_leave(participant)
        was_host = participant.role == Role.HOST
        room.remove_participant(participant.user_id)
        had_request = room.remove_requests_of(participant.user_id)
        await self.db.delete_participant(room.room_id, participant.user_id)
        if room.is_empty():
            self.manager.unload_room(room.room_id)  # data stays in the database
            return
        await room.broadcast({"type": "user_left", "username": participant.username,
                              "userId": participant.user_id,
                              "participants": room.participants_list()})
        if was_host:  # Room.remove_participant already promoted a new host.
            new_host = next(p for p in room.participants.values() if p.role == Role.HOST)
            await room.broadcast({"type": "role_assigned", "userId": new_host.user_id,
                                  "username": new_host.username, "role": Role.HOST.value,
                                  "participants": room.participants_list()})
            await self.db.save_participant(room.room_id, new_host)
        if was_host or had_request:
            await self._notify_staff(room)

    async def _send(self, p: Participant, message: dict):
        if p.websocket is not None:
            try:
                await p.websocket.send_json(message)
            except Exception:
                pass

    async def _error(self, p: Participant, message: str):
        await self._send(p, {"type": "error", "message": message})