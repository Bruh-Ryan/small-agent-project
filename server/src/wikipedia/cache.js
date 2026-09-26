import mongoose from "mongoose";
import { WikiCache, ttlFor } from "../models/WikiCache.js";

const DB_CONNECTED = () => mongoose.connection.readyState === 1;

export function cacheKey(kind, id) {
  return `${kind}|${id}`;
}

// Returns cached data or null (miss / DB down / expired). Never throws —
// caching must never break the agent pipeline.
export async function getCached(key) {
  if (!DB_CONNECTED()) return null;
  try {
    const doc = await WikiCache.findOne({ key }).lean();
    if (!doc) return null;
    // TTL monitor runs ~every 60s, so check staleness ourselves too.
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) return null;
    return doc.data;
  } catch (err) {
    console.warn(`[cache] read failed for ${key}: ${err.message}`);
    return null;
  }
}

// Stores data with a per-key expiry. Never throws; no-op when DB is down.
export async function setCached(key, data) {
  if (!DB_CONNECTED()) return;
  try {
    const now = new Date();
    await WikiCache.updateOne(
      { key },
      { $set: { key, data, fetchedAt: now, expiresAt: new Date(now.getTime() + ttlFor(key)) } },
      { upsert: true }
    );
  } catch (err) {
    console.warn(`[cache] write failed for ${key}: ${err.message}`);
  }
}

// Read-through cache: use stored value if present, otherwise call `fetchFn`,
// store its result (when cacheable) and return it.
export async function withCache(key, fetchFn, { cacheable = () => true } = {}) {
  const hit = await getCached(key);
  if (hit !== null) {
    console.log(`  [cache] hit ${key}`);
    return hit;
  }
  const value = await fetchFn();
  if (value != null && cacheable(value)) {
    await setCached(key, value);
  }
  return value;
}
