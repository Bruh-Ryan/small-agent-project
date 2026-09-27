// Dev helper: show OpenRouter's currently-served free (":free") models with
// their context length, so the curated allowlist stays honest.
//
// Usage:  node scripts/list-openrouter-free.js [minContextChars]
import { config } from "../src/config.js";

const minContext = Number(process.argv[2] || 0);

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${config.apiKey}` },
});
if (!res.ok) {
  console.error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const json = await res.json();
const free = (json.data ?? [])
  .filter((m) => m.id.endsWith(":free"))
  .map((m) => ({ id: m.id.replace(/:free$/, ""), ctx: m.context_length ?? 0 }))
  .filter((m) => m.ctx >= minContext)
  .sort((a, b) => b.ctx - a.ctx);

console.log(`${free.length} free models (context >= ${minContext}):`);
for (const m of free) console.log(`  ${m.id}  ctx=${m.ctx}`);
