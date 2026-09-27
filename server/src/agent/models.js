// Curated model registry (Phase 5D, extended Phase 7). Users pick from this
// allowlist only — arbitrary model IDs are rejected (400) so a key can't be
// spent on unknown/abusive models.
//
// Model ids are "provider:model" (e.g. "groq:openai/gpt-oss-120b"). A bare
// id means OpenRouter, which keeps ids chosen before Phase 7 working. The
// prefix only counts when it names a known provider, so OpenRouter ids that
// themselves contain a colon ("qwen/qwen3.8-27b:free") stay intact.
//
// Every entry below was verified against the provider's live /models catalog.
// A model belonging to a provider with no key in .env is hidden from
// GET /api/models and rejected by resolveModel().
//
// Side-effect import: guarantees .env is loaded before we read it.
import "../config.js";
import {
  PROVIDERS,
  DEFAULT_PROVIDER,
  isProvider,
  parseModelId,
  qualifyModelId,
  providerEnabled,
} from "./providers.js";

function group(provider, entries) {
  return Object.entries(entries).map(([model, label]) => ({
    id: qualifyModelId(provider, model),
    model,
    label,
    provider,
    providerLabel: PROVIDERS[provider].label,
  }));
}

// Grouped by provider — this is the picker's display order.
const CATALOG = [
  ...group(DEFAULT_PROVIDER, {
    "openai/gpt-4o": "GPT-4o (default)",
    "openai/gpt-4o-mini": "GPT-4o Mini (fast/cheap)",
    "anthropic/claude-sonnet-5": "Claude Sonnet 5",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
    "deepseek/deepseek-chat-v3-0324": "DeepSeek V3",
    "qwen/qwen3.8-27b:free": "Qwen3.8 27B (free)",
    // Zero-credit ":free" tier — verified live against /api/v1/models.
    "google/gemma-4-31b-it:free": "Gemma 4 31B (free)",
    "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super 120B (free)",
    "nvidia/nemotron-3.5-lightning:free": "Nemotron 3.5 Lightning (free)",
  }),
  ...group("groq", {
    // Flash-first: the smallest/fastest model leads each provider group so the
    // picker and the fallback chain both prefer cheap, quick models.
    "qwen/qwen3.8-27b": "Qwen3.8 27B (flash)",
    "openai/gpt-oss-20b": "GPT-OSS 20B (fastest)",
    "openai/gpt-oss-120b": "GPT-OSS 120B",
  }),
  ...group("gemini", {
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
  }),
  ...group("mistral", {
    "ministral-8b-latest": "Ministral 8B (flash)",
    "mistral-small-latest": "Mistral Small (fast)",
    "mistral-medium-latest": "Mistral Medium (best)",
  }),
  ...group("hf", {
    "deepseek-ai/DeepSeek-V3-0324": "DeepSeek V3",
    "Qwen/Qwen3-235B-A22B": "Qwen3 235B-A22B",
  }),
];

// Flat id → entry map, for O(1) validation.
const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

// Ids whose provider has a key in .env. This is exactly what the picker shows.
export function availableModels() {
  return CATALOG.filter((e) => providerEnabled(e.provider));
}

export function modelEntry(id) {
  return BY_ID.get(id) ?? null;
}

export function isAllowedModel(id) {
  return BY_ID.has(id);
}

// Returns the candidate when it is allowlisted AND its provider is
// configured; otherwise null. Map lookups are prototype-chain safe, so
// "constructor"/"__proto__" simply miss.
export function resolveModel(candidate) {
  if (candidate == null || candidate === "") return null;
  if (!BY_ID.has(candidate)) return null;
  return providerEnabled(BY_ID.get(candidate).provider) ? candidate : null;
}

// Default comes from .env MODEL= when that model is usable, else the first
// model of the first enabled provider (falling back to the OpenRouter default
// so the app still boots with no keys at all).
export function defaultModel() {
  const configured = process.env.MODEL;
  if (configured) {
    const resolved = resolveModel(configured);
    if (resolved) return resolved;
    console.warn(`[models] MODEL=${configured} is unknown or its provider has no key — ignoring`);
  }
  const first = availableModels()[0];
  return first ? first.id : "openai/gpt-4o";
}

// Back-compat constant (frozen at import): matches defaultModel() as long as
// the environment is read before this module loads — which config.js, imported
// above, guarantees.
export const DEFAULT_MODEL = defaultModel();

// Curated list for GET /api/models, grouped by provider for the picker's
// <optgroup> sections.
export function modelList() {
  return {
    models: availableModels().map((m) => ({
      id: m.id,
      label: m.label,
      provider: m.provider,
      providerLabel: m.providerLabel,
    })),
    default: DEFAULT_MODEL,
  };
}

export { parseModelId, isProvider };
