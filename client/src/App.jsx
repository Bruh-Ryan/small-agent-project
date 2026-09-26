import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import { ask, listSessions, getSession, deleteSession } from "./api";
import SessionSidebar from "./components/SessionSidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import Composer from "./components/Composer.jsx";
import "./App.css";

// One chat view; mounted for both "/" and "/session/:sessionId".
// Session id comes from the route param (null on the new-chat route).
function ChatArea({ messages, setMessages, pending, error, onAsk }) {
  const { sessionId } = useParams();
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    getSession(sessionId)
      .then((chat) => {
        if (!cancelled) setMessages(chat.messages);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, setMessages]);

  return (
    <main className="chat">
      <ChatWindow
        messages={messages}
        pending={pending}
        historyLoading={historyLoading}
        onExample={(q) => onAsk(q, sessionId || null, setMessages)}
      />
      {error && <div className="error-banner">{error}</div>}
      <Composer
        busy={pending}
        onSubmit={(q) => onAsk(q, sessionId || null, setMessages)}
      />
    </main>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sidebarError, setSidebarError] = useState("");

  const activeId =
    location.pathname.match(/^\/session\/([^/]+)$/)?.[1] || null;

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
      setSidebarError("");
    } catch (err) {
      setSidebarError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Runs the agent: optimistic user bubble → answer bubble with debug payload.
  const handleAsk = useCallback(
    async (query, sessionId, setMsgs) => {
      setError("");
      setMsgs((m) => [...m, { role: "user", text: query }]);
      setPending(true);
      try {
        const res = await ask(query, sessionId);
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: res.answer,
            debug: {
              plan: res.plan,
              tokenBudget: res.tokenBudget,
              searchTitles: res.searchTitles,
              terms: res.terms,
              fetched: res.fetched,
              skipped: res.skipped,
              context: res.context,
              durationMs: res.durationMs,
            },
          },
        ]);
        if (res.sessionId && res.sessionId !== sessionId) {
          navigate(`/session/${res.sessionId}`, { replace: true });
        }
        refreshSessions();
      } catch (err) {
        setError(err.message);
      } finally {
        setPending(false);
      }
    },
    [navigate, refreshSessions]
  );

  const handleSelect = (id) => navigate(`/session/${id}`);

  const handleNew = () => {
    setMessages([]);
    setError("");
    navigate("/");
  };

  const handleDelete = async (id) => {
    try {
      await deleteSession(id);
    } catch (err) {
      setError(err.message);
    }
    refreshSessions();
    if (id === activeId) {
      setMessages([]);
      navigate("/");
    }
  };

  return (
    <div className="layout">
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        loadError={sidebarError}
      />
      <Routes>
        <Route
          path="/session/:sessionId"
          element={
            <ChatArea
              messages={messages}
              setMessages={setMessages}
              pending={pending}
              error={error}
              onAsk={handleAsk}
            />
          }
        />
        <Route
          path="*"
          element={
            <ChatArea
              messages={messages}
              setMessages={setMessages}
              pending={pending}
              error={error}
              onAsk={handleAsk}
            />
          }
        />
      </Routes>
    </div>
  );
}

export default App;
