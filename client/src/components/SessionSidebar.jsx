import { useState } from "react";

// Models arrive already grouped in provider order; rebuild the grouping from
// the provider field so a flat/fallback list still renders sensibly.
function groupByProvider(models) {
  const groups = [];
  const index = new Map();
  for (const m of models) {
    const key = m.provider || "";
    if (!index.has(key)) {
      index.set(key, []);
      groups.push([key, index.get(key)]);
    }
    index.get(key).push(m);
  }
  return groups;
}

export default function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loadError,
  models = [],
  model = "",
  onModelChange,
  modelsError = "",
  user = null,
  onLogout,
}) {
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

      <label className="model-picker" title="Model used for planning and answers">
        <span>Model</span>
        <select
          value={model}
          aria-label="Model"
          onChange={(e) => onModelChange(e.target.value)}
        >
          {groupByProvider(models).map(([provider, items]) =>
            items.length === 1 && !provider ? (
              <option key={items[0].id} value={items[0].id}>
                {items[0].label}
              </option>
            ) : (
              <optgroup key={provider} label={items[0].providerLabel || provider}>
                {items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            )
          )}
        </select>
      </label>
      {modelsError && <p className="sidebar-error picker-error">{modelsError}</p>}

      <nav className="session-list">
        {loadError && <p className="sidebar-error">{loadError}</p>}
        {!loadError && sessions.length === 0 && (
          <p className="sidebar-empty">No conversations yet</p>
        )}
        {sessions.map((s) => (
          <div
            key={s._id}
            className={`session-item ${s._id === activeId ? "active" : ""}`}
            title={s.title}
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

      {user && (
        <div className="sidebar-footer">
          <span className="user-name" title={user.username}>
            @{user.username}
          </span>
          <button className="logout-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </aside>
  );
}
