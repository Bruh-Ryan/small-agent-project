const BASE = import.meta.env.VITE_API_URL || "";

// 401s fire a window event so any caller can bounce the app to the login
// screen without threading an auth callback through every API function.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    // Network-level failure (server down, proxy 502, etc.)
    throw new ApiError(
      "API unreachable — is the backend running? (npm run dev:server)",
      0
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new ApiError(
      body.error || `${res.status} ${res.statusText}`,
      res.status
    );
    if (res.status === 401) {
      window.dispatchEvent(new Event("wiki:unauthorized"));
    }
    throw err;
  }
  return res.json();
}

export function ask(query, sessionId, model) {
  return request("/api/ask", {
    method: "POST",
    body: JSON.stringify({ query, sessionId, model }),
  });
}

export function getModels() {
  return request("/api/models");
}

export function listSessions() {
  return request("/api/sessions");
}

export function getSession(id) {
  return request(`/api/sessions/${id}`);
}

export function deleteSession(id) {
  return request(`/api/sessions/${id}`, { method: "DELETE" });
}

export function me() {
  return request("/api/auth/me");
}

export function login(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function register(username, password) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request("/api/auth/logout", { method: "POST" });
}
