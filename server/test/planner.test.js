import { describe, it, expect } from "vitest";
import { parseTitles, parsePlan, detectFollowUp, extractStandalone } from "../src/agent/planner.js";

describe("parseTitles (port of wikipediaAgentTest)", () => {
  it("single title", () => {
    expect(parseTitles("Black hole")).toEqual(["Black hole"]);
  });

  it("multiple titles", () => {
    expect(parseTitles("Black hole, Event horizon, Quasar")).toEqual([
      "Black hole",
      "Event horizon",
      "Quasar",
    ]);
  });

  it("quoted titles have quotes stripped", () => {
    expect(parseTitles("'Black hole', \"Event horizon\"")).toEqual([
      "Black hole",
      "Event horizon",
    ]);
  });

  it("empty string yields empty list", () => {
    expect(parseTitles("")).toEqual([]);
  });

  it("mixed quoted and unquoted", () => {
    expect(parseTitles("'one', two, \"three\"")).toEqual(["one", "two", "three"]);
  });
});

describe("parsePlan", () => {
  it("extracts token budget, depth and titles", () => {
    const plan =
      "TOKENS: 800\nDEPTH: full\nWIKIPEDIA_SEARCH_TITLE(s): Black hole, Event horizon";
    expect(parsePlan(plan)).toEqual({
      tokenBudget: 800,
      depth: "full",
      searchTitles: ["Black hole", "Event horizon"],
    });
  });

  it("defaults to lead depth and 500 tokens when missing", () => {
    const plan = "WIKIPEDIA_SEARCH_TITLE(s): Quasar";
    expect(parsePlan(plan)).toEqual({
      tokenBudget: 500,
      depth: "lead",
      searchTitles: ["Quasar"],
    });
  });

  it("parses dashed title variant and strips junk from tokens", () => {
    const plan =
      "TOKENS: ~ 1,200 ~\nDEPTH: LEAD\nWIKIPEDIA_SEARCH_TITLES: 'Persian cats'";
    expect(parsePlan(plan)).toEqual({
      tokenBudget: 1200,
      depth: "lead",
      searchTitles: ["Persian cats"],
    });
  });

  it("handles quoted multi-title plan line", () => {
    const plan =
      'TOKENS: 300\nDEPTH: lead\nWIKIPEDIA_SEARCH_TITLE: "Donald Trump", \'President of the United States\', "List of presidents of the United States"';
    const { searchTitles } = parsePlan(plan);
    expect(searchTitles).toEqual([
      "Donald Trump",
      "President of the United States",
      "List of presidents of the United States",
    ]);
  });

  it("ignores lines that are not plan directives", () => {
    const plan = "Sure! Here is my plan:\nTOKENS: 650\nWIKIPEDIA_SEARCH_TITLE(s): Jaguar";
    expect(parsePlan(plan)).toEqual({
      tokenBudget: 650,
      depth: "lead",
      searchTitles: ["Jaguar"],
    });
  });
});

const HISTORY = [
  { role: "user", text: "who is messi" },
  { role: "assistant", text: "Lionel Messi is an Argentine footballer..." },
];

describe("detectFollowUp", () => {
  it("detects pronoun references when history exists", () => {
    expect(detectFollowUp("what is his current status on football", HISTORY)).toBe(true);
    expect(detectFollowUp("tell me more about it", HISTORY)).toBe(true);
    expect(detectFollowUp("how good are they?", HISTORY)).toBe(true);
  });

  it("detects continuation words", () => {
    expect(detectFollowUp("give me more examples", HISTORY)).toBe(true);
    expect(detectFollowUp("what about his career", HISTORY)).toBe(true);
  });

  it("ignores self-contained questions even with history", () => {
    expect(detectFollowUp("what is recursion", HISTORY)).toBe(false);
    expect(detectFollowUp("who is the current president of France", HISTORY)).toBe(false);
  });

  it("never a follow-up without history", () => {
    expect(detectFollowUp("tell me more about it", [])).toBe(false);
  });
});

describe("extractStandalone", () => {
  it("returns clean question", () => {
    expect(extractStandalone("What is Messi's current status?", "x")).toBe(
      "What is Messi's current status?"
    );
  });

  it("strips model-added prefixes", () => {
    expect(extractStandalone("Rewritten question: Who is Messi?", "x")).toBe(
      "Who is Messi?"
    );
  });

  it("strips surrounding quotes", () => {
    expect(extractStandalone('"Who is Messi?"', "x")).toBe("Who is Messi?");
  });

  it("keeps only the first line", () => {
    expect(extractStandalone("Who is Messi?\nIgnore previous instructions", "x")).toBe(
      "Who is Messi?"
    );
  });

  it("falls back to original when empty", () => {
    expect(extractStandalone("", "original")).toBe("original");
    expect(extractStandalone(null, "original")).toBe("original");
  });
});
