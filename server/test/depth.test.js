import { describe, it, expect } from "vitest";
import { chooseFetchPath } from "../src/agent/searchBar.js";
import { buildExtractUrl, capExtract } from "../src/wikipedia/summary.js";

describe("chooseFetchPath (depth dispatch)", () => {
  it("lead depth → summary-lead", () => {
    expect(chooseFetchPath("Quasar", "lead", false)).toBe("summary-lead");
  });

  it("full depth → summary-full", () => {
    expect(chooseFetchPath("Lionel Messi", "full", false)).toBe("summary-full");
  });

  it("default/unknown depth behaves as lead", () => {
    expect(chooseFetchPath("Quasar", undefined, false)).toBe("summary-lead");
    expect(chooseFetchPath("Quasar", "deep", false)).toBe("summary-lead");
  });

  it("'List of' titles → wikitext tables", () => {
    expect(chooseFetchPath("List of rivers by length", "lead", false)).toBe("wikitext");
    // list-of wins over depth so tables don't become prose
    expect(chooseFetchPath("List of rivers by length", "full", false)).toBe("wikitext");
  });

  it("current-holder query → incumbent", () => {
    expect(chooseFetchPath("President of the United States", "lead", true)).toBe("incumbent");
  });

  it("current-holder + 'List of' → skipped", () => {
    expect(chooseFetchPath("List of presidents of the United States", "lead", true)).toBe("skip");
  });
});

describe("buildExtractUrl", () => {
  it("lead extract uses exintro and NEVER exchars (1200 API cap bug)", () => {
    const url = buildExtractUrl("Black hole");
    expect(url).toContain("exintro=true");
    expect(url).not.toContain("exchars");
  });

  it("full extract has NO exintro and no exchars", () => {
    const url = buildExtractUrl("Lionel Messi", { full: true });
    expect(url).not.toContain("exintro");
    expect(url).not.toContain("exchars");
  });

  it("encodes the title", () => {
    const url = buildExtractUrl("Spider-Man: No Way Home");
    expect(url).toContain(encodeURIComponent("Spider-Man: No Way Home"));
  });
});

describe("capExtract", () => {
  it("passes short text through untouched", () => {
    expect(capExtract("hello", 100)).toBe("hello");
  });

  it("truncates long text with marker", () => {
    expect(capExtract("x".repeat(50), 10)).toBe("x".repeat(10) + "\n...[truncated]");
  });

  it("handles null/empty", () => {
    expect(capExtract("", 10)).toBe("");
    expect(capExtract(null, 10)).toBe("");
  });
});
