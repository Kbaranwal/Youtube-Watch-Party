import type { FloatingReaction } from "../hooks/useRoomSocket";

export const REACTIONS = ["👍", "❤️", "😂", "😮", "🔥", "👏"];

// Row of emoji buttons shown under the video.
export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="reactions">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          className="reaction-btn"
          onClick={() => onReact(emoji)}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// Emojis that float up over the video when anyone in the room reacts.
export function FloatingReactions({ items }: { items: FloatingReaction[] }) {
  return (
    <div className="float-layer" aria-hidden="true">
      {items.map((r) => (
        <div key={r.id} className="float-emoji" style={{ left: `${r.left}%` }}>
          <span>{r.emoji}</span>
          <small>{r.username}</small>
        </div>
      ))}
    </div>
  );
}