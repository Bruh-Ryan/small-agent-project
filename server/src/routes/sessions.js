import mongoose from "mongoose";
import { Router } from "express";
import { Chat, chatOwnedBy } from "../models/Chat.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const DB_UP = () => mongoose.connection.readyState === 1;

// All routes require a logged-in session; results are owner-scoped.
router.use(requireAuth);

// List conversations, newest first: id, title, timestamp, message count.
router.get("/", async (req, res) => {
  if (!DB_UP()) return res.json([]);
  try {
    const chats = await Chat.find({ owner: req.session.userId })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(
      chats.map((c) => ({
        _id: c._id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full conversation (messages + debug payloads) for the UI.
router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "invalid session id" });
  }
  if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });
  try {
    const chat = await Chat.findById(req.params.id).lean();
    // Non-owner sees the same 404 as a missing id — never leak existence.
    if (!chat || !chatOwnedBy(chat, req.session.userId)) {
      return res.status(404).json({ error: "session not found" });
    }
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a conversation.
router.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "invalid session id" });
  }
  if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });
  try {
    const chat = await Chat.findById(req.params.id).lean();
    if (!chat || !chatOwnedBy(chat, req.session.userId)) {
      return res.status(404).json({ error: "session not found" });
    }
    await Chat.deleteOne({ _id: chat._id });
    res.json({ deleted: true, _id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
