import { httpGetWithRetry } from "./http.js";
import { parseJsonSafe } from "../agent/llm.js";
import { withCache, cacheKey } from "./cache.js";

const API = "https://en.wikipedia.org/w/api.php";

// Port of Java searchWikipediaTitles(): action=query&list=search —
// relevance-ranked real article titles, up to `limit`. Cached so repeated
// queries never re-hit Wikipedia.
export async function searchWikipediaTitles(query, limit = 5) {
  const key = cacheKey("search", `${query}|${limit}`);
  return withCache(
    key,
    async () => {
      const titles = [];
      const url =
        `${API}?action=query&list=search` +
        `&srsearch=${encodeURIComponent(query)}` +
        `&srlimit=${limit}` +
        `&format=json`;

      const body = await httpGetWithRetry(url);
      const json = parseJsonSafe(body);
      if (!json || !json.query || !Array.isArray(json.query.search)) {
        return titles; // empty on bad response
      }
      for (const hit of json.query.search) {
        titles.push(hit.title);
      }
      return titles;
    },
    { cacheable: (titles) => titles.length > 0 } // never cache failures
  );
}

// Port of Java resolveWikipediaTitle(): single title or null.
export async function resolveWikipediaTitle(searchQuery) {
  const titles = await searchWikipediaTitles(searchQuery, 1);
  return titles.length ? titles[0] : null;
}
