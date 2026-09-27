// Dev helper: send one tiny real prompt through every curated model of every
// configured provider, so a bad id / dead free tier / wrong base URL is caught
// before the agent relies on it. Uses callModel() so fallback is exercised too.
//
// Usage:
//   node scripts/llm-smoke.js                # one prompt per configured model
//   node scripts/llm-smoke.js --default      # only the default model
//   node scripts/llm-smoke.js <model-id>     # a specific model
import { callModel } from "../src/agent/llm.js";
import { availableModels, DEFAULT_MODEL } from "../src/agent/models.js";
import { enabledProviders } from "../src/agent/providers.js";

const PROMPT = "Reply with exactly one word: ok";
const args = process.argv.slice(2);

let targets;
if (args[0] === "--default") {
  targets = [DEFAULT_MODEL];
} else if (args[0] && !args[0].startsWith("--")) {
  targets = [args[0]];
} else {
  targets = availableModels().map((m) => m.id);
}

console.log(`Configured providers: ${enabledProviders().join(", ") || "(none)"}`);
console.log(`Default model:        ${DEFAULT_MODEL}`);
console.log(`Testing ${targets.length} model(s)\n`);

let ok = 0;
const failed = [];

for (const id of targets) {
  const started = Date.now();
  const res = await callModel(PROMPT, 16, id);
  const ms = Date.now() - started;
  const text = (res.text ?? "").replace(/\s+/g, " ").trim();
  if (res.modelUsed) {
    ok++;
    const note = res.fallback ? ` (fell back from ${res.fallback.reason})` : "";
    console.log(`  PASS  ${id.padEnd(42)} ${String(ms).padStart(5)}ms  modelUsed=${res.modelUsed}${note}`);
    console.log(`        -> ${text.slice(0, 90)}`);
  } else {
    failed.push(id);
    console.log(`  FAIL  ${id.padEnd(42)} ${String(ms).padStart(5)}ms`);
    console.log(`        -> ${text.slice(0, 300)}`);
  }
}

console.log(`\n${ok}/${targets.length} models answered.`);
if (failed.length) {
  console.log(`Failed: ${failed.join(", ")}`);
  process.exitCode = 1;
}
