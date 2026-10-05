import mongoose from "mongoose";
import { Router } from "express";
import { searchBar } from "../agent/searchBar.js";
import { formatUnavailable } from "../agent/llm.js";
import { DEFAULT_MODEL, resolveModel, availableModels } from "../agent/models.js";
import { Chat, buildTitle, chatOwnedBy, overflowIds } from "../models/Chat.js";
import {
  PendingQuery,
  PENDING_TTL_MS,
  MAX_PENDING_QUERY_CHARS,
  hashPendingToken,
  mintPendingToken,
} from "../models/PendingQuery.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const DB_UP = () => mongoose.connection.readyState === 1;

// Keep at most this many conversations per account (auto-delete oldest).
export const CHAT_CAP = 15;

// Anonymous landing-page prepares per IP per rolling hour. In-memory is fine:
// single Render instance, and worst case a restart only resets the counters
// (fail-open for users, never fail-closed into leaking quota — prepare
// itself spends no LLM calls anyway).
export const PREPARE_LIMIT = 5;
export const PREPARE_WINDOW_MS = 60 * 60 * 1000;
export const prepareHits = new Map(); // ip -> timestamps[]

export function prepareAllowed(ip) {
  const now = Date.now();
  const hits = (prepareHits.get(ip) ?? []).filter((t) => now - t < PREPARE_WINDOW_MS);
  if (hits.length >= PREPARE_LIMIT) {
    prepareHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  prepareHits.set(ip, hits);
  return true;
}

// Landing-page handoff (PUBLIC — no auth). Holds the query for 8 minutes so
// signup can auto-send it into the new account's chats. Deferred execution:
// no LLM call happens here, so anonymous callers can't burn quota.
router.post("/prepare", async (req, res) => {
  const { query } = req.body ?? {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query (string) is required" });
  }
  if (query.trim().length > MAX_PENDING_QUERY_CHARS) {
    return res.status(400).json({ error: `query must be at most ${MAX_PENDING_QUERY_CHARS} characters` });
  }
  if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  if (!prepareAllowed(ip)) {
    return res.status(429).json({ error: "too many tries — please sign up to continue" });
  }

  try {
    const pendingToken = mintPendingToken();
    const now = new Date();
    await PendingQuery.create({
      tokenHash: hashPendingToken(pendingToken),
      query: query.trim(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
    });
    res.status(201).json({ pendingToken });
  } catch (err) {
    console.error("[ask] prepare failed:", err);
    res.status(500).json({ error: "could not hold query" });
  }
});

// Real agent pipeline. Loads the conversation FIRST (history + previously
// fetched titles feed the planner/follow-up logic), runs planner → Wikipedia
// → answer, then appends the exchange to `Chat-History.chats`.
// Persistence is best-effort: if Mongo is down the answer still returns.
router.post("/", requireAuth, async (req, res) => {
  let { query, sessionId, model: modelReq } = req.body ?? {};
  // Landing-page handoff: a single-use 8-minute token standing in for the
  // query. Consumed (deleted) here — replay gets a 410.
  if (req.body?.pendingToken) {
    if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });
    const doc = await PendingQuery.findOneAndDelete({
      tokenHash: hashPendingToken(req.body.pendingToken),
    }).lean();
    if (!doc) return res.status(410).json({ error: "pending query expired — please ask again" });
    query = doc.query;
  }
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query (string) is required" });
  }
  // At least one provider must be configured (Phase 7: any of the 5 keys).
  if (availableModels().length === 0) {
    return res.status(500).json({
      error: "no LLM provider configured — set at least one API key in .env",
    });
  }
  // Model must be on the curated allowlist AND belong to a configured
  // provider — no arbitrary provider/model IDs.
  const model = resolveModel(modelReq) ?? DEFAULT_MODEL;
  if (modelReq != null && modelReq !== "" && model !== modelReq) {
    return res.status(400).json({ error: `Unknown or unavailable model: ${modelReq}` });
  }

  try {
    // Load existing conversation (if any) before planning. Only the owner's
    // session may be continued — someone else's id is indistinguishable
    // from a non-existent one (404 below).
    let chat = null;
    if (DB_UP() && sessionId && mongoose.isValidObjectId(sessionId)) {
      try {
        chat = await Chat.findById(sessionId);
      } catch (err) {
        console.warn(`[ask] could not load session: ${err.message}`);
      }
      if (chat && !chatOwnedBy(chat, req.session.userId)) {
        return res.status(404).json({ error: "session not found" });
      }
    }

    const history = chat
      ? chat.messages.slice(-6).map((m) => ({ role: m.role, text: m.text }))
      : [];

    // Titles the previous answer actually fetched → inherited on follow-ups.
    const previousTitles = chat
      ? [...chat.messages]
          .reverse()
          .find((m) => m.role === "assistant" && m.debug)
          ?.debug?.fetched?.map((f) => f.title) ?? []
      : [];

    const started = Date.now();
    const result = await searchBar(query.trim(), {
      history,
      previousTitles,
      model,
      // New conversation → the answer call also emits a TITLE: line.
      wantTitle: !chat,
    });
    const durationMs = Date.now() - started;

    // Every model in the fallback chain failed (free tiers exhausted, all
    // providers rate-limited, ...). Replace the raw "Model call failed: ..."
    // string with a friendly notice — still a 200, so the turn is saved to the
    // chat and follow-ups keep working.
    const allFailed = Boolean(result.allFailed);
    if (allFailed) {
      console.warn(`[ask] all providers unavailable for ${model}`);
      result.answer = formatUnavailable(result.failures);
      result.model = null;
    }
    // The model the user asked for, for reference when a fallback answered.
    result.requestedModel = model;

    let savedSessionId = null;
    if (DB_UP()) {
      try {
        if (!chat) {
          // Parsed AI title when available; buildTitle (60-char query
          // truncation) is the fallback when the model omitted/invalidated it.
          chat = new Chat({
            title: result.title || buildTitle(query),
            owner: req.session.userId,
            messages: [],
          });
        }
        chat.messages.push({ role: "user", text: query.trim() });
        chat.messages.push({
          role: "assistant",
          text: result.answer,
          debug: {
            plan: result.plan,
            tokenBudget: result.tokenBudget,
            depth: result.depth,
            recency: result.recency,
            // Actual model that answered (may differ from `requestedModel`
            // when the agent fell back to another provider).
            model: result.model,
            requestedModel: result.requestedModel,
            fallback: result.fallback,
            allFailed: result.allFailed,
            failures: result.failures,
            searchTitles: result.searchTitles,
            followUp: result.followUp,
            rewrittenQuery: result.rewrittenQuery,
            inheritedTitles: result.inheritedTitles,
            terms: result.terms,
            fetched: result.fetched,
            skipped: result.skipped,
            context: result.context,
            durationMs,
          },
        });
        await chat.save();
        savedSessionId = chat._id.toString();

        // Retention cap: newest-first, delete everything past CHAT_CAP.
        const owned = await Chat.find({ owner: req.session.userId })
          .sort({ updatedAt: -1 })
          .select("_id")
          .lean();
        const overflow = overflowIds(owned.map((c) => c._id), CHAT_CAP);
        if (overflow.length > 0) {
          await Chat.deleteMany({ _id: { $in: overflow } });
          console.log(`[chat-cap] deleted ${overflow.length} old chat(s) over cap ${CHAT_CAP}`);
        }
      } catch (err) {
        console.warn(`[ask] persistence skipped: ${err.message}`);
      }
    }

    res.json({ sessionId: savedSessionId, ...result, durationMs });
  } catch (err) {
    console.error("[ask] pipeline failed:", err);
    res.status(500).json({ error: err.message || "agent pipeline failed" });
  }
});

export default router;
