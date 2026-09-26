import { describe, it, expect } from "vitest";
import { extractInfoboxField } from "../src/wikipedia/incumbent.js";
import { formatWikiTable } from "../src/wikipedia/wikitext.js";

describe("extractInfoboxField", () => {
  it("extracts a simple incumbent field", () => {
    const wikitext =
      "{{Infobox office\n| office = President\n| incumbent = [[Donald Trump]]\n| term_start = 2025\n}}";
    expect(extractInfoboxField(wikitext, "incumbent")).toBe("Donald Trump");
  });

  it("strips ref tags, templates, and bold markup", () => {
    const wikitext =
      "| incumbent = '''[[Keir Starmer]]'''<ref name=\"x\">some ref</ref> {{small|b. 1962}}\n| next = }}";
    expect(extractInfoboxField(wikitext, "incumbent")).toBe("Keir Starmer");
  });

  it("returns empty string when field is absent", () => {
    const wikitext = "{{Infobox\n| office = Mayor\n| holder = [[Jane Doe]]\n}}";
    expect(extractInfoboxField(wikitext, "incumbent")).toBe("");
  });

  it("uses pipe-linked display text", () => {
    const wikitext = "| incumbent = [[New York City|NYC]] mayor\n| other = x\n}}";
    expect(extractInfoboxField(wikitext, "incumbent")).toBe("NYC mayor");
  });
});

describe("formatWikiTable", () => {
  it("converts rows to pipe-delimited lines", () => {
    const raw = "{| class=\"wikitable\"\n! Name || Year\n|- \n| Alice || 2020\n|- \n| Bob || 2021\n|}";
    expect(formatWikiTable(raw)).toBe("Name | Year\nAlice | 2020\nBob | 2021");
  });

  it("skips table structure markers", () => {
    const raw = "{|\n|-\n| cell only\n|}";
    expect(formatWikiTable(raw)).toBe("cell only");
  });

  it("strips quoted attributes from cells (Java-faithful: leftover ' |' separator remains)", () => {
    const raw = '{|\n| style="background: red" | Value\n|}';
    expect(formatWikiTable(raw)).toBe("| Value");
  });

  it("returns empty string for no data rows", () => {
    expect(formatWikiTable("{|\n|}")).toBe("");
  });
});
