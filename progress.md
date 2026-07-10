# Wikipedia Agent — Progress

## Goal
Build a Java AI agent that acts as a **Wikipedia knowledge assistant**:
1. Takes a user query from the terminal (e.g. "What is a quasar?" or "Define recursion").
2. Routes the query through a planner that selects Wikipedia as the tool.
3. Fetches a Wikipedia summary/definition for the topic.
4. Feeds the gathered info back to the LLM to produce a concise, grounded answer.
5. Focus is on finding **definitions and factual knowledge** via Wikipedia.

## Architecture (target)
User Query → Planner (LLM) → Wikipedia Agent → Context → Final Answer (LLM)

## Read / Background
- Switched from Anthropic API to OpenRouter API (free-tier friendly, OpenAI-compatible format).
- Java's `HttpClient` (Java 11+) used for all HTTP calls — no external libraries yet.
- `System.getenv()` reads real shell environment variables only — does NOT read `.env` files automatically (decided to use shell export for now; `.env` loader is a future option).
- JSON now parsed via `org.json` library (`json-20240303.jar`) — eliminates the fragile `indexOf`/`substring` parsing that was causing bugs in `callModel`, `resolveWikipediaTitle`, and `fetchWikipediaSummary`.
- `max_tokens` must be set explicitly and kept low for the planner step, or OpenRouter free-tier credits get rejected (402 error).

## Progress Log
- [x] Got Java 21 (JDK + javac) working correctly in terminal and VS Code.
- [x] Built basic `callModel()` to call an LLM via REST API.
- [x] Switched from Anthropic key to OpenRouter key, fixed auth + token-limit errors.
- [x] Built a basic **planner** that picks "wikipediaAgent" for knowledge/definition queries.
- [x] Wire up `wikipediaAgent` to fetch a real Wikipedia summary (with prosaic lead section).
- [x] Add final-answer step that uses gathered Wikipedia context to answer the original question.
- [x] Refactor: extracted `resolveWikipediaTitle()` shared helper from `fetchWikipediaSummary()`.
- [x] Added `fetchWikipediaWikitext()` — fetches full page wikitext, extracts tables as pipe-delimited text.
- [x] Added `searchBar()` dispatch: "List of" titles hit the wikitext/table path, others use the lead-extract path.
- [x] Changed `main()` to accept CLI arg (CI-friendly) with Scanner fallback (local use).
- [x] Added unit test file (`wikipediaAgentTest.java`) for `parseTitles()` — no external dependencies.
- [x] Added debug print of extracted context character count per fetch.
- [x] Changed extract API from `exsentences=N` to `exintro=true&exchars=4000` to avoid lead truncation.
- [x] Planner prompt updated with "List of ___" fallback rule for current-role questions.
- [x] Added `org.json` library (`json-20240303.jar`) — replaced all manual JSON parsing with `JSONObject`/`JSONArray`.
- [x] Rewrote `callModel()` — uses `JSONObject` to extract content from OpenRouter response (eliminates escape-loop bugs).
- [x] Added `searchWikipediaTitles(query, limit)` — uses `action=query&list=search` for clean, relevance-ranked title discovery.
- [x] Rewrote `resolveWikipediaTitle()` — delegates to `searchWikipediaTitles` (same contract, JSON-backed parsing).
- [x] Rewrote `fetchWikipediaSummary()` extract extraction — uses `JSONObject` on `query/pages` response.
- [x] Fixed `fetchWikipediaWikitext()` — URL changed from invalid `action=raw` to `action=parse&prop=wikitext`, response parsed with `JSONObject`.
- [x] Added discovery step in `searchBar()` — after planner guesses are parsed, also searches Wikipedia on the raw user query and merges real titles as fallback coverage. This fixes the "model guesses wrong → opensearch validates wrong guess → answer misses context" pipeline issue.
- [ ] Handle Wikipedia disambiguation / search (e.g. user types "jaguar" — which one?).
- [ ] (Optional) Replace manual JSON parsing with Gson for reliability.
- [ ] (Optional) Move API key handling to a proper `.env` loader instead of shell export.

## Goals (Next Up)
1. **Immediate:** Handle Wikipedia disambiguation — prompt user to pick the right article when a search term is ambiguous (e.g. "jaguar" → car vs animal).
2. **After that:** Support follow-up queries that reference the same topic (e.g. "Tell me more about it").
3. **Stretch goal:** Wrap the agent in a simple REPL loop so the user can keep asking questions.
4. **Stretch goal:** Add proper HTML-to-text parsing (or use a library) for non-wikitext pages.

## Known Issues / Notes
- Sensitive/contested topics (e.g. political conspiracy-adjacent queries) will route through the planner fine,
  but answers from LLM or Wikipedia summaries on such topics should not be treated as authoritative — fine for
  testing planner logic, not for trusting the actual content yet.
- API keys must never be pasted in screenshots or chat — rotate immediately if exposed.
- `action=raw` wikitext fetches are efficient but the `formatWikiTable()` parser is basic — it handles
  flat "List of ___" tables well but may mangle nested tables or cells with rowspan/colspan.
- The "list of" dispatch heuristic is a simple `startsWith("list of")` check — pages with tables
  that don't follow this naming pattern won't trigger the wikitext path.