# AGENTS.md

Working rules for this repo. Read before making changes. The goal is a *reliable*
workflow: guess nothing, verify once, and don't burn API quota while testing.

## Layout

```
server/   Express API on :3001 (ESM, vitest)
client/   React + Vite on :5173
```

`npm --prefix server test` · `npm --prefix server run dev` ·
`npm --prefix client run dev` · `npm --prefix client run build`

## API routes (do not guess these)

Auth is mounted at `/api/auth`, **not** `/api/login`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` | creates the user **and logs them in** (sets cookie) |
| POST | `/api/auth/login` | `401` when the credentials are wrong |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | |
| GET | `/api/models` | `{ models, default }` — used by the picker |
| GET | `/api/sessions` · `/api/sessions/:id` | |
| PATCH | `/api/sessions/:id` | rename |
| DELETE | `/api/sessions/:id` | |
| POST | `/api/ask` | `{ question, model?, sessionId?, chatId? }` |
| GET | `/api/health` | |

**Session cookie is named `wiki.sid`**, not `connect.sid`. A script that hard-codes
`connect.sid` gets "no session cookie" even though login succeeded. If a request
comes back `401`, the cookie name/jar is the first thing to check — not the route.

## Verifying changes

- **Restart `:3001` after editing anything in `server/src/**`.** Edits are not hot-reloaded
  in a started process, so a stale server silently tests the old code.
- **Run the suite once per change, not repeatedly.** `npm --prefix server test` is ~3s.
- **Read the tail of the log, not the whole thing.** Pipe through `Select-String` for
  `Test Files|Tests |FAIL` rather than dumping thousands of lines.
- **Unit tests use mocked `fetch` — they cost no quota.** Use them for logic changes.
- **Live scripts cost real API calls.** Only run them when the user asks or when a
  change touches provider wiring, and prefer the narrowest script:
  - `node server/scripts/llm-fallback-proof.js` — 4 fallback scenarios, 3 real calls.
  - `node server/scripts/llm-smoke.js [modelId]` — one model, or all 16 (slow; one
    model took 59s).
  - `node server/scripts/phase7-e2e.js <login|models|ask|cleanup>` — full HTTP path.
- **Never gate success on a live API result.** Free-tier 429s are real and flaky, so
  only *forced* paths (`FORCE_FAIL_PROVIDERS`) are pass/fail. Live runs are
  observational.
- **Proving a fallback works must involve an actual failed attempt.** A mock that
  returns 200 proves nothing. Force the failure, then assert the next provider answers.

## PowerShell 5.1 (this machine)

- No `&&`. Use `cmd1; if ($?) { cmd2 }`.
- Avoid inline `node -e` containing `$`; PowerShell eats it. Write a script file.
- `npm ... 2>&1` can abort the tool call — redirect instead:
  `$out = npm test 2>&1; $out | Out-File $env:TEMP\x.log; $out | Select-String 'Tests '`
- `rg` is **not installed**; use the grep tool.
- `Get-NetTCPConnection -LocalPort 3001 -State Listen` finds the server to restart.
- Each tool call is a fresh shell, so `$env:` set in one call does not persist. The
  server process keeps what it inherited at spawn time.

## LLM behaviour worth knowing

- `callModel` walks `fallbackChain`: the selected model, then one free model from each
  *other* provider, then leftovers, capped by `MAX_FALLBACKS = 2`.
- **Any** provider failure falls through to the next model — 402/429/5xx, network
  errors, and also 400/401/404 (bad key, dropped model, rejected request). Do not
  reintroduce a "stop on non-retryable status" shortcut; a single broken provider
  must not fail the user when another provider is configured.
- Reasoning models can return empty `content` with `finish_reason: "length"`. That is
  treated as a miss and falls back. Raw `reasoning` is never surfaced as an answer.
- When every model fails, the API returns **HTTP 200** with a friendly
  "providers unavailable" bubble, `model: null`, `requestedModel`, and `failures[]`.
  This is intentional — it is a normal, persisted chat turn, not an error response.
- `FORCE_FAIL_PROVIDERS` is a **test/demo hook only**. Read per request from the
  environment; accepts provider names, model ids, or `all`. Keep it unset in normal use.
- Only providers with a key in `.env` appear in the catalog; Gemini and HF are
  currently blank and therefore hidden.

## Secrets

`.env` holds API keys, `MONGODB_URI`, and `SESSION_SECRET`. Never print, paste, log, or
commit it, and never echo account passwords into output. Reference variables by name
only. `meca_riot` is the user's real account — do not modify or delete it. Test
accounts (e.g. `phase7demo`) must be removed with `phase7-e2e.js cleanup`.

## Before calling a task done

1. `npm --prefix server test` — all green.
2. `npm --prefix client run build` — green (only if client code changed).
3. For provider changes, one `llm-fallback-proof.js` run.
4. Update `progress.md` (phase status, test count, repo map, known issues).
