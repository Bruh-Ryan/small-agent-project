import { plannerResponse, parsePlan } from "./planner.js";
import { answerWithContext } from "./answer.js";
import { searchWikipediaTitles } from "../wikipedia/search.js";
import { fetchWikipediaSummary } from "../wikipedia/summary.js";
import { fetchWikipediaWikitext } from "../wikipedia/wikitext.js";
import { fetchIncumbent } from "../wikipedia/incumbent.js";
import { keywordSet, shareKeyword } from "../util/keywords.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Port of Java searchBar(): plan → discovery → fetch dispatch → context →
// final answer. Returns a structured result so the API/UI can show the
// whole pipeline (the Java version only printed to stdout).
export async function searchBar(userQuery) {
  const plan = await plannerResponse(userQuery);
  console.log("Plannning...");

  const { tokenBudget, searchTitles } = parsePlan(plan);
  console.log("Suggested searches: " + JSON.stringify(searchTitles));

  // 1. Planner's guessed titles (already in searchTitles)
  // 2. Wikipedia search on the raw user query (discovery) — keeps only the
  //    top relevance hits that share a meaningful word with the query, so
  //    junk like "PlayStation 5" matching "Jaguar" gets filtered out.
  const termsToSearch = new Set(searchTitles);

  if (!searchTitles.includes(userQuery)) {
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

  console.log("Final search terms: " + JSON.stringify([...termsToSearch]));

  // "who currently holds office X" style question → prefer the infobox
  // incumbent field (reliably names the current holder) over a truncated
  // "List of ___" table.
  const ql = userQuery.toLowerCase();
  const currentHolderQuery =
    (ql.includes("current") || ql.includes("now") || ql.includes("today") || ql.includes("present")) &&
    (ql.includes("who") || ql.includes("president") || ql.includes("ceo") ||
     ql.includes("leader") || ql.includes("prime minister") || ql.includes("head of"));

  const exSentences = tokenBudget >= 1000 ? 50 : tokenBudget >= 500 ? 35 : 25;

  let gatheredContext = "";
  const fetched = [];
  const skipped = [];
  const seenTitles = new Set();

  for (const term of termsToSearch) {
    let result;
    if (currentHolderQuery && term.toLowerCase().startsWith("list of")) {
      // Incumbent already gives the current holder; the huge "List of ___"
      // table is mangled/truncated — skip it.
      continue;
    } else if (currentHolderQuery) {
      result = await fetchIncumbent(term);
      if (!result.summary) result = await fetchWikipediaSummary(term, exSentences);
    } else if (term.toLowerCase().startsWith("list of")) {
      result = await fetchWikipediaWikitext(term);
      if (!result.summary) result = await fetchWikipediaSummary(term, exSentences);
    } else {
      result = await fetchWikipediaSummary(term, exSentences);
    }

    if (seenTitles.has(result.resolvedTitle)) continue;
    seenTitles.add(result.resolvedTitle);

    // Skip empty/placeholder results so they don't clutter the context.
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

    gatheredContext += `Wikipedia (${result.resolvedTitle}): ${summary}\n`;
    fetched.push({ title: result.resolvedTitle, chars: summary.length });
    console.log(`  [${result.resolvedTitle}: ${summary.length} chars]`);

    // Courtesy pause so we stay under Wikipedia's rate limit rather than
    // relying on backoff to recover after tripping it.
    await sleep(200);
  }

  console.log("\nGathered context:\n" + gatheredContext);

  const answer = await answerWithContext(userQuery, gatheredContext, tokenBudget);
  console.log("\nFinal Answer:\n" + answer);

  return {
    plan,
    tokenBudget,
    searchTitles,
    terms: [...termsToSearch],
    fetched,
    skipped,
    context: gatheredContext,
    answer,
  };
}
