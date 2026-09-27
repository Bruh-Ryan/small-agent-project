import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PROVIDERS,
  DEFAULT_PROVIDER,
  parseModelId,
  qualifyModelId,
  isProvider,
  providerEnabled,
  enabledProviders,
} from "../src/agent/providers.js";
import { callModel, fallbackChain, MAX_FALLBACKS, formatUnavailable } from "../src/agent/llm.js";
import { availableModels, modelEntry } from "../src/agent/models.js";
import { config } from "../src/config.js";

// Build a fetch Response-like stub.
function reply(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}
const okBody = (content) => ({ choices: [{ message: { content } }] });

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FORCE_FAIL_PROVIDERS;
});

describe("provider registry", () => {
  it("exposes the 5 OpenAI-compatible providers", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(
      ["gemini", "groq", "hf", "mistral", "openrouter"].sort()
    );
    for (const [id, p] of Object.entries(PROVIDERS)) {
      expect(p.baseUrl.startsWith("https://")).toBe(true);
      expect(p.baseUrl.endsWith("/v1") || p.baseUrl.includes("openai")).toBe(true);
      expect(typeof p.key()).toBe("string");
      expect(isProvider(id)).toBe(true);
    }
  });

  it("enables a provider only when its key is present", () => {
    // .env has OpenRouter + Groq + Mistral in this workspace.
    expect(providerEnabled("openrouter")).toBe(true);
    expect(providerEnabled("groq")).toBe(true);
    expect(providerEnabled("mistral")).toBe(true);
    expect(providerEnabled("gemini")).toBe(false); // empty in .env
    expect(providerEnabled("nope")).toBe(false);
    expect(enabledProviders().length).toBeGreaterThanOrEqual(3);
  });
});

describe("model id parsing", () => {
  it("treats a bare id as the default provider", () => {
    expect(parseModelId("openai/gpt-4o")).toEqual({
      provider: "openrouter",
      model: "openai/gpt-4o",
    });
  });

  it("splits a known provider prefix", () => {
    expect(parseModelId("groq:openai/gpt-oss-120b")).toEqual({
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
    expect(parseModelId("mistral:mistral-small-latest")).toEqual({
      provider: "mistral",
      model: "mistral-small-latest",
    });
  });

  it("does NOT treat an unknown prefix as a provider (OpenRouter :free ids)", () => {
    expect(parseModelId("qwen/qwen3.8-27b:free")).toEqual({
      provider: "openrouter",
      model: "qwen/qwen3.8-27b:free",
    });
    expect(parseModelId("some-vendor/model:tagged")).toEqual({
      provider: "openrouter",
      model: "some-vendor/model:tagged",
    });
  });

  it("qualifies ids, leaving the default provider bare", () => {
    expect(qualifyModelId("openrouter", "openai/gpt-4o")).toBe("openai/gpt-4o");
    expect(qualifyModelId("groq", "openai/gpt-oss-120b")).toBe("groq:openai/gpt-oss-120b");
    expect(DEFAULT_PROVIDER).toBe("openrouter");
  });

  it("returns null for non-strings/empty", () => {
    expect(parseModelId("")).toBe(null);
    expect(parseModelId(null)).toBe(null);
    expect(parseModelId(42)).toBe(null);
  });
});

describe("fallbackChain", () => {
  it("starts with the requested model, then one model per other provider", () => {
    const groq = availableModels().find((m) => m.provider === "groq");
    const chain = fallbackChain(groq.id);
    expect(chain[0]).toBe(groq.id);
    expect(chain.length).toBeLessThanOrEqual(1 + MAX_FALLBACKS);
    // Each subsequent entry is a different provider from the previous one.
    const providers = chain.map((id) => parseModelId(id).provider);
    expect(providers[1]).not.toBe("groq");
    for (let i = 2; i < providers.length; i++) {
      expect(providers[i]).not.toBe(providers[i - 1]);
    }
  });

  it("orders free models ahead of paid ones within each provider", () => {
    // A quota/credit failure is provider-wide, so the first alternative is one
    // model from each other configured provider. Within any single provider,
    // free models must still be tried before paid ones.
    const free = availableModels().filter((m) => m.id.endsWith(":free"));
    for (const first of availableModels().map((m) => m.id)) {
      const chain = fallbackChain(first);
      const byProvider = new Map();
      for (const id of chain) {
        const { provider } = parseModelId(id);
        if (!byProvider.has(provider)) byProvider.set(provider, []);
        byProvider.get(provider).push(id);
      }
      for (const ids of byProvider.values()) {
        const flags = ids.map((id) => id.endsWith(":free"));
        // free flags must be a prefix run (true...true, false...false)
        const firstPaid = flags.indexOf(false);
        if (firstPaid !== -1) {
          expect(flags.slice(firstPaid).every((f) => f === false)).toBe(true);
        }
      }
      if (free.length > 0) {
        const withPaidFirst = [...byProvider.values()].find((ids) =>
          ids.some((id) => !id.endsWith(":free")) &&
          ids.some((id) => id.endsWith(":free"))
        );
        if (withPaidFirst) {
          expect(withPaidFirst[0].endsWith(":free")).toBe(true);
        }
      }
    }
  });

  it("returns the id unchanged when it isn't in the catalog", () => {
    expect(fallbackChain("bogus:model")).toEqual(["bogus:model"]);
  });
});

describe("callModel dispatch", () => {
  it("posts to the provider base URL with that provider's key", async () => {
    const fetchMock = vi.fn(async () => reply(200, okBody("hello")));
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toBe("hello");
    expect(res.modelUsed).toBe("groq:openai/gpt-oss-20b");
    expect(res.fallback).toBe(null);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    // The configured key, whatever it is — never a hard-coded prefix, so this
    // passes with the dummy test keys from vitest.config.js and on CI.
    expect(init.headers.Authorization).toBe(`Bearer ${config.groqKey}`);
    expect(config.groqKey).not.toBe("");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-oss-20b"); // provider prefix stripped
    expect(body.max_tokens).toBe(50);
    expect(body.messages[0].content).toBe("hi");
  });

  it("routes a bare id to OpenRouter", async () => {
    const fetchMock = vi.fn(async () => reply(200, okBody("ok")));
    vi.stubGlobal("fetch", fetchMock);
    await callModel("hi", 50, "openai/gpt-4o-mini");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("openai/gpt-4o-mini");
  });
});

describe("auto-fallback", () => {
  it("hops to another provider on 429 and reports it", async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url) => {
      calls.push(url);
      if (calls.length === 1) return reply(429, "rate limit exceeded");
      return reply(200, okBody("recovered"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toBe("recovered");
    expect(res.modelUsed).not.toBe("groq:openai/gpt-oss-20b");
    expect(res.fallback).toEqual({
      model: "groq:openai/gpt-oss-20b",
      reason: "429 from groq",
    });
    expect(calls.length).toBe(2);
    expect(calls[1]).not.toBe(calls[0]);
  });

  it("retries OpenRouter's 402 with the affordable completion budget", async () => {
    const bodies = [
      reply(402, "This request requires more credits. You requested up to 200 tokens, but can only afford 120."),
      reply(200, okBody("trimmed answer")),
    ];
    let i = 0;
    const fetchMock = vi.fn(async () => bodies[i++]);
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 200, "openai/gpt-4o-mini");
    expect(res.text).toBe("trimmed answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_tokens).toBe(110);
  });

  it("falls back to another provider when a 402 has no affordable figure", async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url) => {
      calls.push(url);
      if (calls.length === 1) return reply(402, "out of credits");
      return reply(200, okBody("from other provider"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 200, "openai/gpt-4o-mini");
    expect(res.text).toBe("from other provider");
    expect(res.fallback.reason).toBe("402 from openrouter");
  });

  it("switches providers on a 400 (rejected request) instead of aborting", async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url) => {
      calls.push(url);
      if (calls.length === 1) return reply(400, "unsupported parameter");
      return reply(200, okBody("other provider answered"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toBe("other provider answered");
    expect(res.modelUsed).not.toBe("groq:openai/gpt-oss-20b");
    expect(res.fallback.reason).toBe("400 from groq");
    expect(calls[1]).not.toBe(calls[0]);
  });

  it("switches providers on a 401 (expired or invalid key)", async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url) => {
      calls.push(url);
      if (calls.length === 1) return reply(401, "invalid api key");
      return reply(200, okBody("key on another provider works"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toBe("key on another provider works");
    expect(res.fallback.reason).toBe("401 from groq");
  });

  it("switches providers on a 404 (model dropped upstream)", async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url) => {
      calls.push(url);
      if (calls.length === 1) return reply(404, "model not found");
      return reply(200, okBody("answered elsewhere"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toBe("answered elsewhere");
    expect(res.fallback.reason).toBe("404 from groq");
  });

  it("reports every attempt when a 400 fails on all models", async () => {
    const fetchMock = vi.fn(async () => reply(400, "unsupported parameter"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.modelUsed).toBe(null);
    expect(res.failures.length).toBe(1 + MAX_FALLBACKS);
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_FALLBACKS);
  });

  it("survives a network error by trying the next provider", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error("fetch failed");
      return reply(200, okBody("second try"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toBe("second try");
    expect(res.fallback.reason).toBe("fetch failed");
  });

  it("reports every attempt when all models fail", async () => {
    const fetchMock = vi.fn(async () => reply(429, "nope"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toMatch(/^Model call failed:/);
    expect(res.modelUsed).toBe(null);
    expect(fetchMock.mock.calls.length).toBe(1 + MAX_FALLBACKS);
  });

  it("treats a malformed success body as a miss and tries the next model", async () => {
    const fetchMock = vi.fn(async () => reply(200, { unexpected: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 50, "groq:openai/gpt-oss-20b");
    expect(res.text).toMatch(/malformed response/);
    expect(res.text.match(/malformed response/g).length).toBe(1 + MAX_FALLBACKS);
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_FALLBACKS);
  });

  it("falls back when a reasoning model returns no content (gpt-oss case)", async () => {
    // Real Groq behaviour: a small max_tokens is consumed by `reasoning`,
    // leaving content:"" with finish_reason "length".
    const bodies = [
      reply(200, {
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning: "thinking about the answer" },
          },
        ],
      }),
      reply(200, okBody("plain answer")),
    ];
    let i = 0;
    const fetchMock = vi.fn(async () => bodies[i++]);
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 16, "groq:openai/gpt-oss-120b");
    expect(res.text).toBe("plain answer");
    expect(res.fallback.reason).toMatch(/empty answer/);
    // Raw chain-of-thought must never leak into the answer.
    expect(res.text).not.toMatch(/thinking about/);
  });

  it("falls back on an empty answer even when finish_reason is not length", async () => {
    const bodies = [
      reply(200, { choices: [{ finish_reason: "stop", message: { content: "   " } }] }),
      reply(200, okBody("second model")),
    ];
    let i = 0;
    vi.stubGlobal("fetch", vi.fn(async () => bodies[i++]));
    const res = await callModel("hi", 200, "groq:openai/gpt-oss-120b");
    expect(res.text).toBe("second model");
    expect(res.fallback.reason).toBe("empty answer");
  });

  it("returns trimmed content, not reasoning, for a normal response", async () => {
    const fetchMock = vi.fn(async () =>
      reply(200, {
        choices: [
          {
            finish_reason: "stop",
            message: { content: "  final answer  ", reasoning: "hidden thoughts" },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await callModel("hi", 200, "groq:qwen/qwen3.8-27b");
    expect(res.text).toBe("final answer");
    expect(res.modelUsed).toBe("groq:qwen/qwen3.8-27b");
  });
});

// The demo/test hook: FORCE_FAIL_PROVIDERS lets us prove the fallback chain
// (and the exhausted-message path) on demand without burning real quota.
describe("FORCE_FAIL_PROVIDERS hook", () => {
  it("is inert when unset", async () => {
    const fetchMock = vi.fn(async () => reply(200, okBody("ok")));
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.FORCE_FAIL_PROVIDERS;
    const res = await callModel("hi", 50, "groq:qwen/qwen3.8-27b");
    expect(res.modelUsed).toBe("groq:qwen/qwen3.8-27b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips a forced provider and rescues with the next one (no request sent to it)", async () => {
    process.env.FORCE_FAIL_PROVIDERS = "groq,openrouter";
    const fetchMock = vi.fn(async () => reply(200, okBody("mistral answered")));
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 50, "groq:qwen/qwen3.8-27b");
    expect(res.text).toBe("mistral answered");
    expect(res.modelUsed).toBe("mistral:ministral-8b-latest");
    // Only the rescuing provider was actually called.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("mistral");
    // The first failure is reported so the UI can show the fallback.
    expect(res.fallback).toEqual({
      model: "groq:qwen/qwen3.8-27b",
      reason: "forced failure (FORCE_FAIL_PROVIDERS)",
      forced: true,
    });
  });

  it("can force a single model id rather than a whole provider", async () => {
    process.env.FORCE_FAIL_PROVIDERS = "qwen/qwen3.8-27b:free";
    const fetchMock = vi.fn(async () => reply(200, okBody("groq answered")));
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 50, "qwen/qwen3.8-27b:free");
    expect(res.modelUsed).toBe("groq:qwen/qwen3.8-27b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("groq");
  });

  it("'all' fails every attempt without a single network call", async () => {
    process.env.FORCE_FAIL_PROVIDERS = "all";
    const fetchMock = vi.fn(async () => reply(200, okBody("should not happen")));
    vi.stubGlobal("fetch", fetchMock);

    const res = await callModel("hi", 50, "groq:qwen/qwen3.8-27b");
    expect(res.modelUsed).toBe(null);
    expect(res.text).toMatch(/^Model call failed:/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.failures).toHaveLength(1 + MAX_FALLBACKS);
    expect(res.failures.every((f) => f.forced === true)).toBe(true);
  });

  it("covers all three configured providers in one chain", async () => {
    const chain = fallbackChain("groq:qwen/qwen3.8-27b");
    const providers = chain.map((id) => parseModelId(id).provider);
    expect(new Set(providers)).toEqual(new Set(["groq", "openrouter", "mistral"]));
  });

  it("every chain is flash-first: the smallest model of each provider", () => {
    // Groq leads qwen3.8-27b, Mistral leads ministral-8b, OpenRouter
    // free-first ranks the ":free" tier — so any 3-hop chain is all-flash.
    expect(modelEntry(fallbackChain("groq:qwen/qwen3.8-27b")[0]).model).toBe(
      "qwen/qwen3.8-27b"
    );
    const chain = fallbackChain("mistral:ministral-8b-latest");
    expect(chain.map((id) => parseModelId(id).provider)).toEqual([
      "mistral",
      "openrouter",
      "groq",
    ]);
    expect(chain[1].endsWith(":free")).toBe(true);
  });
});
