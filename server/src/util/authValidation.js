// Pure auth validators — unit-tested without a DB or server.

// Returns an error message, or null when valid.
export function validateUsername(username) {
  if (typeof username !== "string" || !username.trim()) {
    return "username is required";
  }
  const u = username.trim();
  if (u.length < 3 || u.length > 30) return "username must be 3–30 characters";
  if (!/^[a-z0-9_]+$/i.test(u)) return "username: letters, digits and underscore only";
  return null;
}

// Returns an error message, or null when valid.
export function validatePassword(password) {
  if (typeof password !== "string" || !password) return "password is required";
  if (password.length < 6) return "password must be at least 6 characters";
  if (password.length > 128) return "password must be at most 128 characters";
  return null;
}
