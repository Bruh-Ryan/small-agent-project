// Dev helper: list the models each configured provider actually serves, so
// the curated allowlist in agent/models.js matches reality.
//
// Usage:  node scripts/list-provider-models.js [groq|mistral|gemini|hf|openrouter]
import { PROVIDERS, providerEnabled, providerKey } from "../src/agent/providers.js";

const only = process.argv[2];
const targets = Object.keys(PROVIDERS).filter(
  (id) => !only || id === only
);

for (const id of targets) {
  if (!providerEnabled(id)) {
    console.log(`\n[${id}] disabled (no key in .env)`);
    continue;
  }
  const p = PROVIDERS[id];
  let res;
  try {
    res = await fetch(p.modelsUrl, {
      headers: { Authorization: `Bearer ${providerKey(id)}` },
    });
  } catch (err) {
    console.log(`\n[${id}] request failed: ${err.message}`);
    continue;
  }
  if (!res.ok) {
    console.log(`\n[${id}] ${res.status}: ${(await res.text()).slice(0, 160)}`);
    continue;
  }
  const json = await res.json();
  const ids = (json?.data ?? []).map((m) => m.id).sort();
  console.log(`\n[${id}] ${ids.length} models:`);
  console.log(ids.join("\n"));
}
