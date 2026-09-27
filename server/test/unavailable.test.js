import { describe, it, expect, vi, afterEach } from "vitest";
import { formatUnavailable } from "../src/agent/llm.js";
import { answerWithContext } from "../src/agent/answer.js";
import { searchBar } from "../src/agent/searchBar.js";
import { PROVIDERS } from "../src/agent/providers.js";

vi.mock("../src/agent/llm.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, callModel: vi.fn() };
});

vi.mock("../src/wikipedia/search.js", () => ({
  searchWikipediaTitles: vi.fn(async () => []),
}));
vi.mock("../src/wikipedia/summary.js", () => ({
  fetchWikipediaSummary: vi.fn(async () => ({
    resolvedTitle: "Black hole",
    summary: "A black hole is a region of spacetime with extreme gravity.",
  })),
  fetchWikipediaFullExtract: vi.fn(async () => ({
    resolvedTitle: "Black hole",
    summary: "A black hole is a region of spacetime with extreme gravity.",
  })),
}));
vi.mock("../src/wikipedia/wikitext.js", () => ({
  fetchWikipediaWikitext: vi.fn(async () => ({ resolvedTitle: "", summary: "" })),
}));
vi.mock("../src/wikipedia/incumbent.js", () => ({
  fetchIncumbent: vi.fn(async () => ({ resolvedTitle: "", summary: "" })),
}));

const { callModel } = await import("../src/agent/llm.js");

const PLANNER_TEXT = [
  "TOKENS: 400",
  "DEPTH: lead",
  "WIKIPEDIA_SEARCH_TITLE(s): Black hole",
].join("\n");

// A callModel() result that mimics "every model in the chain failed".
function allFailedResult() {
  return {
    text: "Model call failed: groq:qwen/qwen3.8-27b (429 from groq); qwen/qwen3.8-27b:free (402 from openrouter); mistral:ministral-8b-latest (429 from mistral)",
    modelUsed: null,
    fallback: { model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" },
    failures: [
      { model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" },
      { model: "qwen/qwen3.8-27b:free", reason: "402 from openrouter" },
      { model: "mistral:ministral-8b-latest", reason: "429 from mistral" },
    ],
  };
}

afterEach(() => vi.clearAllMocks());

describe("formatUnavailable (the 'all free tiers exhausted' message)", () => {
  it("lists one line per provider with the reason in plain English", () => {
    const msg = formatUnavailable([
      { model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" },
      { model: "qwen/qwen3.8-27b:free", reason: "402 from openrouter" },
      { model: "mistral:ministral-8b-latest", reason: "429 from mistral" },
    ]);
    expect(msg).toContain("All language model providers are unavailable");
    expect(msg).toContain(`${PROVIDERS.groq.label} — rate limited`);
    expect(msg).toContain(`${PROVIDERS.openrouter.label} — out of credits`);
    expect(msg).toContain(`${PROVIDERS.mistral.label} — rate limited`);
  });

  it("tells the user what to do next", () => {
    const msg = formatUnavailable([{ model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" }]);
    expect(msg).toMatch(/try again in a few minutes/i);
    expect(msg).toMatch(/switch to a different model/i);
    expect(msg).toMatch(/add another provider key/i);
  });

  it("collapses several failed models of the SAME provider into one line", () => {
    const msg = formatUnavailable([
      { model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" },
      { model: "groq:openai/gpt-oss-20b", reason: "429 from groq" },
    ]);
    const groqLines = msg.split("\n").filter((l) => l.includes(PROVIDERS.groq.label));
    expect(groqLines).toHaveLength(1);
  });

  it("translates every reason shape we can hit", () => {
    const cases = [
      ["429 from groq", /rate limited/],
      ["402 from openrouter", /out of credits/],
      ["forced failure (FORCE_FAIL_PROVIDERS)", /disabled for this test/],
      ["empty answer (token budget went to reasoning)", /empty answer/],
      ["malformed response", /malformed/],
      ["fetch failed", /network error/],
      ["400 from mistral", /bad request/],
      ["401 from mistral", /key was rejected/],
      ["403 from mistral", /key was rejected/],
      ["404 from openrouter", /no longer offered/],
    ];
    for (const [reason, expected] of cases) {
      const msg = formatUnavailable([{ model: "qwen/qwen3.8-27b:free", reason }]);
      expect(msg, `reason: ${reason}`).toMatch(expected);
    }
  });

  it("falls back to a generic message when there are no failure details", () => {
    expect(formatUnavailable([])).toMatch(/No language model is currently available/);
    expect(formatUnavailable(null)).toMatch(/No language model is currently available/);
  });
});

describe("allFailed propagation", () => {
  it("answerWithContext flags allFailed and passes failures through", async () => {
    callModel.mockResolvedValue(allFailedResult());
    const res = await answerWithContext("What is a black hole?", "ctx", 400, [], {
      model: "groq:qwen/qwen3.8-27b",
    });
    expect(res.allFailed).toBe(true);
    expect(res.modelUsed).toBe(null);
    expect(res.failures).toHaveLength(3);
    expect(res.answer).toMatch(/^Model call failed:/);
  });

  it("answerWithContext leaves allFailed false on a normal answer", async () => {
    callModel.mockResolvedValue({
      text: "A black hole is a region of spacetime.\nTITLE: Black hole",
      modelUsed: "groq:qwen/qwen3.8-27b",
      fallback: null,
      failures: [],
    });
    const res = await answerWithContext("What is a black hole?", "ctx", 400, [], {
      model: "groq:qwen/qwen3.8-27b",
      wantTitle: true,
    });
    expect(res.allFailed).toBe(false);
    expect(res.title).toBe("Black hole");
    expect(res.failures).toEqual([]);
  });

  it("searchBar surfaces allFailed, failures and requestedModel for the route", async () => {
    callModel.mockResolvedValue(allFailedResult());
    const res = await searchBar("What is a black hole?", {
      model: "groq:qwen/qwen3.8-27b",
    });
    expect(res.allFailed).toBe(true);
    expect(res.failures).toHaveLength(3);
    expect(res.requestedModel).toBe("groq:qwen/qwen3.8-27b");
    // The route nulls `model` when nothing answered, so the UI can't mistake
    // the requested model for the one that produced the answer.
    expect(res.model).toBe("groq:qwen/qwen3.8-27b");
  });

  it("searchBar reports the rescuing model and keeps requestedModel separately", async () => {
    callModel.mockResolvedValue({
      text: "A black hole is a region of spacetime.",
      modelUsed: "mistral:ministral-8b-latest",
      fallback: { model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" },
      failures: [{ model: "groq:qwen/qwen3.8-27b", reason: "429 from groq" }],
    });
    const res = await searchBar("What is a black hole?", {
      model: "groq:qwen/qwen3.8-27b",
    });
    expect(res.allFailed).toBe(false);
    expect(res.model).toBe("mistral:ministral-8b-latest");
    expect(res.requestedModel).toBe("groq:qwen/qwen3.8-27b");
    expect(res.fallback).toEqual({
      model: "groq:qwen/qwen3.8-27b",
      reason: "429 from groq",
    });
  });
});
