import type { VideoRequest } from "../hooks/useRoomSocket";

interface Props {
  requests: VideoRequest[];
  send: (msg: object) => void;
}

// Shown to the host and moderators: approve or reject participants' video requests.
export default function PendingRequests({ requests, send }: Props) {
  if (requests.length === 0) return null;

  return (
    <div className="card">
      <h3>Video requests ({requests.length})</h3>
      <ul className="req-list">
        {requests.map((r) => (
          <li key={r.id} className="req-item">
            <img
              src={`https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`}
              alt="Video thumbnail"
            />
            <div className="req-info">
              <div>
                <b>{r.username}</b> wants to watch this
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${r.videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open on YouTube
              </a>
              <div className="pactions">
                <button
                  className="primary"
                  onClick={() => send({ type: "approve_request", requestId: r.id })}
                >
                  Approve
                </button>
                <button
                  className="danger"
                  onClick={() => send({ type: "reject_request", requestId: r.id })}
                >
                  Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}