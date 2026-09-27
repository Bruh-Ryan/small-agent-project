# Wikipedia Agent — Progress

## What this project is

A **Wikipedia knowledge assistant**: you ask a question, an LLM planner picks
Wikipedia articles to fetch, the fetched text is grounded into a final LLM
answer. Originally built as a terminal Java program; **currently a full MERN
app** (MongoDB, Express, React, Node) with the same agent pipeline ported to
Node, plus chat history, an agent-debug UI, and conversation-aware follow-ups.

**Pipeline:** `User Query → [rewrite if follow-up] → Planner (LLM) →
Wikipedia fetches (lead / full / wikitext tables / infobox incumbent) →
grounded context → Final Answer (LLM)`

## Architecture (current)

```
React SPA (:5173, Vite, /api proxy)
   └─ POST /api/ask {query, sessionId?, model?}
Express API (:3001, cookie session via express-session)
   ├─ /api/auth  register · login · logout · me   (6C)
   └─ agent/  planner → searchBar orchestration → answer
        ├─ OpenRouter (LLM)  — planner, rewrite, answer
        ├─ Wikipedia API     — search / extract / wikitext / infobox
        └─ MongoDB Atlas     — DB "Chat-History"
              ├─ chats     — per-user conversations (owner field, 15-chat cap)
              ├─ users     — accounts (bcrypt passwordHash)
              ├─ sessions  — express-session store
              └─ wiki_cache — Wikipedia response cache, TTL index (expiresAt)
```

- **Auth (6C):** every ask/session route requires a logged-in session;
  chats are owner-scoped (others' ids → 404). Pre-auth chats are orphans
  (`owner: null`) — invisible until claimed via
  `node server/scripts/claim-orphan-chats.js <username>`
- **Behavior change:** with auth gating `/api/ask`, a Mongo outage now
  means no login → 401s (the old "answering works DB-less" grace period
  only applies while nobody needs a session)

- LLM model: `openai/gpt-4o` default, user-selectable from a 7-model
  allowlist (sidebar picker, `.env MODEL=` overrides the default)
- Split cache TTL: 7 days general; 24h for `incumbent|` keys + a 24h
  max-age gate for "current/latest" queries (Phase 5C)
- Graceful degradation: no Mongo → answering still works, persistence/cache
  silently skipped; missing API key → clear 500

## Repo map

```
server/src/
  index.js            Express entry (cors, json, session, routes, db connect)
  config.js           loads root .env (apiKey, mongoUri, port, sessionSecret)
  db.js               mongoose connect, MASKED uri logging (never log secrets)
  agent/providers.js  7: provider registry (openrouter/groq/mistral/gemini/hf),
                      base URLs, key names, parseModelId (bare id → openrouter)
  agent/llm.js        callModel(prompt, maxTokens, model?) → {text, modelUsed,
                      fallback, failures}; fallbackChain() (free-first, one model
                      per other provider, MAX_FALLBACKS=2); ANY provider failure
                      falls through (402/429/5xx/network/400/401/404/empty/malformed);
                      auto-retry on 402 (completion credits);
                      formatUnavailable(failures) → friendly message;
                      FORCE_FAIL_PROVIDERS test hook (7)
  agent/planner.js    parseTitles, detectFollowUp, isTopicSwitch,
                      rewriteStandaloneQuery, historyBlock(topicSwitch),
                      plannerResponse(+history, topicSwitch),
                      parsePlan → {tokenBudget, depth, titles}
  agent/answer.js     answerWithContext(...) → {answer, title}; extractTitle()
                      (TITLE: parsing); 402 prompt-limit context-trim retry
  agent/searchBar.js  orchestration: rewrite → plan → inherit → discover →
                      fetch (chooseFetchPath) → answer; MAX_CONTEXT_CHARS=20000
  agent/models.js     7: 16-model curated catalog, MODEL env default, only
                      providers with a key in .env are exposed, flash-first
                      order per provider (resolveModel via provider registry)
  wikipedia/http.js   GET + User-Agent + 429 backoff
  wikipedia/search.js list=search titles (cached)
  wikipedia/summary.js lead/full extract (capExtract, summary-full| key, cached)
  wikipedia/wikitext.js  tables from wikitext (cached)
  wikipedia/incumbent.js infobox "incumbent=" field (cached, 24h TTL)
  wikipedia/cache.js  withCache(key, fn, {maxAgeMs}) read-through, never throws
  util/keywords.js    keywordSet/shareKeyword (discovery filtering)
  util/recency.js     isRecencyQuery, isFresh, RECENCY_MAX_AGE_MS
  models/Chat.js      schema → collection "chats", buildTitle(),
                      chatOwnedBy(), overflowIds(), owner field (6C)
  models/User.js      6C: accounts collection "users" (bcrypt hash)
  models/WikiCache.js → collection "wiki_cache", ttlFor() split TTL
  middleware/session.js 6C: express-session + MongoStore (MemoryStore fallback)
  middleware/auth.js  6C: requireAuth → 401
  util/authValidation.js 6C: pure username/password validators
  routes/ask.js       model allowlist 400s, requireAuth, owner check (404),
                      history BEFORE planning, persists AFTER + 15-chat cap
  routes/sessions.js  owner-scoped GET/GET:id/DELETE (requireAuth)
  routes/models.js    GET /api/models → { models, default } (7: grouped for picker)
  routes/auth.js      6C: register/login/logout/me
client/src/
  main.jsx            BrowserRouter
  App.jsx             layout, session/message/model state, handleAsk, model loader (retries)
  api.js              ask/listSessions/getSession/deleteSession/getModels + friendly errors
  components/         SessionSidebar (model picker grouped by provider <optgroup>,
                      title tooltip) · ChatWindow · MessageBubble (incl. 7
                      .bubble.unavailable) · PlanPanel (fallback summary) · Composer
server/test/          Vitest — 137 tests (planner, wikipedia, keywords, persistence,
                      depth, recency, models, providers, title, auth, unavailable)
server/scripts/       db-inspect.js, backdate-cache.js, claim-orphan-chats.js,
                      seed-chats.js, cleanup-test-auth.js (Atlas helpers) ·
                      7: llm-smoke.js (live per-model), llm-fallback-proof.js
                      (4 forced scenarios), phase7-e2e.js (full HTTP path),
                      list-openrouter-free.js, list-provider-models.js
root: AGENTS.md        working rules for agents (routes, commands, quota discipline)
      wikipediaAgent.java, wikipediaAgentTest.java, json-20240303.jar  ← original Java (legacy)
      package.json    root scripts (concurrently runs server+client)
```

## How to run

```powershell
npm install                     # root (concurrently)
npm --prefix server install
npm --prefix client install
npm run dev                     # both server(:3001) + client(:5173)
npm run dev:server              # API only  (use when Vite already runs)
npm run dev:client              # Vite only
npm test                        # 87 Vitest tests (server)
npm --prefix client run build   # production build check
```

`.env` (root, gitignored — never commit or paste values):
- `OPENROUTER_API_KEY=` — required for all LLM calls
- `MONGODB_URI=mongodb+srv://USER:PASS@HOST/Chat-History` — Atlas; your IP
  must be allowlisted in Atlas → Network Access (else ECONNREFUSED-style
  whitelist error). DB name `Chat-History`, collections `chats` + `wiki_cache`.
- `PORT=3001`
- `MODEL=` (optional) — override the default LLM; must be one of the 7
  allowlisted ids in `server/src/agent/models.js`, else ignored
- `SESSION_SECRET=` (6C) — express-session signing secret; generated/added
  when auth shipped. Missing → random per-boot fallback (logins die on restart)

Gotchas learned the hard way:
- Two dev servers on :3001 → `EADDRINUSE`; always free the port before tests.
- `npm run dev` while Vite already runs → :5173 collision; run `dev:server` only.
- Backend down + Vite up → browser shows **502 Bad Gateway** (proxy can't
  reach :3001). Friendly error text is built into `api.js`.
- Never log the Mongo URI unmasked (fixed in `db.js`).

## Progress log

### Phase 0 — original Java agent (legacy)
- [x] Java 21 toolchain, `callModel()` via REST, Anthropic → OpenRouter switch
- [x] planner picks `wikipediaAgent`; lead-section fetch; grounded final answer
- [x] `resolveWikipediaTitle()`, `searchWikipediaTitles()` (list=search)
- [x] `fetchWikipediaWikitext()` + `formatWikiTable()` for "List of ___" tables
- [x] `searchBar()` dispatch (list-of → wikitext, else lead) + raw-query discovery
- [x] CLI arg input (CI), `wikipediaAgentTest.java` (parseTitles)
- [x] `org.json` parsing (replaced fragile indexOf/substring), explicit `max_tokens`
- [x] infobox `incumbent` path for "current office holder" questions

### Phase 1 — MERN scaffold ✅
- [x] root/client/server layout, dotenv loads root `.env`, concurrently scripts
- [x] Express stub routes, Vite React app, /api proxy
- [x] Atlas connected (IP allowlisted), **masked URI logging**, graceful no-DB mode

### Phase 2 — agent port to Node ✅
- [x] llm/planner/answer/searchBar + wikipedia/{http,search,summary,wikitext,incumbent}
- [x] `POST /api/ask` real pipeline; Java test ported to Vitest
- [x] live branch verification: lead extract (quasar), infobox incumbent
      (recovered "current president" from stale planner guess), wikitext tables
      (longest rivers)

### Phase 3 — persistence ✅
- [x] `chats` (one doc/conversation, embedded messages + debug payloads)
- [x] `wiki_cache` + `expiresAt` TTL index (`expireAfterSeconds: 0`);
      split TTL via `ttlFor()` — 7d default, 24h `incumbent|`
- [x] `withCache()` wired into all 4 fetch paths (never caches failures)
- [x] sessions routes (list/get/delete); ask persists best-effort
- [x] verified: cache run 7656ms → 4461ms (7 hits); 30/30 tests at the time

### Phase 4 — React chat UI ✅
- [x] SessionSidebar (list/new/delete-with-confirm), ChatWindow (auto-scroll,
      example chips), MessageBubble (react-markdown), PlanPanel (collapsible
      debug), Composer (Enter/Shift+Enter)
- [x] react-router: `/` and `/session/:id` (refresh-safe), localStorage-free
      simple state, friendly API-unreachable error banner
- [x] verified: build, SPA routes, multi-turn session persistence

### Phase 5 — conversation-aware quality ✅ COMPLETE (A+B+C+D)
Overall goal: follow-ups must give **deeper, fresher, more relevant** answers
(motivating bug: "who is messi" → "what is his current status on football"
fetched *List of Galactik Football episodes* + *Status Quo (band)* and
re-served the Q1 lead).

- [x] **A. Follow-up context**
  - `detectFollowUp()` (needs history + pronoun/continuation words)
  - `rewriteStandaloneQuery()` — ~80-tok call, only on follow-ups
  - planner prompt: `RECENT CONVERSATION` block + rules 6 (stay on topic)
    and 7 (new angles for "more/current") + `DEPTH: lead|full` output line
  - `searchBar`: inherited previous titles first; raw-query discovery
    SUPPRESSED on follow-ups; answer gets last-2 exchanges + depth rule
  - `ask.js`: loads chat → history + previous fetched titles BEFORE planning
  - debug now stores: followUp, rewrittenQuery, inheritedTitles, depth
  - **verified replay:** Q2 terms = `Lionel Messi, Career…, Jorge Messi,
    Inter Miami CF, Argentina national football team` (junk gone), depth=full,
    answer cited Leagues Cup 2023 / Supporters' Shield 2024 / MLS Cup 2025
- [x] **B. Depth fetching** ✅
  - [x] `summary.js`: shared `buildExtractUrl()` + `capExtract()`; full mode =
        whole-article plaintext (no `exintro`), capped 7000 chars;
        lead capped 4000; cache key `summary-full|` (7d) vs `summary|`
  - [x] **Bug discovered:** MediaWiki hard-caps `exchars` at ~1200 for
        non-continuous extracts — the original Java `exchars=4000` ALWAYS
        returned ~1200 chars. Fix: request un-capped text, slice client-side.
  - [x] `searchBar.js`: pure `chooseFetchPath(term, depth, currentHolder)` →
        "skip" | "incumbent" | "wikitext" | "summary-lead" | "summary-full"
  - [x] **Context budget `MAX_CONTEXT_CHARS = 20000`**: articles that would
        blow the OpenRouter free-tier prompt cap (~7980 tokens; a 35k-char
        context died with 402) are skipped with "(context budget)" reason
  - [x] PlanPanel: follow-up section (rewritten query + inherited titles),
        depth/follow-up markers in summary line
  - [x] tests: chooseFetchPath matrix, URL builder, capExtract (51/51 total)
  - **verified replay:** Q2 depth=full, 2×7015-char extracts, context 14094
        (budget respected), answer cited MLS Cup 2025 + MVP 2024/2025, no 402
- [x] **C. Recency** ✅
  - [x] `util/recency.js`: `isRecencyQuery()` (current/latest/recent/now/
        today/status/present/ongoing…), `isFresh()`, `RECENCY_MAX_AGE_MS=24h`
  - [x] `cache.js`: `getCached(key,{maxAgeMs})` + `withCache` age gate —
        stale entries log `[cache] stale (Nh old) … — refetching live` and
        miss; refetch refreshes `fetchedAt` (sliding freshness)
  - [x] `searchBar.js`: computes `recency` from original query, threads
        `cacheOpts` into summary/full fetches, returns `recency`
  - [x] `answer.js`: recency rule → hedge "As of Wikipedia's last update…"
        unless context states a recent dated fact
  - [x] debug `recency` flag + PlanPanel chip `· recency ≤24h`
  - [x] tests: `test/recency.test.js` (isRecencyQuery + isFresh, 8 tests)
  - **verified live:** backdated `summary-full|Lionel Messi` to 72h old →
        log shows `[recency] query detected` + `[cache] stale (72h) →
        refetching live` (younger entries still hit); answer opened with
        *"As of Wikipedia's last update…"* + trailing currency caveat;
        context 17336 ≤ 20000. Utility: `server/scripts/backdate-cache.js`
- [x] **D. Model picker** ✅
  - [x] `agent/models.js`: allowlist of 7 verified OpenRouter IDs:
    `openai/gpt-4o` (default), `openai/gpt-4o-mini`,
    `anthropic/claude-sonnet-5`, `google/gemini-2.5-flash`,
    `meta-llama/llama-3.3-70b-instruct`, `deepseek/deepseek-chat-v3-0324`,
    `qwen/qwen3.8-27b:free`; `.env MODEL=` honoured only if allowlisted
  - [x] `callModel(prompt, maxTokens, model?)` — model threaded through
    rewrite → planner → answer (all three calls use the picked model)
  - [x] allowlist validation in `/api/ask` → **400 Unknown model** on
    arbitrary IDs; missing/empty → DEFAULT
  - [x] `GET /api/models` → `{ models, default }`; `api.js getModels()`
  - [x] SessionSidebar dropdown (below header), persists in
    `localStorage["wiki:model"]`, sent per ask, chip in PlanPanel summary
    (`debug.model`)
  - [x] tests: `test/models.test.js` (accept/reject/default/list)
  - **verified live:** `/api/models` lists 7; unknown id → 400;
    `model:"openai/gpt-4o-mini"` → answer came back tagged `gpt-4o-mini`

### Phase 6 — fixes & features (COMPLETE)

- [x] **6A. Model picker fix** ✅ (user report: dropdown missing entirely)
  - Root causes: (1) `getModels()` failure was swallowed →
    `models.length > 0` gate hid the picker forever, no retry (startup
    race); (2) ≤760px media query collapsed the select to 0px width;
    (3) `ALLOWED_MODELS["constructor"]` passed the allowlist via prototype
    chain; (4) `callModel` ignored `res.ok`
  - [x] `App.jsx`: `MODEL_FALLBACK` entry so the `<select>` ALWAYS renders;
    `model` state init from localStorage (no "" → option mismatch); loader
    retries 3× (1.5s backoff) then sets `modelsError`
  - [x] `SessionSidebar`: gate removed, `aria-label="Model"`, renders
    `modelsError` as `.picker-error` text under the control
  - [x] `App.css`: ≤760px — hide label span, tighten padding,
    `min-width: 44px` on select; `.picker-error` after `.sidebar-error`
    (wins cascade without !important)
  - [x] `models.js`: `Object.hasOwn` in `resolveModel` + `DEFAULT_MODEL`
  - [x] `llm.js`: `!res.ok` → short actionable message (`404 for <model>`)
  - [x] tests: prototype-chain names rejected (`constructor`, `toString`,
    `valueOf`, `hasOwnProperty`, `__proto__`)
  - **verified live:** `/api/models` 200/7; `constructor|toString|__proto__`
    → **400**; random id → 400; bundle contains fallback + CSS fix;
    65/65 tests, client build green
  - [ ] user to hard-reload the app and confirm the picker in both wide
    and ≤760px windows
- [x] **6B. AI titles from the answer call** ✅ (zero extra LLM calls)
  - [x] `answer.js`: `extractTitle(raw)` — line-based parse, marker matched
    anywhere on a line (models sometimes inline it), LAST non-empty match
    wins, ALL marker text stripped from the answer; degenerate/title-only
    edge cases → `(empty answer)` / fallback; +40 completion tokens when a
    title is requested so the last line isn't cut
  - [x] prompt asks for `TITLE: <max 8 words>` on its own line **only on
    new chats** (`wantTitle: !chat`) — follow-ups never retitle
  - [x] `searchBar` threads `wantTitle`/`title`; `ask.js`:
    `title: result.title || buildTitle(query)` (60-char fallback intact)
  - [x] `SessionSidebar`: `title={s.title}` hover for ellipsized rows
  - [x] tests: `test/title.test.js` (11 cases incl. inline, spoof/last-wins,
    SUBTITLE non-match, quotes, truncation, code blocks)
  - **verified live:** new chat → title **"Australia Capital: Canberra"**
    (vs raw query "what is the capital of australia"); no `TITLE:` leak;
    follow-up leaves title unchanged
- [x] **6B+. OpenRouter free-key resilience (found during 6B E2E)** ✅
  - `llm.js`: **completion-credit 402** ("can only afford N") → auto-retry
    with N-10 max_tokens
  - `answer.js`: **prompt-limit 402** ("Prompt tokens limit exceeded: X > Y",
    limit fluctuates with the free allowance — saw 7980→1302 within hours)
    → `trimForPromptLimit()` cuts ~4 chars/token of overage off the END of
    the context (priority-ordered, best articles kept) and rebuilds the
    prompt once. Live: `trimming 14089→2565 chars, retrying` → success
- [x] **6C. Auth — server** ✅ (express-session + MongoStore, bcryptjs)
  - New deps: `express-session`, `connect-mongo`, `bcryptjs` (pure JS)
  - [x] `.env` `SESSION_SECRET` added (random fallback per-boot if missing)
  - [x] `models/User.js` — unique lowercase username (3–30, `[a-z0-9_]`),
        `passwordHash` only (bcrypt cost 10), collection `users`
  - [x] `middleware/session.js` — express-session, `httpOnly` + `sameSite=lax`
        cookie `wiki.sid` (14d), MongoStore (`sessions` collection),
        MemoryStore fallback so the server boots if Atlas is down
  - [x] `middleware/auth.js` — `requireAuth` → 401
  - [x] `routes/auth.js` — `POST /register` (400 validators, 409 duplicate,
        session regenerated = anti-fixation) · `POST /login` (generic 401,
        no user enumeration) · `POST /logout` · `GET /me`
  - [x] `Chat.owner` (indexed, default null = hidden pre-auth doc) +
        pure helpers `chatOwnedBy()`, `overflowIds()`
  - [x] `ask.js` — `requireAuth`; foreign sessionId → **404** (never leaks
        existence); creates with owner; **15-chat cap** after every save
        (`CHAT_CAP`, deletes oldest overflow)
  - [x] `sessions.js` — `router.use(requireAuth)`; list filtered by owner;
        get/delete → non-owner 404
  - [x] `scripts/claim-orphan-chats.js <username>` + `scripts/seed-chats.js`
        (cap test helper, no LLM spend)
  - [x] tests: `test/auth.test.js` (validators, requireAuth mock req/res,
        chatOwnedBy, overflowIds)
  - **verified live (API-level):** unauthenticated ask/sessions → **401** ·
    register + `/me` OK · duplicate → 409 · short pw → 400 · bad login ×2 →
    generic 401 · authenticated ask saved + listed · user2 sees **0** chats,
    GET/DELETE user1's id → **404**, owner GET → 200 · seed 16 → ask →
    **15** (`[chat-cap] deleted 4`) · logout → 401 · claim script claimed
    **8 orphans** (AI-titled history visible under the account)
  - **cleanup after verify:** test users + seeded chats removed, chats reset
    to orphan → **11 orphan chats, 0 users** ready for the real account
  - **run after registering (6D):** `node server/scripts/claim-orphan-chats.js <username>`
- [x] **6D. Client auth UI** ✅ (`credentials`+401 event in `api.js`,
  `LoginPage.jsx`, session guard + logout in `App.jsx`, username footer in
  sidebar, auth CSS)
  - [x] `api.js` — `credentials:"include"` everywhere; `ApiError` carries
        `status`; any 401 dispatches `wiki:unauthorized`; new
        `me/login/register/logout` helpers
  - [x] `LoginPage.jsx` — login/register toggle, inline server errors
        (400/401/409/503), busy state; full-screen card (no sidebar)
  - [x] `App.jsx` — `me()` on boot (`authLoading` splash) → `user`; gate:
        no session → `LoginPage` (returns to pre-login path after auth);
        401 event anywhere → login + state cleared; logout clears server
        session + local state; `/login` while authed → redirect `/`
  - [x] `SessionSidebar` — `@username` + Log out footer (collapsed rail
        safe)
  - [x] `npm --prefix client run build` green; `npm test` 87/87;
        server health OK, logged-out `/me` → 401
  - **browser checklist (manual):** register → sidebar shows `@user` →
    ask works → Log out → login page → log back in → history present →
    wrong password shows inline error → second browser/incognito has no
    history
  - **history migration:** after registering, run
    `node server/scripts/claim-orphan-chats.js <username>` to adopt the
    **11 pre-auth chats**

### Phase 7 — multi-provider fallback (COMPLETE)

Goal: the app never fails a user because one provider ran out of tokens, and
it says something useful when *every* provider is unavailable.

- [x] **7A. Provider layer** ✅
  - `agent/providers.js` — registry for openrouter, groq, mistral, gemini, hf:
    base URL, env key name, id prefix. `parseModelId()` treats a bare id as
    OpenRouter and strips the provider prefix before the HTTP call.
  - `agent/models.js` — 16 curated models. **A provider with no key in `.env`
    is not exposed at all** (Gemini + HF are currently blank → hidden).
  - Flash-first ordering per provider: Groq `qwen/qwen3.8-27b`, Mistral
    `ministral-8b-latest`, OpenRouter free `qwen/qwen3.8-27b:free` lead their
    groups. `MODEL=groq:openai/gpt-oss-120b` in `.env`.
  - `GET /api/models` → `{ models, default }`; client renders provider
    `<optgroup>`s.
- [x] **7B. Cross-provider fallback chain** ✅
  - `fallbackChain()`: the selected model, then **one free model from each
    other configured provider**, then leftovers, then that provider's own free
    models, capped by `MAX_FALLBACKS = 2`. A provider outage is not fixed by
    retrying the same provider, so the spread comes first.
  - **Every** provider failure falls through: 402/429/5xx, network errors,
    malformed bodies, empty reasoning answers, **and 400/401/404** (rejected
    request / dead key / dropped model). An earlier "stop on non-retryable
    status" rule was removed — one broken provider must never fail the user
    while another provider is configured.
  - Reasoning models (`gpt-oss`, `nemotron`) can return `content: ""` with
    `finish_reason: "length"`; that is a miss, so it falls back. Raw
    `reasoning` is never surfaced as an answer.
  - OpenRouter's 402 completion-credit retry (6B+) is preserved inside
    `readResponse`, ahead of the chain walk.
- [x] **7C. "All providers unavailable" UX** ✅
  - `formatUnavailable(failures)` turns raw statuses into plain English —
    free-tier resets, out of credits, bad key, dropped model, network, empty
    answer, test-hook — plus what the user can do next.
  - When every model fails, `POST /api/ask` returns **HTTP 200** with
    `answer` = that message, `model: null`, `requestedModel`, `allFailed: true`
    and `failures[]`. It is a normal persisted chat turn, not an error
    response, so history and the plan panel stay consistent.
  - Client renders it as a styled `.bubble.unavailable` warning.
- [x] **7D. Verification tooling** ✅
  - `FORCE_FAIL_PROVIDERS` — test/demo only, read per request, accepts
    provider names, model ids, or `all`. Unset = no effect.
  - `scripts/llm-fallback-proof.js` — 4 forced scenarios, **3 real API calls**
    (the all-forced scenario makes none). **4/4 PASS.**
  - `scripts/llm-smoke.js [modelId]` — all 16 curated models answered live.
  - `scripts/phase7-e2e.js <login|models|ask|cleanup>` — authenticated HTTP
    path with a cookie jar.
  - **verified live over HTTP:** normal ask (`fallback: none`) → Groq+OpenRouter
    forced down → **Mistral answered** → `FORCE_FAIL_PROVIDERS=all` → **200
    with `allFailed: true`, `model: null`, all 3 providers named and the
    turn saved** → clean restart back to normal.
  - throwaway `phase7demo` account removed afterwards (3 chats, 3 sessions).
- [x] **7E. Docs / guardrails** ✅
  - `AGENTS.md` (root) — route table, `wiki.sid` cookie name, canonical
    commands, restart-after-edit, run-tests-once, PowerShell 5.1 rules,
    quota discipline, secrets policy.
  - `.env.example` documents `MODEL` and `FORCE_FAIL_PROVIDERS`.
- [x] `npm test` **129/129**; client build green.
- [ ] **manual (user):** reload the browser and eyeball the grouped picker, a
  `· fell back to …` line, and the unavailable bubble.

### Phase 8 — topic switches mid-conversation (COMPLETE)

Problem: one chat is not one topic. A user asks about a celebrity, then asks how
JVM architecture works. Three places pushed back:

1. the planner was told *"Follow-ups stay on the SAME topic — do not switch to a
   new subject"*, so it steered back to the celebrity;
2. `detectFollowUp` matches `it|this|that|there`, so a new subject phrased with
   one of those ("how does **it** compare to Python?") was classified as a
   follow-up — which **inherits the previous turn's titles** (celebrity
   articles fetched for a Java question) and **suppresses fresh discovery**;
3. `exchangeBlock` prepended the last two exchanges with no guidance, so the
   answerer tried to tie the new answer to the old topic.

Fix:
- [x] `isTopicSwitch(query, history)` — pure, unit-tested. No history → false.
  Reference/continuation wording → **never** a switch ("when was he born?"
  shares no keyword but must keep its context). Otherwise: no keyword shared
  with the **last two** turns (older turns drag in unrelated words and would
  mask a real switch) → switch. Reuses `keywordSet`/`shareKeyword`.
- [x] `historyBlock(history, topicSwitch)` — re-frames the block as "the latest
  question switched subject — use this ONLY if it refers back".
- [x] planner instruction #6 reworded: a new subject is planned on its own; a
  continuation still resolves pronouns. Neither is pulled onto the other.
- [x] `exchangeBlock(history, topicSwitch)` + `buildPrompt` — "Answer ONLY the
  latest question. Do not connect it to the earlier subject."
- [x] `rewriteStandaloneQuery` — "if it is about a completely different subject
  than the history, return it unchanged".
- [x] `searchBar` computes it once, threads it to planner + answer, logs
  `[topic-switch]`, and returns `topicSwitch` in the result for debug.
- [x] **137/137 tests** (8 new, all mocked). No client change.
- Note: title inheritance and discovery suppression are left as-is on purpose —
  a flagged switch implies `detectFollowUp` false, which already means no
  inherited titles and normal discovery. Changing that search-set logic would
  re-open the Phase 5 tuning.

## Test status

`npm test` → **137/137 passing** (Vitest, server):
planner (parseTitles port, parsePlan incl. DEPTH, detectFollowUp,
isTopicSwitch, extractStandalone, topic-switch prompt framing) ·
wikipedia (extractInfoboxField, formatWikiTable) ·
keywords · persistence (buildTitle, cacheKey, ttlFor) ·
depth (chooseFetchPath, buildExtractUrl, capExtract) ·
recency (isRecencyQuery, isFresh age gate) ·
models (catalog + configured-provider filtering + default) ·
providers (dispatch, fallback chain order, 402/429/5xx/400/401/404/network
switching, empty reasoning answer, FORCE_FAIL_PROVIDERS) ·
title (extractTitle parse/strip/edge cases ×11) ·
auth (validators, requireAuth, chatOwnedBy, overflowIds ×11) ·
unavailable (formatUnavailable + allFailed/failures propagation through
answer → searchBar → route).
Client: `npm --prefix client run build` must stay green.

## Known issues / notes

- `formatWikiTable()` is basic — flat "List of ___" tables only; nested
  tables / rowspan cells may mangle (kept faithful to Java port).
- "list of" dispatch is `startsWith("list of")` — other table pages miss it.
- Sensitive/contested topics: answers are Wikipedia+LLM derived, not
  authoritative. API keys: never paste in chat/screenshots — rotate if exposed.
- Cache means answers can be up to 7d old (24h for incumbent) — "current/
  latest" queries enforce a 24h max-age and refetch live (Phase 5C).
- **OpenRouter free-tier limits FLUCTUATE wildly** (observed in one night:
  prompt cap 7980→1302 tokens; completion allowance shrinking per call).
  Auto-retries keep the app alive: `llm.js` completion-credit retry +
  `answer.js` context-trim retry (6B+), and now the 7B cross-provider chain.
  If *every* provider is down the user gets the friendly "providers
  unavailable" bubble instead of a raw status string — allowances replenish
  with time.
- **7B made the failure surface a UX surface:** a 401/404 on one provider now
  silently switches instead of surfacing, so a dead key is invisible until all
  providers fail. `failures[]` on the response and the plan panel are the
  places to look.
- Gemini + HF keys are blank in `.env`, so those providers are hidden. Adding
  a key is the cheapest way to widen the fallback pool — no code change.
- A dev session cookie is named **`wiki.sid`**. Scripts that assume
  `connect.sid` report "no session cookie" even when login succeeded
  (this stalled the 7D e2e run once).
- `FORCE_FAIL_PROVIDERS` must stay unset outside tests — it silently disables
  providers and makes the app look broken.

## CI

- **`.github/workflows/node.yml`** — `npm test` (server) + `npm run build` (client) on
  every push/PR to master. Node 24, npm cache, no secrets, no database.
- **`server/vitest.config.js`** — injects dummy provider keys (+ `MODEL`) into the test
  env so the suite is green on a fresh clone with no `.env`, and shadows a developer's
  real `.env` (dotenv never overrides). Every test stubs `fetch`, so the suite **can
  never spend API quota**. Gemini/HF keys stay unset on purpose to keep the
  "provider without a key is hidden" paths exercised.
  - Found and fixed while adding this: `providers.test.js` asserted
    `Authorization` matches `/^Bearer gsk_/` — i.e. it depended on the *real* Groq
    secret's format. Now it asserts the header equals `Bearer ${config.groqKey}`, so
    it passes with dummy keys and on CI. Never assert on real key shapes in tests.
- **`.github/workflows/java.yml`** — the live OpenRouter smoke step
  (`wikipediaAgent "What is a black hole?"` on every push to master) was **removed**: it
  spent real quota per push and made the build depend on a live API. Java compile +
  unit tests remain (offline). Run the live Java agent locally if needed.
- Net effect: the badge used to mean "the legacy Java code still compiles"; it now
  means "the 129 tests and the client build pass".

- MediaWiki `exchars` is silently capped at ~1200 (see Phase 5B) — never
  trust it for size; slice uncapped extracts yourself.
- `wikipediaAgentTest.java` still exists at root but CI for it was for the
  Java era; the active suite is Vitest.
