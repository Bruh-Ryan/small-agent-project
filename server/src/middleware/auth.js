// 401 unless the session carries a logged-in user. Applied to /api/ask,
// /api/sessions, and /api/auth/me.
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}
