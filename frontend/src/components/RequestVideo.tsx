import { useState } from "react";
import type { MyRequest } from "../hooks/useRoomSocket";

interface Props {
  myRequest: MyRequest | null;
  onRequest: (video: string) => void;
  onDismiss: () => void;
}

// Shown to participants: they cannot change the video, but they can ask for it.
export default function RequestVideo({ myRequest, onRequest, onDismiss }: Props) {
  const [input, setInput] = useState("");

  function submit() {
    const v = input.trim();
    if (!v) return;
    onRequest(v);
    setInput("");
  }

  const pending = myRequest?.status === "pending";

  return (
    <div className="request-box">
      <div className="row">
        <input
          value={input}
          placeholder="Request a video: paste a YouTube link"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="primary" style={{ whiteSpace: "nowrap" }} onClick={submit}>
          {pending ? "Replace request" : "Request video"}
        </button>
      </div>

      {myRequest && (
        <div className={`request-status ${myRequest.status}`}>
          <span>
            {myRequest.status === "pending" &&
              "Request sent. Waiting for the host or a moderator to approve."}
            {myRequest.status === "approved" &&
              `Approved by ${myRequest.by}. Your video has been loaded.`}
            {myRequest.status === "rejected" &&
              `${myRequest.by} declined your request.`}
          </span>
          {!pending && <button onClick={onDismiss}>Dismiss</button>}
        </div>
      )}
    </div>
  );
}