import ReactMarkdown from "react-markdown";
import PlanPanel from "./PlanPanel.jsx";

export default function MessageBubble({ msg }) {
  if (msg.role === "user") {
    return <div className="bubble user">{msg.text}</div>;
  }
  const allFailed = Boolean(msg.debug?.allFailed);
  return (
    <div className={allFailed ? "bubble assistant unavailable" : "bubble assistant"}>
      {allFailed && (
        <div className="unavailable-head">
          <span className="unavailable-icon" aria-hidden="true">⚠</span>
          <span>All providers unavailable</span>
        </div>
      )}
      <div className="answer-md">
        <ReactMarkdown>{msg.text}</ReactMarkdown>
      </div>
      {msg.debug && !allFailed && <PlanPanel debug={msg.debug} />}
    </div>
  );
}
