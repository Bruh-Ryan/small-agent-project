import { config } from "../config.js";
import { modelEntry, isAllowedModel, availableModels, defaultModel } from "./models.js";
import { PROVIDERS, providerEnabled, providerKey, parseModelId } from "./providers.js";

// Port of Java callModel(): posts a single user message to an OpenAI-compatible
// chat-completions endpoint and returns the assistant content. JSON.stringify
// handles escaping (the Java version did this by hand, which caused escape-loop
// bugs).
//
// `model` must be an allowlisted id (validated upstream in /api/ask).
//
// Phase 7: the selected provider is dispatched from the model's id, and when
// that provider is throttled or out of credits we transparently hop to another
// configured model — preferring a different provider — instead of failing.
//
// Demo/test hook: FORCE_FAIL_PROVIDERS=groq,openrouter (provider names, model
// ids, or "all") makes matching attempts fail without a network call, so the
// fallback chain and the "all tiers exhausted" path can be shown on demand.
// Unset in normal operation; read per call so tests can toggle it.
function forcedFailures() {
  const raw = process.env.FORCE_FAIL_PROVIDERS;
  if (!raw) return null;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.size > 0 ? set : null;
}

export async function callModel(prompt, maxTokens, model = defaultModel()) {
  const failures = [];
  const forced = forcedFailures();

  for (const attemptId of fallbackChain(model)) {
    const { provider, model: modelName } = parseModelId(attemptId);

    if (
      forced &&
      (forced.has("all") || forced.has(provider) || forced.has(attemptId) || forced.has(modelName))
    ) {
      console.warn(`[llm] forced skip ${attemptId} (FORCE_FAIL_PROVIDERS)`);
      failures.push({
        model: attemptId,
        reason: "forced failure (FORCE_FAIL_PROVIDERS)",
        forced: true,
      });
      continue;
    }

    try {
      const res = await postModel(prompt, maxTokens, provider, modelName);
      const result = await readResponse(res, prompt, maxTokens, provider, modelName);
      if (result.ok) {
        if (failures.length > 0) {
          console.log(
            `[llm] fallback OK: ${failures.map((f) => `${f.model} (${f.reason})`).join(", ")} → ${attemptId}`
          );
        }
        return {
          text: result.text,
          modelUsed: attemptId,
          fallback: failures[0] ?? null,
          failures,
        };
      }
      failures.push({ model: attemptId, reason: result.reason });
      // Any provider-level failure is worth another provider: an expired key
      // (401), a model the provider dropped (404), a rejected request (400) or
      // a throttled quota (429) all fail for one provider only, so keep going
      // through the chain instead of aborting.
    } catch (err) {
      console.error(`[llm] ${provider} request failed: ${err.message}`);
      failures.push({ model: attemptId, reason: err.message });
    }
  }

  console.error(`[llm] all models failed for ${model}: ${JSON.stringify(failures)}`);
  return {
    text: `Model call failed: ${failures.map((f) => `${f.model} (${f.reason})`).join("; ")}`,
    modelUsed: null,
    fallback: failures[0] ?? null,
    failures,
  };
}

// The selected model first, then up to MAX_FALLBACKS alternatives. Order
// matters: a quota/credit failure is a *provider* problem, so the first
// alternatives are one free model from each other configured provider, then
// that provider's remaining free models, and only then paid models.
export const MAX_FALLBACKS = 2;

// OpenRouter marks genuinely free models with a ":free" suffix.
const isFree = (m) => m.id.endsWith(":free");
const freeFirst = (a, b) => Number(isFree(b)) - Number(isFree(a));

export function fallbackChain(model) {
  const entry = modelEntry(model);
  if (!entry) return [model];
  const all = availableModels();
  const start = all.findIndex((m) => m.id === entry.id);
  const rest = all.filter((_, i) => i !== start);

  const others = rest.filter((m) => m.provider !== entry.provider).sort(freeFirst);
  const same = rest.filter((m) => m.provider === entry.provider).sort(freeFirst);

  // One model per other provider first — a provider outage is not fixed by
  // trying a second model on the same provider.
  const spread = [];
  const seen = new Set();
  for (const m of others) {
    if (seen.has(m.provider)) continue;
    seen.add(m.provider);
    spread.push(m);
  }
  const leftovers = others.filter((m) => !spread.includes(m));

  const alternatives = [...spread, ...leftovers, ...same].map((m) => m.id);
  return [entry.id, ...alternatives].slice(0, 1 + MAX_FALLBACKS);
}

// One provider call. Returns either the content string or an error string,
// plus whether another model is worth trying.
async function readResponse(res, prompt, maxTokens, provider, modelName) {
  let text = await res.text();

  // OpenRouter free keys cap COMPLETION credits too: asking for more
  // max_tokens than affordable → 402 even if the actual answer would fit.
  // The error tells us how many we CAN afford — retry with that amount.
  if (res.status === 402 && provider === "openrouter") {
    const affordable = Number(text.match(/can only afford (\d+)/)?.[1] ?? 0);
    if (affordable >= 50 && affordable < maxTokens) {
      const retryTokens = affordable - 10;
      console.warn(
        `[llm] 402 credits: requested ${maxTokens}, only ${affordable} affordable — retrying with ${retryTokens}`
      );
      res = await postModel(prompt, retryTokens, provider, modelName);
      text = await res.text();
    }
  }

  if (!res.ok) {
    // Surface API errors (404 unknown model, 402 out of credits, 429 rate
    // limit) as an actionable message instead of the raw body.
    console.error(`[llm] ${res.status} from ${provider} for model ${modelName}`);
    const detail = text.slice(0, 200).replace(/\s+/g, " ");
    const reason = `${res.status} from ${provider}`;
    return {
      ok: false,
      reason,
      text: `Model call failed (${reason} for ${modelName}): ${detail}`,
    };
  }

  const json = parseJsonSafe(text);
  if (!json || !Array.isArray(json.choices) || json.choices.length === 0) {
    return {
      ok: false,
      reason: "malformed response",
      text: `Model call failed (${modelName}). Raw response: ${text}`,
    };
  }

  const choice = json.choices[0] ?? {};
  const content = (choice.message?.content ?? "").trim();

  if (content === "") {
    // Reasoning models (gpt-oss, nemotron, ...) spend the token budget on
    // `reasoning` and can return an empty `content` with finish_reason
    // "length". We never surface raw chain-of-thought as the answer, so let
    // the fallback pick another model.
    const finish = choice.finish_reason ?? "unknown";
    const reason = finish === "length" ? "empty answer (token budget went to reasoning)" : "empty answer";
    console.warn(`[llm] ${provider}/${modelName} returned no content (finish=${finish})`);
    return {
      ok: false,
      reason,
      text: `Model call failed (${modelName} returned an empty answer; finish_reason=${finish}).`,
    };
  }

  return { ok: true, text: content };
}

// Turns a list of failed attempts into a friendly, user-facing explanation of
// "all providers are unavailable" — one line per provider with the reason
// translated into plain English, plus what the user can do about it.
export function formatUnavailable(failures = []) {
  if (!Array.isArray(failures) || failures.length === 0) {
    return "No language model is currently available. Please try again in a few minutes.";
  }

  // Collapse per-model reasons into one reason per provider.
  const byProvider = new Map();
  for (const f of failures) {
    const parsed = parseModelId(f.model);
    const provider = parsed?.provider ?? "openrouter";
    if (!byProvider.has(provider)) {
      byProvider.set(provider, { label: PROVIDERS[provider]?.label ?? provider, reasons: [] });
    }
    byProvider.get(provider).reasons.push(f.reason);
  }

  const describe = (reason) => {
    const r = String(reason ?? "").toLowerCase();
    if (r.includes("429")) return "rate limited — free tier quota is used up right now";
    if (r.includes("402")) return "out of credits — free tier allowance is exhausted";
    if (r.includes("forced")) return "disabled for this test (FORCE_FAIL_PROVIDERS)";
    if (r.includes("empty answer"))
      return "returned an empty answer (reasoning model used the whole token budget)";
    if (r.includes("malformed")) return "returned a malformed response";
    if (r.includes("fetch failed") || r.includes("network") || r.includes("econn"))
      return "could not be reached (network error)";
    if (r.startsWith("400")) return "rejected the request (bad request)";
    if (r.startsWith("401") || r.startsWith("403")) return "API key was rejected";
    if (r.startsWith("404")) return "model no longer offered by the provider";
    return reason || "unavailable";
  };

  const lines = [...byProvider.values()].map(
    (p) => `• ${p.label} — ${describe(p.reasons[0])}`
  );

  return [
    "**All language model providers are unavailable right now**, so I couldn't answer this one.",
    "",
    ...lines,
    "",
    "Free tiers reset periodically (per-minute / per-day / per-month). Please try again in a few minutes, switch to a different model in the picker, or add another provider key in `.env`.",
  ].join("\n");
}

async function postModel(prompt, maxTokens, provider, modelName) {
  const cfg = PROVIDERS[provider];
  const body = JSON.stringify({
    model: modelName,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerKey(provider)}`,
      "Content-Type": "application/json",
    },
    body,
  });
}

// Safe JSON parse: returns null (instead of throwing) for empty/non-JSON
// bodies — e.g. HTML error pages or rate-limit plain-text responses.
export function parseJsonSafe(body) {
  if (body == null) return null;
  const trimmed = String(body).trim();
  if (trimmed === "" || trimmed[0] !== "{") {
    console.warn(
      `[json] non-JSON response skipped: ${trimmed.slice(0, 80)}`
    );
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    console.warn(`[json] parse failed, skipping: ${e.message}`);
    return null;
  }
}

export { isAllowedModel, providerEnabled, config };
