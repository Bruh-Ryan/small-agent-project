import mongoose from "mongoose";

const { Schema, model } = mongoose;

// Wikipedia response cache in the `wiki_cache` collection (same Atlas DB).
// `expiresAt` is indexed with expireAfterSeconds: 0, so MongoDB deletes the
// document the moment it becomes stale — no cron job needed. TTL is chosen
// per key: incumbent data (current office holders) expires in 24h, general
// encyclopedic content in 7 days.
const wikiCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "wiki_cache" } // mongoose would otherwise pluralize to "wikicaches"
);

wikiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WikiCache = model("WikiCache", wikiCacheSchema);

export const TTL_24H_MS = 24 * 60 * 60 * 1000;
export const TTL_7D_MS = 7 * 24 * 60 * 60 * 1000;

// Cache lifetime by key type: `incumbent|...` answers change with elections,
// everything else is slow-moving encyclopedic content.
export function ttlFor(key) {
  return key.startsWith("incumbent|") ? TTL_24H_MS : TTL_7D_MS;
}
