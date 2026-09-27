import { describe, it, expect } from "vitest";
import { extractTitle } from "../src/agent/answer.js";

describe("extractTitle (TITLE: line parsing)", () => {
  it("splits a normal response into answer + title", () => {
    const raw =
      "Lionel Messi plays for Inter Miami.\nHe also captains Argentina.\n" +
      "TITLE: Messi's current club";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe("Messi's current club");
    expect(answer).toBe("Lionel Messi plays for Inter Miami.\nHe also captains Argentina.");
    expect(answer).not.toContain("TITLE:");
  });

  it("returns title: null when there is no TITLE line", () => {
    const raw = "Just a plain answer with no title line.";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe(null);
    expect(answer).toBe(raw);
  });

  it("uses the LAST TITLE match (earlier one can't spoof)", () => {
    const raw =
      "Some answer mentioning:\nTITLE: decoy inside answer\nMore text.\n" +
      "TITLE: Real conversation title";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe("Real conversation title");
    expect(answer).not.toContain("decoy");
    expect(answer).toContain("More text.");
  });

  it("strips wrapping quotes and normalizes whitespace", () => {
    const raw = "Body.\nTITLE:   \"  Black   holes   explained  \"  ";
    expect(extractTitle(raw).title).toBe("Black holes explained");
  });

  it("truncates titles over 80 chars", () => {
    const long = "a".repeat(120);
    const { title } = extractTitle(`Body.\nTITLE: ${long}`);
    expect(title.length).toBe(80);
    expect(title.endsWith("...")).toBe(true);
  });

  it("rejects degenerate (≤2 char) titles but keeps the answer clean", () => {
    const raw = "The actual answer text.\nTITLE: x";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe(null);
    expect(answer).toBe("The actual answer text.");
    expect(answer).not.toContain("TITLE:");
  });

  it("never leaks a title-only response as the answer", () => {
    const { answer, title } = extractTitle("TITLE: Only title no body");
    expect(title).toBe("Only title no body");
    expect(answer).not.toContain("TITLE:");
  });

  it("handles null/empty input safely", () => {
    expect(extractTitle(null)).toEqual({ answer: "", title: null });
    expect(extractTitle("")).toEqual({ answer: "", title: null });
  });

  it("preserves markdown/code blocks in the answer", () => {
    const raw =
      "Here is code:\n```js\nconst x = 1;\n```\nTITLE: Code example walkthrough";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe("Code example walkthrough");
    expect(answer).toContain("```js");
  });

  it("handles an INLINE title (model appends on the same line)", () => {
    const raw = "The capital of France is Paris. TITLE: Capital of France";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe("Capital of France");
    expect(answer).toBe("The capital of France is Paris.");
    expect(answer).not.toContain("TITLE:");
  });

  it("does not match SUBTITLE/ENTITLE as markers", () => {
    const raw = "The page SUBTITLE: was odd. More text.";
    const { answer, title } = extractTitle(raw);
    expect(title).toBe(null);
    expect(answer).toBe(raw);
  });
});
