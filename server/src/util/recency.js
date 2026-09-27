// Recency detection & cache freshness (Phase 5C).
//
// Queries about CURRENT/LATEST information must not be served from a
// Wikipedia cache entry older than 24h — encyclopedic facts are stable, but
// "who leads X now" changes with elections, transfers, etc.

export const RECENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const RECENCY_PATTERN =
  /\b(current|currently|latest|recent|recently|now|today|tonight|this (?:year|month|season)|as of|status|present|ongoing|live|these days)\b/i;

// True when the user is asking about present-day state/news.
export function isRecencyQuery(query) {
  return RECENCY_PATTERN.test(String(query ?? ""));
}

// Pure freshness check used by the cache: a cached entry fetched at
// `fetchedAt` is fresh only if it is younger than `maxAgeMs`.
export function isFresh(fetchedAt, maxAgeMs, now = Date.now()) {
  if (!maxAgeMs) return true; // no age limit requested
  const fetched = new Date(fetchedAt).getTime();
  if (Number.isNaN(fetched)) return false;
  return now - fetched <= maxAgeMs;
}
