// LLM provider registry (Phase 7).
//
// Every provider here speaks the OpenAI chat-completions dialect, so the
// only differences are the base URL and the API key — llm.js posts the same
// JSON body to whichever provider the selected model belongs to.
//
// A provider is ENABLED when its key is present in .env. Disabled providers
// are hidden from GET /api/models and rejected by resolveModel(), so the
// client can never pick a model whose key we don't have.
import { config } from "../config.js";

export const PROVIDERS = Object.freeze({
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    key: () => config.apiKey,
  },
  groq: {
    label: "Groq (free)",
    baseUrl: "https://api.groq.com/openai/v1",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    key: () => config.groqKey,
  },
  gemini: {
    label: "Gemini (free)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    // Gemini exposes no OpenAI-compatible /models endpoint; its catalog is
    // curated below instead of discovered.
    modelsUrl: null,
    key: () => config.geminiKey,
  },
  mistral: {
    label: "Mistral (free)",
    baseUrl: "https://api.mistral.ai/v1",
    modelsUrl: "https://api.mistral.ai/v1/models",
    key: () => config.mistralKey,
  },
  hf: {
    label: "Hugging Face",
    baseUrl: "https://router.huggingface.co/v1",
    modelsUrl: "https://router.huggingface.co/v1/models",
    key: () => config.hfToken,
  },
});

export const DEFAULT_PROVIDER = "openrouter";

export function isProvider(id) {
  return typeof id === "string" && Object.hasOwn(PROVIDERS, id);
}

export function providerKey(id) {
  return PROVIDERS[id]?.key?.() || "";
}

export function providerEnabled(id) {
  return isProvider(id) && providerKey(id).trim() !== "";
}

export function enabledProviders() {
  return Object.keys(PROVIDERS).filter(providerEnabled);
}

// Splits "groq:openai/gpt-oss-120b" → { provider: "groq", model:
// "openai/gpt-oss-120b" }. A prefix only counts when it is a KNOWN provider,
// so OpenRouter ids that themselves contain a colon ("qwen/qwen3.8-27b:free")
// are not mistaken for a provider prefix.
export function parseModelId(id) {
  if (typeof id !== "string" || id === "") return null;
  const colon = id.indexOf(":");
  if (colon > 0) {
    const prefix = id.slice(0, colon);
    if (isProvider(prefix)) {
      return { provider: prefix, model: id.slice(colon + 1) };
    }
  }
  return { provider: DEFAULT_PROVIDER, model: id };
}

// Qualified id used in the picker / debug payloads: bare for the default
// provider, prefixed otherwise.
export function qualifyModelId(provider, model) {
  return provider === DEFAULT_PROVIDER ? model : `${provider}:${model}`;
}
