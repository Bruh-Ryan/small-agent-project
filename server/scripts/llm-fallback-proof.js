// Live proof that the Phase 7 fallback chain works across providers, and that
// the "all free tiers exhausted" path produces a useful user-facing message.
//
// Each scenario forces the first provider(s) of the real chain to fail (no
// network call for them) and lets the last one hit the live API — so the three
// rescue scenarios cost one real request each, and the all-forced scenario
// costs none. networkCalls below counts real fetches, not scenarios.
//
// Usage:  node scripts/llm-fallback-proof.js
import { callModel, fallbackChain, formatUnavailable } from "../src/agent/llm.js";
import { parseModelId } from "../src/agent/providers.js";

const PROMPT = "Reply with exactly one word: ok";
const TOKEN_BUDGET = 16;

// Count only fetches that actually leave the process.
const realFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = (...args) => {
  networkCalls++;
  return realFetch(...args);
};

let failures = 0;

const providerOf = (id) => parseModelId(id).provider;

async function scenario({ name, start, force, expectProvider, expectSuccess = true }) {
  console.log(`\n=== ${name} ===`);
  const chain = fallbackChain(start);
  console.log(`  chain:   ${chain.join("  ->  ")}`);
  console.log(`  forced:  ${[...force].join(", ") || "(none)"}`);

  const before = networkCalls;
  process.env.FORCE_FAIL_PROVIDERS = [...force].join(",");
  const started = Date.now();
  let res;
  try {
    res = await callModel(PROMPT, TOKEN_BUDGET, start);
  } finally {
    delete process.env.FORCE_FAIL_PROVIDERS;
  }
  const ms = Date.now() - started;
  const spent = networkCalls - before;

  const gotProvider = res.modelUsed ? providerOf(res.modelUsed) : null;
  const ok = expectSuccess
    ? gotProvider === expectProvider
    : res.modelUsed === null;

  console.log(`  answered: ${res.modelUsed ?? "(nothing)"}  [${ms}ms, ${spent} real call(s)]`);
  console.log(`  text:     ${res.text.replace(/\s+/g, " ").slice(0, 80)}`);
  if (res.failures?.length) {
    console.log(
      `  skipped:  ${res.failures.map((f) => `${f.model} (${f.reason})`).join(", ")}`
    );
  }

  if (ok) {
    console.log(`  PASS — ${expectSuccess ? `rescued by ${expectProvider}` : "all providers failed as expected"}`);
  } else {
    failures++;
    console.log(
      `  FAIL — expected ${expectSuccess ? `a ${expectProvider} answer` : "no answer"}, got ${res.modelUsed ?? "none"}`
    );
  }

  if (!expectSuccess) {
    console.log("\n  --- message the user sees ---");
    for (const line of formatUnavailable(res.failures).split("\n")) {
      console.log(`  | ${line}`);
    }
  }
  return res;
}

// 1. One forced chain: Groq is down, OpenRouter is down -> Mistral must answer.
await scenario({
  name: "1. Groq down + OpenRouter down -> falls back to Mistral",
  start: "groq:qwen/qwen3.8-27b",
  force: ["groq", "openrouter"],
  expectProvider: "mistral",
});

// 2. Mistral is down, OpenRouter is down -> Groq must answer.
await scenario({
  name: "2. Mistral down + OpenRouter down -> falls back to Groq",
  start: "mistral:ministral-8b-latest",
  force: ["mistral", "openrouter"],
  expectProvider: "groq",
});

// 3. OpenRouter is down, Groq is down -> Mistral must answer.
await scenario({
  name: "3. OpenRouter down + Groq down -> falls back to Mistral",
  start: "qwen/qwen3.8-27b:free",
  force: ["openrouter", "groq"],
  expectProvider: "mistral",
});

// 4. Every provider down -> the user gets the "unavailable" message.
await scenario({
  name: "4. All providers down -> friendly 'unavailable' message",
  start: "groq:qwen/qwen3.8-27b",
  force: ["all"],
  expectSuccess: false,
});

console.log(
  `\n${failures === 0 ? "ALL SCENARIOS PASSED" : `${failures} SCENARIO(S) FAILED`} (${networkCalls} real API calls)`
);
process.exitCode = failures === 0 ? 0 : 1;
