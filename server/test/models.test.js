import { describe, it, expect } from "vitest";
import {
  DEFAULT_MODEL,
  resolveModel,
  isAllowedModel,
  modelEntry,
  modelList,
  availableModels,
  defaultModel,
} from "../src/agent/models.js";
import { providerEnabled, enabledProviders } from "../src/agent/providers.js";

describe("model allowlist", () => {
  it("accepts every model whose provider is configured", () => {
    for (const entry of availableModels()) {
      expect(resolveModel(entry.id)).toBe(entry.id);
    }
  });

  it("rejects unknown / arbitrary model ids", () => {
    expect(resolveModel("anthropic/claude-3.5-sonnet")).toBe(null); // stale id
    expect(resolveModel("openai/gpt-4o:free-bad")).toBe(null);
    expect(resolveModel("../../etc/passwd")).toBe(null);
    expect(resolveModel("not a model")).toBe(null);
    expect(resolveModel("groq:openai/gpt-oss-999b")).toBe(null); // not curated
  });

  it("rejects prototype-chain names (Map lookup guard)", () => {
    expect(resolveModel("constructor")).toBe(null);
    expect(resolveModel("toString")).toBe(null);
    expect(resolveModel("valueOf")).toBe(null);
    expect(resolveModel("hasOwnProperty")).toBe(null);
    expect(resolveModel("__proto__")).toBe(null);
    expect(isAllowedModel("__proto__")).toBe(false);
  });

  it("treats null/undefined/empty as 'no selection' (→ default upstream)", () => {
    expect(resolveModel(null)).toBe(null);
    expect(resolveModel(undefined)).toBe(null);
    expect(resolveModel(""));
    expect(resolveModel("")).toBe(null);
  });

  it("rejects a curated model whose provider has no key", () => {
    // Gemini/HF are unconfigured in .env, so their curated ids must resolve
    // to null rather than being callable.
    if (!providerEnabled("gemini")) {
      expect(isAllowedModel("gemini:gemini-2.5-flash")).toBe(true);
      expect(resolveModel("gemini:gemini-2.5-flash")).toBe(null);
    }
  });

  it("DEFAULT_MODEL is always an allowlisted, configured model", () => {
    expect(isAllowedModel(DEFAULT_MODEL)).toBe(true);
    expect(providerEnabled(modelEntry(DEFAULT_MODEL).provider)).toBe(true);
    expect(DEFAULT_MODEL).toBe(defaultModel());
  });

  it("modelList groups by provider with labels for the picker", () => {
    const { models, default: def } = modelList();
    expect(models.length).toBe(availableModels().length);
    expect(def).toBe(DEFAULT_MODEL);
    const providers = new Set(models.map((m) => m.provider));
    // Grouped order: each provider appears in one contiguous run.
    const seen = [];
    for (const m of models) if (seen.at(-1) !== m.provider) seen.push(m.provider);
    expect(seen).toEqual([...providers]);
    for (const m of models) {
      expect(typeof m.label).toBe("string");
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.providerLabel).toBeTruthy();
    }
  });

  it("hides models from providers without a key", () => {
    for (const p of enabledProviders()) {
      expect(availableModels().some((m) => m.provider === p)).toBe(true);
    }
  });
});
