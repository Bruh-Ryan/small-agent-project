import { describe, it, expect } from "vitest";
import { parseTitles, parsePlan } from "../src/agent/planner.js";

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
  it("extracts token budget and titles", () => {
    const plan =
      "TOKENS: 800\nWIKIPEDIA_SEARCH_TITLE(s): Black hole, Event horizon";
    expect(parsePlan(plan)).toEqual({
      tokenBudget: 800,
      searchTitles: ["Black hole", "Event horizon"],
    });
  });

  it("defaults to 500 when TOKENS line is missing", () => {
    const plan = "WIKIPEDIA_SEARCH_TITLE(s): Quasar";
    expect(parsePlan(plan)).toEqual({ tokenBudget: 500, searchTitles: ["Quasar"] });
  });

  it("parses dashed title variant and strips junk from tokens", () => {
    const plan =
      "TOKENS: ~ 1,200 ~\nWIKIPEDIA_SEARCH_TITLES: 'Persian cats'";
    expect(parsePlan(plan)).toEqual({
      tokenBudget: 1200,
      searchTitles: ["Persian cats"],
    });
  });

  it("handles quoted multi-title plan line", () => {
    const plan =
      'TOKENS: 300\nWIKIPEDIA_SEARCH_TITLE: "Donald Trump", \'President of the United States\', "List of presidents of the United States"';
    const { searchTitles } = parsePlan(plan);
    expect(searchTitles).toEqual([
      "Donald Trump",
      "President of the United States",
      "List of presidents of the United States",
    ]);
  });

  it("ignores lines that are not plan directives", () => {
    const plan = "Sure! Here is my plan:\nTOKENS: 650\nWIKIPEDIA_SEARCH_TITLE(s): Jaguar";
    expect(parsePlan(plan)).toEqual({ tokenBudget: 650, searchTitles: ["Jaguar"] });
  });
});
