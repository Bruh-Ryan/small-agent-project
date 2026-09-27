import mongoose from "mongoose";
import { WikiCache, ttlFor } from "../models/WikiCache.js";
import { isFresh } from "../util/recency.js";

const DB_CONNECTED = () => mongoose.connection.readyState === 1;

export function cacheKey(kind, id) {
  return `${kind}|${id}`;
}

// Returns cached data or null (miss / DB down / expired / too old for
// maxAgeMs). `maxAgeMs` lets recency queries reject entries older than 24h
// even when the document TTL (7d) hasn't deleted them yet. Never throws.
export async function getCached(key, { maxAgeMs } = {}) {
  if (!DB_CONNECTED()) return null;
  try {
    const doc = await WikiCache.findOne({ key }).lean();
    if (!doc) return null;
    // TTL monitor runs ~every 60s, so check staleness ourselves too.
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) return null;
    // Age gate for "current/latest" queries — stale → refetch live.
    if (!isFresh(doc.fetchedAt, maxAgeMs)) {
      const ageH = Math.round((Date.now() - new Date(doc.fetchedAt).getTime()) / 3600000);
      console.log(`  [cache] stale (${ageH}h old) ${key} — refetching live`);
      return null;
    }
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
export async function withCache(key, fetchFn, { cacheable = () => true, maxAgeMs } = {}) {
  const hit = await getCached(key, { maxAgeMs });
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
