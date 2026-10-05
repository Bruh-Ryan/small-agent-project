import mongoose from "mongoose";
import crypto from "node:crypto";

const { Schema, model } = mongoose;

// Temporary landing-page queries awaiting signup. The pipeline NEVER runs for
// these until a registered user consumes the token (deferred execution —
// anonymous callers can't burn LLM quota). Single-use, 8-minute TTL.
const pendingQuerySchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    query: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
    // MongoDB deletes the document the moment it goes stale (same pattern as
    // wiki_cache). No cron needed.
    expiresAt: { type: Date, required: true },
  },
  { collection: "pending_queries" }
);

pendingQuerySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PENDING_TTL_MS = 8 * 60 * 1000; // 8 minutes
export const MAX_PENDING_QUERY_CHARS = 500;

export function hashPendingToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function mintPendingToken() {
  return crypto.randomBytes(32).toString("hex");
}

export const PendingQuery = model("PendingQuery", pendingQuerySchema);
