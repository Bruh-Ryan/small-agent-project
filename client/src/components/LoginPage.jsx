import { useState } from "react";
import { login, register } from "../api.js";

// Full-screen login/register card shown whenever there is no session.
// Server-side validation errors (400/401/409/503) render inline as-is.
export default function LoginPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function switchMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fn = mode === "login" ? login : register;
      const { user } = await fn(username.trim(), password);
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Wikipedia Agent</h1>
        <p className="login-sub">
          {mode === "login"
            ? "Sign in to see your conversations"
            : "Create an account to keep your chats"}
        </p>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <label className="login-field">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="login-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
          />
        </label>

        <button className="login-submit" disabled={busy} type="submit">
          {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
        </button>

        <button className="login-toggle" type="button" onClick={switchMode}>
          {mode === "login"
            ? "New here? Create an account"
            : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
