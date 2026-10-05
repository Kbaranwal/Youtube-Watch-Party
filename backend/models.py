import asyncio
import hashlib
from enum import Enum

from fastapi import WebSocket


class Role(str, Enum):
    HOST = "host"
    MODERATOR = "moderator"
    PARTICIPANT = "participant"


def hash_token(token: str) -> str:
    """Reconnect tokens are stored hashed, so a database leak does not expose them."""
    return hashlib.sha256(token.encode()).hexdigest()


class Participant:
    """A user in a watch party room.

    `websocket` is None while the user is temporarily disconnected (for example during
    a page refresh or a server restart). `token_hash` identifies the browser that owns
    this seat; the raw token is only ever held by that browser.
    """

    def __init__(
        self,
        user_id: str,
        username: str,
        role: Role,
        websocket: WebSocket | None,
        token_hash: str,
    ):
        self.user_id = user_id
        self.username = username
        self.role = role
        self.websocket = websocket
        self.token_hash = token_hash
        self.leave_task: asyncio.Task | None = None  # pending removal after a disconnect

    def to_dict(self) -> dict:
        # Only public fields are exposed (no websocket, no token).
        return {
            "userId": self.user_id,
            "username": self.username,
            "role": self.role.value,
        }