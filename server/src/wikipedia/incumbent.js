import { resolveWikipediaTitle } from "./search.js";
import { fetchWikitext } from "./wikitext.js";
import { withCache, cacheKey } from "./cache.js";

// Port of Java extractInfoboxField(): extracts "| field = value" from raw
// wikitext (up to the next "| key =" line or "}}") and cleans wiki markup
// into plain text. Returns "" when the field is absent.
export function extractInfoboxField(wikitext, field) {
  const pattern = new RegExp(
    `\\|\\s*${escapeRegExp(field)}\\s*=\\s*([\\s\\S]+?)\\s*(?=\\n\\s*\\||\\n\\}\\})`,
    "i"
  );
  const m = pattern.exec(wikitext);
  if (!m) return "";
  let raw = m[1];
  // Strip <ref>...</ref> and self-closing refs
  raw = raw.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  raw = raw.replace(/<ref[^>]*\/>/g, "");
  // [[Link|Text]] -> Text ; [[Link]] -> Link
  raw = raw.replace(/\[\[(?:[^\]|\]]*\|)?([^\]]+)\]\]/g, "$1");
  // {{template|...}} -> drop entirely ({{cite}} dates are noise here)
  raw = raw.replace(/\{\{[^}]*\}\}/g, "");
  // Collapse quotes/whitespace, trim leftover markup
  raw = raw.replace(/'''?/g, "").replace(/\s+/g, " ").trim();
  return raw;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Port of Java fetchIncumbent(): current holder of an office from the
// article's infobox (section 0 wikitext). Office articles have
// "| incumbent = [[Name]]". Returns { resolvedTitle, summary: "" } when no
// incumbent field exists (caller falls back to the lead extract).
// Cached under the `incumbent|` key prefix → 24h TTL, so "current office
// holder" answers stay fresh while avoiding repeat fetches.
export async function fetchIncumbent(searchQuery) {
  const exactTitle = await resolveWikipediaTitle(searchQuery);
  if (exactTitle == null) {
    return { resolvedTitle: searchQuery, summary: "" };
  }

  const key = cacheKey("incumbent", exactTitle);
  return withCache(key, async () => {
    const wikitext = await fetchWikitext(exactTitle, 0);
    if (!wikitext) return { resolvedTitle: exactTitle, summary: "" };

    let incumbent = extractInfoboxField(wikitext, "incumbent");
    if (!incumbent) incumbent = extractInfoboxField(wikitext, "office_holder");
    if (!incumbent) incumbent = extractInfoboxField(wikitext, "incumbentsince");
    if (!incumbent) return { resolvedTitle: exactTitle, summary: "" };

    return {
      resolvedTitle: exactTitle,
      summary: `Current holder of this office (from infobox): ${incumbent}`,
    };
  });
}
