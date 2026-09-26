import mongoose from "mongoose";
import { Router } from "express";
import { searchBar } from "../agent/searchBar.js";
import { config } from "../config.js";
import { Chat, buildTitle } from "../models/Chat.js";

const router = Router();

const DB_UP = () => mongoose.connection.readyState === 1;

// Real agent pipeline. Runs planner → Wikipedia → answer, then persists the
// exchange to `Chat-History.chats` (new conversation unless sessionId given).
// Persistence is best-effort: if Mongo is down the answer still returns.
router.post("/", async (req, res) => {
  const { query, sessionId } = req.body ?? {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query (string) is required" });
  }
  if (!config.apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not set in .env" });
  }

  try {
    const started = Date.now();
    const result = await searchBar(query.trim());
    const durationMs = Date.now() - started;

    let savedSessionId = null;
    if (DB_UP()) {
      try {
        let chat = null;
        if (sessionId && mongoose.isValidObjectId(sessionId)) {
          chat = await Chat.findById(sessionId);
        }
        if (!chat) {
          chat = new Chat({ title: buildTitle(query), messages: [] });
        }
        chat.messages.push({ role: "user", text: query.trim() });
        chat.messages.push({
          role: "assistant",
          text: result.answer,
          debug: {
            plan: result.plan,
            tokenBudget: result.tokenBudget,
            searchTitles: result.searchTitles,
            terms: result.terms,
            fetched: result.fetched,
            skipped: result.skipped,
            context: result.context,
            durationMs,
          },
        });
        await chat.save();
        savedSessionId = chat._id.toString();
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
