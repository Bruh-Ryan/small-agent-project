import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble.jsx";

const EXAMPLES = [
  "What is a quasar?",
  "Who is the current president of the United States?",
  "List the 5 longest rivers with their lengths",
];

export default function ChatWindow({ messages, pending, historyLoading, onExample }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  if (!historyLoading && messages.length === 0 && !pending) {
    return (
      <div className="chat-empty">
        <h2>Ask Wikipedia anything</h2>
        <p>The agent plans, fetches articles, and answers with sources.</p>
        <div className="examples">
          {EXAMPLES.map((q) => (
            <button key={q} className="example-chip" onClick={() => onExample(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {messages.map((m, i) => (
        <MessageBubble key={i} msg={m} />
      ))}
      {pending && (
        <div className="bubble assistant pending">
          <span className="dot" /><span className="dot" /><span className="dot" />
          <span className="pending-label">Planning… fetching Wikipedia…</span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
