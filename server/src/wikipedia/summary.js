import { httpGetWithRetry } from "./http.js";
import { parseJsonSafe } from "../agent/llm.js";
import { resolveWikipediaTitle } from "./search.js";
import { withCache, cacheKey } from "./cache.js";

const API = "https://en.wikipedia.org/w/api.php";

// MediaWiki hard-caps `exchars` at ~1200 for non-continuous extracts (the
// original Java agent silently hit this too — its "exchars=4000" always
// returned ~1200 chars). So we request UN-capped text and slice ourselves.
const FULL_EXTRACT_CHARS = 7000;
const LEAD_EXTRACT_CHARS = 4000;

export function capExtract(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...[truncated]";
}

function isUsable(summary) {
  return (
    summary &&
    summary.trim() &&
    !summary.startsWith("No Wikipedia article found") &&
    !summary.startsWith("No extract found")
  );
}

// Shared URL builder for both extract depths.
// - lead : exintro=true → intro section only (uncapped, we slice)
// - full : NO exintro   → whole-article plaintext (uncapped, we slice)
export function buildExtractUrl(title, { full = false } = {}) {
  return (
    `${API}?action=query&prop=extracts` +
    `&explaintext=true&redirects=1` +
    (full ? "" : "&exintro=true") +
    `&titles=${encodeURIComponent(title)}` +
    `&format=json`
  );
}

async function fetchExtract(searchQuery, { full, maxAgeMs }) {
  const exactTitle = await resolveWikipediaTitle(searchQuery);
  if (exactTitle == null) {
    return { resolvedTitle: searchQuery, summary: `No Wikipedia article found for: ${searchQuery}` };
  }

  const key = cacheKey(full ? "summary-full" : "summary", exactTitle);
  return withCache(
    key,
    async () => {
      const body = await httpGetWithRetry(buildExtractUrl(exactTitle, { full }));
      const json = parseJsonSafe(body);
      if (!json || !json.query || !json.query.pages) {
        return { resolvedTitle: exactTitle, summary: "No extract found (bad response)." };
      }

      let resolvedTitle = exactTitle;
      let extract = "";
      for (const page of Object.values(json.query.pages)) {
        if (page.title) resolvedTitle = page.title;
        if (page.extract) extract = page.extract;
      }

      if (!extract) {
        return { resolvedTitle, summary: "No extract found." };
      }
      extract = capExtract(
        extract,
        full ? FULL_EXTRACT_CHARS : LEAD_EXTRACT_CHARS
      );
      return { resolvedTitle, summary: extract };
    },
    { cacheable: (r) => isUsable(r.summary), maxAgeMs } // never cache failures
  );
}

// Port of Java fetchWikipediaSummary(): lead section as plain prose.
// `opts.maxAgeMs` (recency queries) rejects cache entries older than 24h.
export async function fetchWikipediaSummary(searchQuery, exSentences = 25, opts = {}) {
  return fetchExtract(searchQuery, { full: false, maxAgeMs: opts.maxAgeMs });
}

// Phase 5B: whole-article plaintext (capped) for DEPTH: full queries —
// gives the answerer career/season/history material instead of the lead
// it may have already used in an earlier turn.
export async function fetchWikipediaFullExtract(searchQuery, opts = {}) {
  return fetchExtract(searchQuery, { full: true, maxAgeMs: opts.maxAgeMs });
}
