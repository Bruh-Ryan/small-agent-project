import { describe, it, expect } from "vitest";
import {
  isRecencyQuery,
  isFresh,
  RECENCY_MAX_AGE_MS,
} from "../src/util/recency.js";

describe("isRecencyQuery", () => {
  it("detects current/latest phrasing", () => {
    expect(isRecencyQuery("who is the current president of France")).toBe(true);
    expect(isRecencyQuery("what is his current status on football")).toBe(true);
    expect(isRecencyQuery("latest news on the Premier League")).toBe(true);
    expect(isRecencyQuery("who won the election today")).toBe(true);
    expect(isRecencyQuery("recent developments in quantum computing")).toBe(true);
    expect(isRecencyQuery("what is the present situation")).toBe(true);
  });

  it("does not flag ordinary knowledge queries", () => {
    expect(isRecencyQuery("what is recursion")).toBe(false);
    expect(isRecencyQuery("who is messi")).toBe(false);
    expect(isRecencyQuery("explain photosynthesis")).toBe(false);
    expect(isRecencyQuery("tell me about black holes")).toBe(false);
  });

  it("handles null/empty safely", () => {
    expect(isRecencyQuery(null)).toBe(false);
    expect(isRecencyQuery("")).toBe(false);
  });
});

describe("isFresh (cache age gate)", () => {
  const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

  it("no maxAge requested → always fresh", () => {
    expect(isFresh(new Date(NOW - 30 * 24 * 3600 * 1000), undefined, NOW)).toBe(true);
  });

  it("entry younger than 24h is fresh", () => {
    expect(isFresh(new Date(NOW - 23 * 3600 * 1000), RECENCY_MAX_AGE_MS, NOW)).toBe(true);
  });

  it("entry older than 24h is stale for recency queries", () => {
    expect(isFresh(new Date(NOW - 25 * 3600 * 1000), RECENCY_MAX_AGE_MS, NOW)).toBe(false);
  });

  it("exactly 24h old counts as fresh (boundary inclusive)", () => {
    expect(isFresh(new Date(NOW - RECENCY_MAX_AGE_MS), RECENCY_MAX_AGE_MS, NOW)).toBe(true);
  });

  it("invalid date is not fresh", () => {
    expect(isFresh("not-a-date", RECENCY_MAX_AGE_MS, NOW)).toBe(false);
    expect(isFresh(null, RECENCY_MAX_AGE_MS, NOW)).toBe(false);
  });
});
