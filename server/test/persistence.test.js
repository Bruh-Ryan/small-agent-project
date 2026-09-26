import { describe, it, expect } from "vitest";
import { buildTitle } from "../src/models/Chat.js";
import { cacheKey } from "../src/wikipedia/cache.js";
import { ttlFor, TTL_24H_MS, TTL_7D_MS } from "../src/models/WikiCache.js";

describe("buildTitle", () => {
  it("uses the query as-is when short", () => {
    expect(buildTitle("What is a quasar?")).toBe("What is a quasar?");
  });

  it("collapses whitespace", () => {
    expect(buildTitle("  what   is\na quasar  ")).toBe("what is a quasar");
  });

  it("truncates long queries to 60 chars with ellipsis", () => {
    const long = "a".repeat(80);
    const title = buildTitle(long);
    expect(title).toHaveLength(60);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("cacheKey", () => {
  it("namespaces by kind", () => {
    expect(cacheKey("summary", "Black hole")).toBe("summary|Black hole");
    expect(cacheKey("search", "quasar|5")).toBe("search|quasar|5");
  });
});

describe("ttlFor (split TTL)", () => {
  it("incumbent keys expire in 24h so current-office answers stay fresh", () => {
    expect(ttlFor("incumbent|President of the United States")).toBe(TTL_24H_MS);
  });

  it("general content expires in 7 days", () => {
    expect(ttlFor("summary|Black hole")).toBe(TTL_7D_MS);
    expect(ttlFor("search|quasar|5")).toBe(TTL_7D_MS);
    expect(ttlFor("wikitext|List of rivers by length")).toBe(TTL_7D_MS);
  });
});
