import { useState } from "react";

export default function PlanPanel({ debug }) {
  const [open, setOpen] = useState(false);

  const summary = `Plan · ${debug.tokenBudget} tokens · ${
    debug.fetched?.length || 0
  } source${(debug.fetched?.length || 0) === 1 ? "" : "s"} · ${debug.durationMs}ms`;

  return (
    <div className="plan-panel">
      <button
        className="plan-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} {summary}
      </button>

      {open && (
        <div className="plan-body">
          <section>
            <h4>Planner output</h4>
            <pre>{debug.plan}</pre>
          </section>

          <section>
            <h4>Search terms</h4>
            <div className="tag-row">
              {(debug.terms || []).map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </section>

          <section>
            <h4>Fetched articles</h4>
            {debug.fetched?.length ? (
              <ul className="fetched-list">
                {debug.fetched.map((f) => (
                  <li key={f.title}>
                    <span className="fetched-title">{f.title}</span>
                    <span className="fetched-chars">{f.chars} chars</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No articles fetched</p>
            )}
            {debug.skipped?.length > 0 && (
              <p className="muted">Skipped: {debug.skipped.join(", ")}</p>
            )}
          </section>

          <section>
            <h4>Gathered context ({(debug.context || "").length} chars)</h4>
            <pre className="context-pre">{debug.context}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
