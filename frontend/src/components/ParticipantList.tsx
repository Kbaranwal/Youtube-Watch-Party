import type { Participant, Role } from "../hooks/useRoomSocket";

interface Props {
  participants: Participant[];
  myId: string | null;
  myRole: Role;
  send: (msg: object) => void;
}

const ROLE_ICON: Record<Role, string> = {
  host: "👑",
  moderator: "🛡️",
  participant: "",
};

// Derive a stable avatar color from the user id.
function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash} 55% 42%)`;
}

export default function ParticipantList({ participants, myId, myRole, send }: Props) {
  const isHost = myRole === "host";

  return (
    <div className="card">
      <h3>Participants ({participants.length})</h3>
      <ul className="plist">
        {participants.map((p) => (
          <li key={p.userId}>
            <div className="prow">
              <div className="pinfo">
                <div
                  className={`avatar ${p.role}`}
                  style={{ background: avatarColor(p.userId) }}
                >
                  {p.username.charAt(0).toUpperCase()}
                </div>
                <span className="pname">
                  {p.username}
                  {p.userId === myId && " (you)"}
                </span>
              </div>
              <span className={`badge ${p.role}`}>
                {ROLE_ICON[p.role]} {p.role}
              </span>
            </div>

            {/* Management controls are shown only to the host, and only for other users. */}
            {isHost && p.userId !== myId && (
              <div className="pactions">
                <select
                  value={p.role === "host" ? "participant" : p.role}
                  onChange={(e) =>
                    send({ type: "assign_role", userId: p.userId, role: e.target.value })
                  }
                >
                  <option value="participant">Participant</option>
                  <option value="moderator">Moderator</option>
                </select>
                <button
                  onClick={() => {
                    if (confirm(`Make ${p.username} the host? You will become a moderator.`))
                      send({ type: "transfer_host", userId: p.userId });
                  }}
                >
                  Make host
                </button>
                <button
                  className="danger"
                  onClick={() => send({ type: "remove_participant", userId: p.userId })}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}