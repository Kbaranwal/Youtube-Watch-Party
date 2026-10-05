import secrets
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from database import Database
from handlers import MessageHandler
from models import Participant, Role, hash_token
from room import STAFF_ROLES
from room_manager import RoomManager

db = Database()
manager = RoomManager(db)
handler = MessageHandler(manager, db)
manager.on_restore = handler.start_grace_for_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()  # create the pool and the tables (if they do not exist)
    yield
    await db.close()


app = FastAPI(title="YouTube Watch Party", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


@app.post("/rooms")
async def create_room():
    room = await manager.create_room()
    return {"roomId": room.room_id}


@app.get("/rooms/{room_id}")
async def room_exists(room_id: str):
    if not await manager.get_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"roomId": room_id.upper()}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket, room_id: str, username: str = "Guest", token: str = ""
):
    await websocket.accept()
    room = await manager.get_room(room_id)
    if not room:
        await websocket.close(code=4004)
        return

    # A valid token means this browser is coming back (refresh / reconnect / restart).
    participant = room.find_by_token(token) if token else None
    is_returning = participant is not None
    new_token: str | None = None

    if is_returning:
        await handler.reconnect(participant, websocket)
    else:
        new_token = secrets.token_urlsafe(16)
        participant = Participant(
            user_id=uuid.uuid4().hex[:8],
            username=username[:30],
            role=Role.PARTICIPANT,
            websocket=websocket,
            token_hash=hash_token(new_token),
        )
        room.add_participant(participant)  # the first user to join becomes the host
        await db.save_participant(room.room_id, participant)

    # Send the user their identity, the room state and the recent chat history.
    # The raw token is sent only once, to a brand-new participant.
    is_staff = participant.role in STAFF_ROLES
    await websocket.send_json({"type": "joined", "userId": participant.user_id,
                               "token": new_token,
                               "role": participant.role.value,
                               "roomId": room.room_id,
                               "participants": room.participants_list(),
                               "state": room.state_dict(),
                               "chat": list(room.chat),
                               # Pending video requests: the full list for host/moderators,
                               # and the user's own pending request (if any) for everyone.
                               "requests": room.requests_list() if is_staff else [],
                               "myRequest": room.request_of(participant.user_id)})
    # Announce only genuinely new users; a returning user never left the room.
    if not is_returning:
        await room.broadcast({"type": "user_joined", "username": participant.username,
                              "userId": participant.user_id, "role": participant.role.value,
                              "participants": room.participants_list()})
    try:
        while True:
            data = await websocket.receive_json()
            await handler.handle(room, participant, data)
    except Exception:
        pass  # client disconnected or sent invalid JSON
    finally:
        await handler.disconnect(room, participant, websocket)