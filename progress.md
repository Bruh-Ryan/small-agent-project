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
- JSON currently parsed manually via `indexOf`/`substring` — fragile but fine for learning; will likely replace with a proper JSON library (e.g. Gson) later.
- `max_tokens` must be set explicitly and kept low for the planner step, or OpenRouter free-tier credits get rejected (402 error).

## Progress Log
- [x] Got Java 21 (JDK + javac) working correctly in terminal and VS Code.
- [x] Built basic `callModel()` to call an LLM via REST API.
- [x] Switched from Anthropic key to OpenRouter key, fixed auth + token-limit errors.
- [x] Built a basic **planner** that picks "wikipediaAgent" for knowledge/definition queries.
- [ ] Wire up `wikipediaAgent` to actually fetch a real Wikipedia summary.
- [ ] Add final-answer step that uses gathered Wikipedia context to answer the original question.
- [ ] Handle Wikipedia disambiguation / search (e.g. user types "jaguar" — which one?).
- [ ] (Optional) Replace manual JSON parsing with Gson for reliability.
- [ ] (Optional) Move API key handling to a proper `.env` loader instead of shell export.

## Goals (Next Up)
1. **Immediate:** Implement `fetchWikipediaSummary(topic)` and call it after the planner picks "wikipediaAgent".
2. **After that:** Add `answerWithContext(question, context)` to produce a final grounded answer.
3. **Then:** Handle Wikipedia disambiguation — prompt user to pick the right article when a search term is ambiguous (e.g. "jaguar" → car vs animal).
4. **Then:** Support follow-up queries that reference the same topic (e.g. "Tell me more about it").
5. **Stretch goal:** Wrap the agent in a simple REPL loop so the user can keep asking questions.

## Known Issues / Notes
- Sensitive/contested topics (e.g. political conspiracy-adjacent queries) will route through the planner fine,
  but answers from LLM or Wikipedia summaries on such topics should not be treated as authoritative — fine for
  testing planner logic, not for trusting the actual content yet.
- API keys must never be pasted in screenshots or chat — rotate immediately if exposed.