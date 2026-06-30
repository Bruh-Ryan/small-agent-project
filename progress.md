# Small Agent Project — Progress

## Goal
Build a simple multi-tool AI agent in Java that:
1. Takes a user query from the terminal.
2. Plans which tool(s) to use to answer it (e.g. wikipediaAgent, redditAgent, future tools like excelAgent).
3. Executes the chosen tool(s) to gather real information.
4. Feeds the gathered info back to the model to produce a final, grounded answer.
5. Eventually supports chaining multiple tools for multi-step requests
   (e.g. "research shoe laces AND the stock market, then put it in an excel sheet").

## Architecture (target)
User Query → Planner (LLM) → [tool name(s)] → Tool Executor(s) → Context → Final Answer (LLM)

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
- [x] Built a basic **planner** that, given a tool list (wikipediaAgent, redditAgent) and a user query,
      returns the name of the single best tool to use.
- [ ] Wire up `wikipediaAgent` to actually fetch a real Wikipedia summary (Step 2).
- [ ] Add a second real tool to test routing logic properly (Step 3).
- [ ] Update planner to return a LIST of tools/steps, not just one (Step 4).
- [ ] Loop through tool list, executing each and accumulating context (Step 5).
- [ ] Add final-answer step that uses gathered context to answer the original question (Step 5/6).
- [ ] Add an output/excel tool as a final pipeline step (Step 6).
- [ ] (Optional) Replace manual JSON parsing with Gson for reliability.
- [ ] (Optional) Move API key handling to a proper `.env` loader instead of shell export.

## Goals (Next Up)
1. **Immediate:** Implement `fetchWikipediaSummary(topic)` and call it after the planner picks "wikipediaAgent".
2. **After that:** Add `answerWithContext(question, context)` to produce a final grounded answer.
3. **Then:** Add a second tool (likely a mock/fake "redditAgent" first, to test routing without needing real Reddit API auth).
4. **Then:** Upgrade planner prompt + parsing to support multiple tools in one response (e.g. comma-separated or JSON array).
5. **Stretch goal:** Add an "excelAgent" tool that writes gathered data to a spreadsheet file.

## Known Issues / Notes
- Sensitive/contested topics (e.g. political conspiracy-adjacent queries) will route through the planner fine,
  but answers from LLM or Wikipedia summaries on such topics should not be treated as authoritative — fine for
  testing planner logic, not for trusting the actual content yet.
- API keys must never be pasted in screenshots or chat — rotate immediately if exposed.