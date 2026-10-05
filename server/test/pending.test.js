import { describe, it, expect, beforeEach } from "vitest";
import {
  PendingQuery,
  PENDING_TTL_MS,
  MAX_PENDING_QUERY_CHARS,
  hashPendingToken,
  mintPendingToken,
} from "../src/models/PendingQuery.js";
import {
  PREPARE_LIMIT,
  PREPARE_WINDOW_MS,
  prepareAllowed,
  prepareHits,
} from "../src/routes/ask.js";

describe("pending token mint/hash", () => {
  it("mints unique 32-byte hex tokens", () => {
    const a = mintPendingToken();
    const b = mintPendingToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically without leaking the token", () => {
    const token = mintPendingToken();
    expect(hashPendingToken(token)).toBe(hashPendingToken(token));
    expect(hashPendingToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPendingToken(token)).not.toContain(token);
    expect(hashPendingToken(mintPendingToken())).not.toBe(hashPendingToken(token));
  });
});

describe("pending TTL + limits", () => {
  it("holds queries for 8 minutes, capped at 500 chars", () => {
    expect(PENDING_TTL_MS).toBe(8 * 60 * 1000);
    expect(MAX_PENDING_QUERY_CHARS).toBe(500);
  });

  it("expires the Mongo document via a TTL index", () => {
    const indexes = PendingQuery.schema.indexes();
    const ttl = indexes.find(([, opts]) => opts.expireAfterSeconds === 0);
    expect(ttl).toBeTruthy();
    expect(ttl[0]).toEqual({ expiresAt: 1 });
  });
});

describe("prepareAllowed (anonymous rate limit)", () => {
  beforeEach(() => prepareHits.clear());

  it(`allows ${PREPARE_LIMIT} prepares then blocks`, () => {
    for (let i = 0; i < PREPARE_LIMIT; i++) {
      expect(prepareAllowed("1.2.3.4")).toBe(true);
    }
    expect(prepareAllowed("1.2.3.4")).toBe(false);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < PREPARE_LIMIT; i++) prepareAllowed("1.2.3.4");
    expect(prepareAllowed("5.6.7.8")).toBe(true);
  });

  it("forgets hits older than the window", () => {
    const stale = Date.now() - PREPARE_WINDOW_MS - 1000;
    prepareHits.set("9.9.9.9", Array.from({ length: PREPARE_LIMIT }, () => stale));
    expect(prepareAllowed("9.9.9.9")).toBe(true);
  });
});
