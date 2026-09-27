import {
  plannerResponse,
  parsePlan,
  detectFollowUp,
  rewriteStandaloneQuery,
} from "./planner.js";
import { answerWithContext } from "./answer.js";
import { searchWikipediaTitles } from "../wikipedia/search.js";
import { fetchWikipediaSummary, fetchWikipediaFullExtract } from "../wikipedia/summary.js";
import { fetchWikipediaWikitext } from "../wikipedia/wikitext.js";
import { fetchIncumbent } from "../wikipedia/incumbent.js";
import { keywordSet, shareKeyword } from "../util/keywords.js";
import { isRecencyQuery, RECENCY_MAX_AGE_MS } from "../util/recency.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OpenRouter free-tier keys cap PROMPT size (~7980 tokens observed). 20k
// chars ≈ 5k tokens, leaving headroom for the prompt template + history +
// question so the answer call never dies with 402 "prompt tokens exceeded".
export const MAX_CONTEXT_CHARS = 20000;

// Pure fetch-path dispatch (unit-testable):
// - current-holder + "List of"  → skip (incumbent path handles it better)
// - current-holder              → infobox incumbent (lead fallback in loop)
// - "List of ___"               → wikitext tables (lead fallback in loop)
// - DEPTH full                  → whole-article extract
// - otherwise                   → lead extract
export function chooseFetchPath(term, depth, currentHolderQuery) {
  const isList = term.toLowerCase().startsWith("list of");
  if (currentHolderQuery && isList) return "skip";
  if (currentHolderQuery) return "incumbent";
  if (isList) return "wikitext";
  return depth === "full" ? "summary-full" : "summary-lead";
}

// Port of Java searchBar(): plan → discovery → fetch dispatch → context →
// final answer, extended with conversation awareness:
// - follow-ups are rewritten standalone and planned WITH history
// - previous turn's articles are inherited into the search set
// - raw-query discovery is suppressed on follow-ups (it matched junk like
//   "List of Galactik Football episodes" for "his current status on football")
export async function searchBar(userQuery, agentContext = {}) {
  const history = agentContext.history ?? [];
  const previousTitles = agentContext.previousTitles ?? [];
  // Model choice from /api/ask (allowlist-validated); undefined → DEFAULT.
  const model = agentContext.model;
  // New conversation? Ask the answer call to append a TITLE: line (parsed
  // into the sidebar title — zero extra LLM calls).
  const wantTitle = agentContext.wantTitle === true;

  // 1. Follow-up? Rewrite it standalone (small extra call) so the planner
  //    and discovery work with a self-contained question.
  const followUp = detectFollowUp(userQuery, history);
  let planningQuery = userQuery;
  if (followUp) {
    planningQuery = await rewriteStandaloneQuery(userQuery, history, model);
    console.log(`[follow-up] "${userQuery}" → "${planningQuery}"`);
  }

  const plan = await plannerResponse(planningQuery, history, model);
  console.log("Plannning...");

  const { tokenBudget, depth, searchTitles } = parsePlan(plan);
  console.log("Suggested searches: " + JSON.stringify(searchTitles));

  // 2. Build the search set: inherited titles first (topic continuity), then
  //    the planner's guesses.
  const termsToSearch = new Set();
  const inheritedTitles = [];
  if (followUp) {
    for (const title of previousTitles) {
      if (!termsToSearch.has(title)) {
        termsToSearch.add(title);
        inheritedTitles.push(title);
      }
    }
  }
  for (const title of searchTitles) {
    if (!termsToSearch.has(title)) termsToSearch.add(title);
  }

  // 3. Discovery: Wikipedia search on the raw query — but only for NEW
  //    questions. Follow-up phrases are context-dependent and match junk.
  if (!followUp && !searchTitles.includes(userQuery)) {
    const discovered = await searchWikipediaTitles(userQuery, 5);
    const queryWords = keywordSet(userQuery);
    let kept = 0;
    for (const title of discovered) {
      if (kept >= 3) break;
      if (shareKeyword(queryWords, keywordSet(title))) {
        termsToSearch.add(title);
        kept++;
      }
    }
  }

  console.log(
    `${followUp ? "[follow-up]" : "[new query]"} final search terms: ` +
      JSON.stringify([...termsToSearch])
  );

  // 4. "who currently holds office X" style question → prefer the infobox
  //    incumbent field over a truncated "List of ___" table.
  const ql = planningQuery.toLowerCase();
  const currentHolderQuery =
    (ql.includes("current") || ql.includes("now") || ql.includes("today") || ql.includes("present")) &&
    (ql.includes("who") || ql.includes("president") || ql.includes("ceo") ||
     ql.includes("leader") || ql.includes("prime minister") || ql.includes("head of"));

  const exSentences = tokenBudget >= 1000 ? 50 : tokenBudget >= 500 ? 35 : 25;

  // "current/latest/status" questions may not be served cache entries older
  // than 24h — those get refetched live (Phase 5C).
  const recency = isRecencyQuery(userQuery);
  const cacheOpts = recency ? { maxAgeMs: RECENCY_MAX_AGE_MS } : {};
  if (recency) console.log("  [recency] query detected — cache age limited to 24h");

  let gatheredContext = "";
  const fetched = [];
  const skipped = [];
  const seenTitles = new Set();

  for (const term of termsToSearch) {
    const path = chooseFetchPath(term, depth, currentHolderQuery);
    if (path === "skip") continue;

    let result;
    if (path === "incumbent") {
      result = await fetchIncumbent(term);
      if (!result.summary) result = await fetchWikipediaSummary(term, exSentences, cacheOpts);
    } else if (path === "wikitext") {
      result = await fetchWikipediaWikitext(term);
      if (!result.summary) result = await fetchWikipediaSummary(term, exSentences, cacheOpts);
    } else if (path === "summary-full") {
      result = await fetchWikipediaFullExtract(term, cacheOpts);
    } else {
      result = await fetchWikipediaSummary(term, exSentences, cacheOpts);
    }

    if (seenTitles.has(result.resolvedTitle)) continue;
    seenTitles.add(result.resolvedTitle);

    const summary = result.summary;
    if (
      !summary ||
      !summary.trim() ||
      summary.startsWith("No Wikipedia article found") ||
      summary.startsWith("No extract found")
    ) {
      console.log(`  [skip] ${result.resolvedTitle} (no usable content)`);
      skipped.push(result.resolvedTitle);
      continue;
    }

    // Context budget: adding this article must not blow the model's prompt
    // token cap. Smaller later articles can still fit, so skip (not break).
    const entry = `Wikipedia (${result.resolvedTitle}): ${summary}\n`;
    if (gatheredContext.length + entry.length > MAX_CONTEXT_CHARS) {
      console.log(`  [skip] ${result.resolvedTitle} (context budget)`);
      skipped.push(`${result.resolvedTitle} (context budget)`);
      continue;
    }

    gatheredContext += entry;
    fetched.push({ title: result.resolvedTitle, chars: summary.length });
    console.log(`  [${result.resolvedTitle}: ${summary.length} chars]`);

    // Courtesy pause so we stay under Wikipedia's rate limit.
    await sleep(200);
  }

  console.log("\nGathered context:\n" + gatheredContext);

  const { answer, title, modelUsed, fallback, allFailed, failures } =
    await answerWithContext(
      userQuery,
      gatheredContext,
      tokenBudget,
      history,
      { recency, model, wantTitle }
    );
  console.log("\nFinal Answer:\n" + answer);

  return {
    plan,
    tokenBudget,
    depth,
    recency,
    // modelUsed is what actually answered (Phase 7 fallback may differ from
    // the requested model); `model` stays the request for reference.
    model: modelUsed ?? model ?? null,
    fallback: fallback ?? null,
    // true when every model in the chain failed — the route replaces the
    // answer with a "providers unavailable" notice in that case.
    allFailed: Boolean(allFailed),
    failures: failures ?? [],
    requestedModel: model ?? null,
    title,
    searchTitles,
    followUp,
    rewrittenQuery: followUp ? planningQuery : null,
    inheritedTitles,
    terms: [...termsToSearch],
    fetched,
    skipped,
    context: gatheredContext,
    answer,
  };
}
