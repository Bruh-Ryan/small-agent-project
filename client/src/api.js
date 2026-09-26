const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    // Network-level failure (server down, proxy 502, etc.)
    throw new Error(
      "API unreachable — is the backend running? (npm run dev:server)"
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function ask(query, sessionId) {
  return request("/api/ask", {
    method: "POST",
    body: JSON.stringify({ query, sessionId }),
  });
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
