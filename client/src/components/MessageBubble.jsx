import ReactMarkdown from "react-markdown";
import PlanPanel from "./PlanPanel.jsx";

export default function MessageBubble({ msg }) {
  if (msg.role === "user") {
    return <div className="bubble user">{msg.text}</div>;
  }
  return (
    <div className="bubble assistant">
      <div className="answer-md">
        <ReactMarkdown>{msg.text}</ReactMarkdown>
      </div>
      {msg.debug && <PlanPanel debug={msg.debug} />}
    </div>
  );
}
