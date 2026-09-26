import { httpGetWithRetry } from "./http.js";
import { parseJsonSafe } from "../agent/llm.js";
import { resolveWikipediaTitle } from "./search.js";
import { withCache, cacheKey } from "./cache.js";

const API = "https://en.wikipedia.org/w/api.php";

// Fetches raw wikitext for a resolved title; optional `section` for
// lead/infobox only (section=0). Returns "" on failure.
export async function fetchWikitext(exactTitle, section = null) {
  let url =
    `${API}?action=parse&page=${encodeURIComponent(exactTitle)}` +
    `&prop=wikitext&format=json`;
  if (section != null) url += `&section=${section}`;

  const body = await httpGetWithRetry(url);
  const json = parseJsonSafe(body);
  if (!json || !json.parse || !json.parse.wikitext) return "";
  return json.parse.wikitext["*"] ?? "";
}

// Port of Java formatWikiTable(): raw wikitext table ({| ... |}) →
// pipe-delimited rows. Basic: handles flat "List of ___" tables, may mangle
// nested/rowspan tables (documented limitation).
export function formatWikiTable(raw) {
  let out = "";
  for (let row of String(raw).split("\n")) {
    row = row.trim();
    if (row.startsWith("{|") || row.startsWith("|}") || row.startsWith("|-")) continue;
    if (row.startsWith("|") || row.startsWith("!")) {
      let rest = row.slice(1).trim();
      rest = rest.replace(/[a-zA-Z-]+\s*=\s*"[^"]*"/g, "").trim();
      const cells = rest.split("||");
      out += cells.map((c) => c.trim()).join(" | ");
      out += "\n";
    }
  }
  return out.trim();
}

// Port of Java fetchWikipediaWikitext(): full-page wikitext → all tables as
// pipe-delimited text. Empty summary (not null) when no tables — caller falls
// back to the lead-extract path. Cached for 7 days when tables were found.
export async function fetchWikipediaWikitext(searchQuery) {
  const exactTitle = await resolveWikipediaTitle(searchQuery);
  if (exactTitle == null) {
    return { resolvedTitle: searchQuery, summary: `No Wikipedia article found for: ${searchQuery}` };
  }

  const key = cacheKey("wikitext", exactTitle);
  return withCache(
    key,
    async () => {
      const wikitext = await fetchWikitext(exactTitle);
      if (!wikitext) return { resolvedTitle: exactTitle, summary: "" }; // caller falls back

      let result = "";
      let idx = 0;
      while (true) {
        const start = wikitext.indexOf("{|", idx);
        if (start === -1) break;
        let end = wikitext.indexOf("|}", start);
        if (end === -1) break;
        end += 2;
        const table = wikitext.slice(start, end);
        const formatted = formatWikiTable(table);
        if (formatted) result += formatted + "\n\n";
        idx = end;
      }

      if (!result) return { resolvedTitle: exactTitle, summary: "" }; // caller falls back
      let text = result;
      if (text.length > 8000) text = text.slice(0, 8000) + "\n...[truncated]";
      return { resolvedTitle: exactTitle, summary: text };
    },
    { cacheable: (r) => Boolean(r.summary) } // don't cache "no tables" misses
  );
}
