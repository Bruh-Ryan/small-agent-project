import { describe, it, expect } from "vitest";
import { keywordSet, shareKeyword } from "../src/util/keywords.js";

describe("keywordSet", () => {
  it("keeps meaningful words longer than 3 chars", () => {
    expect(keywordSet("what is a quasar")).toEqual(new Set(["quasar"]));
  });

  it("drops stopwords regardless of length", () => {
    expect(keywordSet("tell me about the black hole")).toEqual(
      new Set(["black", "hole"])
    );
  });

  it("ignores short words", () => {
    expect(keywordSet("is it red")).toEqual(new Set());
  });

  it("lowercases and splits on non-alphanumerics", () => {
    expect(keywordSet("Persian-Cats!")).toEqual(new Set(["persian", "cats"]));
  });
});

describe("shareKeyword", () => {
  it("detects shared word", () => {
    expect(
      shareKeyword(keywordSet("jaguar animal"), keywordSet("Jaguar (animal)"))
    ).toBe(true);
  });

  it("rejects disjoint sets", () => {
    expect(
      shareKeyword(keywordSet("jaguar car"), keywordSet("PlayStation 5"))
    ).toBe(false);
  });
});
