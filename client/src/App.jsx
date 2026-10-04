import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { ask, listSessions, getSession, deleteSession, getModels, me, logout } from "./api";
import SessionSidebar from "./components/SessionSidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import Composer from "./components/Composer.jsx";
import LoginPage from "./components/LoginPage.jsx";
import LandingPage from "./components/LandingPage.jsx";
import "./App.css";

// Shown until GET /api/models succeeds — keeps the picker visible always.
const MODEL_FALLBACK = [{ id: "openai/gpt-4o", label: "GPT-4o (default)" }];

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

  // Session state: null until GET /api/auth/me settles (401 → logged out).
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    me()
      .then((r) => {
        if (!cancelled) setUser(r.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any API 401 (expired session mid-use, logged out elsewhere) → login.
  const dropToLogin = useCallback(() => {
    setUser(null);
    setSessions([]);
    setMessages([]);
    setError("");
    setSidebarError("");
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    window.addEventListener("wiki:unauthorized", dropToLogin);
    return () => window.removeEventListener("wiki:unauthorized", dropToLogin);
  }, [dropToLogin]);

  // Model picker: curated list from /api/models, choice persisted locally.
  // Fallback entry guarantees the <select> always renders even if the API
  // is unreachable (the old hard gate made the picker vanish silently).
  const [models, setModels] = useState(MODEL_FALLBACK);
  const [model, setModel] = useState(
    () => localStorage.getItem("wiki:model") || MODEL_FALLBACK[0].id
  );
  const [modelsError, setModelsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    (async () => {
      while (attempt < 3 && !cancelled) {
        attempt++;
        try {
          const { models: list, default: def } = await getModels();
          if (cancelled) return;
          setModels(list);
          setModelsError("");
          const saved = localStorage.getItem("wiki:model");
          setModel(saved && list.some((m) => m.id === saved) ? saved : def);
          return;
        } catch {
          if (cancelled) return;
          // Server may still be starting — retry before giving up.
          if (attempt >= 3) {
            setModelsError("Model list unavailable — showing default only");
            return;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModelChange = useCallback((id) => {
    setModel(id);
    localStorage.setItem("wiki:model", id);
  }, []);

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

  // Load the list only when authenticated; clear it when not.
  useEffect(() => {
    if (user) refreshSessions();
  }, [user, refreshSessions]);

  // Runs the agent: optimistic user bubble → answer bubble with debug payload.
  const handleAsk = useCallback(
    async (query, sessionId, setMsgs) => {
      setError("");
      setMsgs((m) => [...m, { role: "user", text: query }]);
      setPending(true);
      try {
        const res = await ask(query, sessionId, model || undefined);
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: res.answer,
            debug: {
              plan: res.plan,
              tokenBudget: res.tokenBudget,
              depth: res.depth,
              recency: res.recency,
              model: res.model,
              requestedModel: res.requestedModel,
              fallback: res.fallback,
              allFailed: res.allFailed,
              failures: res.failures,
              searchTitles: res.searchTitles,
              followUp: res.followUp,
              rewrittenQuery: res.rewrittenQuery,
              inheritedTitles: res.inheritedTitles,
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
    [navigate, refreshSessions, model]
  );

  const handleSelect = (id) => navigate(`/session/${id}`);

  const handleNew = () => {
    setMessages([]);
    setError("");
    navigate("/");
  };

  // Successful login/register: adopt the user and return to where they
  // were headed (or "/" for a fresh visit).
  const loginFrom =
    location.pathname && location.pathname !== "/login" ? location.pathname : "/";
  const handleAuth = useCallback(
    (u) => {
      setUser(u);
      // Landing sends { from } so deep links (/session/:id) survive the hop.
      const from = location.state?.from;
      const target = from && from !== "/login" ? from : loginFrom;
      navigate(target, { replace: true });
    },
    [navigate, loginFrom, location.state]
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      // Even if the server call fails, drop the local session anyway.
    }
    dropToLogin();
    navigate("/login", { replace: true });
  }, [dropToLogin, navigate]);

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

  if (authLoading) {
    return <div className="auth-loading">Loading…</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onAuth={handleAuth} />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  return (
    <div className="layout">
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        loadError={sidebarError}
        models={models}
        model={model}
        onModelChange={handleModelChange}
        modelsError={modelsError}
        user={user}
        onLogout={handleLogout}
      />
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
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
