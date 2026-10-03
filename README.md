# Wikipedia Agent — THE MOST OVERPOWERED WIKIPEDIA SEARCH IN LLM HISTORY

One truth source. Many free-tier brains. Zero hallucinations spared.

[![Node CI](https://img.shields.io/github/actions/workflow/status/Bruh-Ryan/small-agent-project/node.yml?branch=master&label=Node%20CI&color=2ea44f)](https://github.com/Bruh-Ryan/small-agent-project/actions/workflows/node.yml)
[![Java CI](https://img.shields.io/github/actions/workflow/status/Bruh-Ryan/small-agent-project/java.yml?branch=master&label=Java%20CI&color=2ea44f)](https://github.com/Bruh-Ryan/small-agent-project/actions/workflows/java.yml)
[![Secret scan](https://img.shields.io/github/actions/workflow/status/Bruh-Ryan/small-agent-project/secret-scan.yml?branch=master&label=Secret%20scan&color=2ea44f)](https://github.com/Bruh-Ryan/small-agent-project/actions/workflows/secret-scan.yml)
![Tests](https://img.shields.io/badge/tests-138-passing)
![Node](https://img.shields.io/badge/Node-24-green)

Ask it what it can do — it answers: **the overpowered Wikipedia search.**

## What it does

- Plans the lookup, fetches Wikipedia (lead / full / tables / infobox), answers only from sources.
- Any-error fallback across 16 free-tier models (OpenRouter, Groq, Mistral) — one dead provider never fails you.
- Follow-up rewrite + topic-switch detection + recency-aware cache (24h for current stuff, 7d rest).
- Auth + 15 chats/user + AI titles, all grounded in Wikipedia.

## Quickstart

```bash
git clone https://github.com/Bruh-Ryan/small-agent-project.git
cd small-agent-project
cp .env.example .env   # fill keys below
npm install
npm run dev            # server :3001 + client :5173
npm test               # 138 tests, ~3s, zero quota
```

Open `http://localhost:5173`. Register, ask anything.

## Config

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `MISTRAL_API_KEY` | LLM providers (only keyed ones appear in picker) |
| `MONGODB_URI` | Atlas (`Chat-History` DB) |
| `SESSION_SECRET` | session signing (cookie `wiki.sid`) |
| `MODEL` | default model id, blank = first enabled |
| `FORCE_FAIL_PROVIDERS` | test-only forced failures, keep unset |

Live demo: single Docker image on Render Free (`Dockerfile` at root, health `/api/health`). Cold start after idle ~60s.

## Testing & CI

- Vitest, fully mocked, never spends quota. Node CI runs `npm test` + client build; Java CI compiles legacy agent only; secret-scan runs gitleaks on working tree.

## Security note

Commit `3e2921f` leaked an `OPENROUTER_API_KEY`; rotated 2026-09-27. Never commit `.env`. If gitleaks fires: revoke first, fix file second.

## Limits

- Flat-table parsing only; `list of` dispatch is `startsWith`; free-tier quotas fluctuate (fallback chain covers it); cache up to 7d (24h for current queries).

Public domain. Use freely.
