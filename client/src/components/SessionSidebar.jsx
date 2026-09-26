import { useState } from "react";

export default function SessionSidebar({ sessions, activeId, onSelect, onNew, onDelete, loadError }) {
  const [confirmingId, setConfirmingId] = useState(null);

  function handleDelete(e, id) {
    e.stopPropagation();
    if (confirmingId === id) {
      setConfirmingId(null);
      onDelete(id);
    } else {
      setConfirmingId(id);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Wikipedia Agent</h1>
        <button className="new-chat" onClick={onNew}>+ New chat</button>
      </div>

      <nav className="session-list">
        {loadError && <p className="sidebar-error">{loadError}</p>}
        {!loadError && sessions.length === 0 && (
          <p className="sidebar-empty">No conversations yet</p>
        )}
        {sessions.map((s) => (
          <div
            key={s._id}
            className={`session-item ${s._id === activeId ? "active" : ""}`}
            onClick={() => onSelect(s._id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelect(s._id)}
          >
            <div className="session-info">
              <span className="session-title">{s.title}</span>
              <span className="session-meta">
                {new Date(s.updatedAt).toLocaleDateString()} · {s.messageCount} msg
              </span>
            </div>
            <button
              className={`delete-btn ${confirmingId === s._id ? "confirm" : ""}`}
              title={confirmingId === s._id ? "Click again to confirm" : "Delete conversation"}
              onClick={(e) => handleDelete(e, s._id)}
            >
              {confirmingId === s._id ? "Sure?" : "×"}
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
