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
  // skipAuthEvent: the boot-time me() probe expects a 401 when logged out —
  // that is normal state, not a session failure, so it must not bounce routing.
  const { skipAuthEvent, ...fetchOptions } = options;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...fetchOptions,
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
    if (res.status === 401 && !skipAuthEvent) {
      window.dispatchEvent(new Event("wiki:unauthorized"));
    }
    throw err;
  }
  return res.json();
}

export function ask(query, sessionId, model, pendingToken) {
  return request("/api/ask", {
    method: "POST",
    body: JSON.stringify({ query, sessionId, model, pendingToken }),
  });
}

// Landing-page handoff: hold a query for 8 minutes so signup can auto-send
// it. Public endpoint, no auth — and no LLM spend until consumed post-auth.
export function prepareQuery(query) {
  return request("/api/ask/prepare", {
    method: "POST",
    body: JSON.stringify({ query }),
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
  return request("/api/auth/me", { skipAuthEvent: true });
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
