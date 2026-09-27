import { useState } from "react";

export default function PlanPanel({ debug }) {
  const [open, setOpen] = useState(false);

  const summary = `Plan · ${debug.tokenBudget} tokens · ${
    debug.depth === "full" ? "full depth" : "lead depth"
  } · ${debug.fetched?.length || 0} source${
    (debug.fetched?.length || 0) === 1 ? "" : "s"
  } · ${debug.durationMs}ms${debug.followUp ? " · follow-up" : ""}${
    debug.recency ? " · recency ≤24h" : ""
  }${debug.model ? ` · ${debug.model}` : ""}${
    debug.fallback ? " · fell back" : ""
  }`;

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
          {debug.fallback && (
            <section>
              <h4>Provider fallback</h4>
              <p className="muted">
                Requested <code>{debug.requestedModel || debug.fallback.model}</code>{" "}
                was unavailable ({debug.fallback.reason}) — answered with{" "}
                <code>{debug.model}</code> instead.
              </p>
            </section>
          )}

          {debug.followUp && (
            <section>
              <h4>Follow-up detected</h4>
              <pre>{debug.rewrittenQuery || "(not rewritten)"}</pre>
              {debug.inheritedTitles?.length > 0 && (
                <>
                  <h4>Inherited from earlier turns</h4>
                  <div className="tag-row">
                    {debug.inheritedTitles.map((t) => (
                      <span key={t} className="tag inherited">{t}</span>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

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
