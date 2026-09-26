import { httpGetWithRetry } from "./http.js";
import { parseJsonSafe } from "../agent/llm.js";
import { resolveWikipediaTitle } from "./search.js";
import { withCache, cacheKey } from "./cache.js";

const API = "https://en.wikipedia.org/w/api.php";

function isUsable(summary) {
  return (
    summary &&
    summary.trim() &&
    !summary.startsWith("No Wikipedia article found") &&
    !summary.startsWith("No extract found")
  );
}

// Port of Java fetchWikipediaSummary(): lead section as plain prose.
// Returns { resolvedTitle, summary }. (Like the Java version, the
// exSentences argument is accepted for call-site compatibility but the
// extract length is governed by exchars=4000.)
export async function fetchWikipediaSummary(searchQuery, exSentences = 25) {
  const exactTitle = await resolveWikipediaTitle(searchQuery);
  if (exactTitle == null) {
    return { resolvedTitle: searchQuery, summary: `No Wikipedia article found for: ${searchQuery}` };
  }

  const key = cacheKey("summary", exactTitle);
  return withCache(
    key,
    async () => {
      const extractUrl =
        `${API}?action=query&prop=extracts` +
        `&exintro=true&exchars=4000` +
        `&explaintext=true&redirects=1&titles=` +
        encodeURIComponent(exactTitle) +
        `&format=json`;

      const body = await httpGetWithRetry(extractUrl);
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
      return { resolvedTitle, summary: extract };
    },
    { cacheable: (r) => isUsable(r.summary) } // never cache failures/placeholders
  );
}
