import mongoose from "mongoose";

const { Schema, model } = mongoose;

// One document per conversation, stored in the `chats` collection of the
// `Chat-History` database (per project spec). Messages are embedded — a full
// conversation loads with a single query.
const messageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true },
    // Pipeline debug payload for assistant messages (plan, search terms,
    // fetched articles, context) — feeds the UI's PlanPanel.
    debug: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const chatSchema = new Schema(
  {
    title: { type: String, required: true },
    // Account that owns this conversation (6C). NULL for pre-auth chats —
    // they never match a user filter, so they're hidden until claimed via
    // scripts/claim-orphan-chats.js.
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    messages: { type: [messageSchema], default: [] },
  },
  { collection: "chats", timestamps: true }
);

// Auto-title from the first user message, trimmed to 60 chars.
export function buildTitle(query) {
  const clean = String(query).trim().replace(/\s+/g, " ");
  return clean.length > 60 ? clean.slice(0, 57) + "..." : clean;
}

// Ownership check shared by sessions routes and ask.js. Tolerates null owner
// (pre-auth docs) and ObjectId/string mismatch (session.userId is a string).
export function chatOwnedBy(chat, userId) {
  if (!chat?.owner || !userId) return false;
  return String(chat.owner) === String(userId);
}

// Beyond-cap ids from a newest-first list — ask.js deletes these after each
// save so a user never keeps more than `cap` conversations.
export function overflowIds(sortedIds, cap = 15) {
  return sortedIds.slice(cap);
}

export const Chat = model("Chat", chatSchema);
