import { describe, it, expect, vi } from "vitest";
import { validateUsername, validatePassword } from "../src/util/authValidation.js";
import { requireAuth } from "../src/middleware/auth.js";
import { chatOwnedBy, overflowIds } from "../src/models/Chat.js";

describe("validateUsername", () => {
  it("accepts 3–30 alphanumeric/underscore names", () => {
    expect(validateUsername("nis_99")).toBe(null);
    expect(validateUsername("abc")).toBe(null);
    expect(validateUsername("a".repeat(30))).toBe(null);
    expect(validateUsername("  Nishtha  ")).toBe(null); // trimmed
  });

  it("rejects empty, short, long, and special-char names", () => {
    expect(validateUsername("")).toBeTruthy();
    expect(validateUsername(null)).toBeTruthy();
    expect(validateUsername("ab")).toBeTruthy();
    expect(validateUsername("a".repeat(31))).toBeTruthy();
    expect(validateUsername("has space")).toBeTruthy();
    expect(validateUsername("evil<script>")).toBeTruthy();
    expect(validateUsername("a@b.c")).toBeTruthy();
  });
});

describe("validatePassword", () => {
  it("accepts 6–128 char passwords", () => {
    expect(validatePassword("secret123")).toBe(null);
    expect(validatePassword("a".repeat(6))).toBe(null);
    expect(validatePassword("a".repeat(128))).toBe(null);
  });

  it("rejects missing/short/oversized passwords", () => {
    expect(validatePassword("")).toBeTruthy();
    expect(validatePassword(undefined)).toBeTruthy();
    expect(validatePassword("abc")).toBeTruthy();
    expect(validatePassword("a".repeat(129))).toBeTruthy();
  });
});

describe("requireAuth middleware", () => {
  function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = vi.fn((c) => {
      res.statusCode = c;
      return res;
    });
    res.json = vi.fn((b) => {
      res.body = b;
      return res;
    });
    return res;
  }

  it("passes through when session.userId exists", () => {
    const next = vi.fn();
    requireAuth({ session: { userId: "u1" } }, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("401s without a session", () => {
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ session: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: "Not logged in" });
  });

  it("401s when req.session is missing entirely", () => {
    const next = vi.fn();
    const res = mockRes();
    requireAuth({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("chatOwnedBy", () => {
  it("matches when owner equals the session user (string/ObjectId)", () => {
    expect(chatOwnedBy({ owner: "6561abcdef6561abcdef6561" }, "6561abcdef6561abcdef6561")).toBe(true);
    expect(
      chatOwnedBy({ owner: { toString: () => "abc123" } }, "abc123")
    ).toBe(true);
  });

  it("rejects mismatched, null, or missing owners", () => {
    expect(chatOwnedBy({ owner: "user1" }, "user2")).toBe(false);
    expect(chatOwnedBy({ owner: null }, "user1")).toBe(false); // pre-auth chat
    expect(chatOwnedBy({}, "user1")).toBe(false);
    expect(chatOwnedBy({ owner: "user1" }, undefined)).toBe(false);
    expect(chatOwnedBy(null, "user1")).toBe(false);
  });
});

describe("overflowIds (15-chat retention cap)", () => {
  it("returns nothing while at/below the cap", () => {
    expect(overflowIds(["a"], 15)).toEqual([]);
    expect(overflowIds(Array.from({ length: 15 }, (_, i) => `id${i}`), 15)).toEqual([]);
  });

  it("returns the oldest ids past the cap (newest-first input)", () => {
    expect(overflowIds(["new", "mid", "old"], 2)).toEqual(["old"]);
    expect(overflowIds(Array.from({ length: 16 }, (_, i) => `id${i}`), 15)).toEqual(["id15"]);
  });
});
