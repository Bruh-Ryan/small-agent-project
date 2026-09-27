import { callModel } from "./llm.js";
import { keywordSet, shareKeyword } from "../util/keywords.js";

// Port of Java parseTitles(): splits "Title A, 'Title B', \"Title C\"" into
// clean title strings, stripping surrounding quotes.
export function parseTitles(raw) {
  const titles = [];
  if (raw == null || !String(raw).trim()) return titles;

  for (const part of String(raw).split(",")) {
    let t = part.trim();
    if (
      (t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('"') && t.endsWith('"'))
    ) {
      t = t.slice(1, -1).trim();
    }
    if (t) titles.push(t);
  }
  return titles;
}

// ---------- follow-up detection & rewrite ----------

// Conservative: only treat as follow-up when history exists AND the query
// references prior context (pronouns / continuation words). Self-contained
// questions ("what is recursion" mid-conversation) are NOT rewritten.
const REFERENCE_PATTERN =
  /\b(his|her|its|it|they|them|their|him|she|he|this|that|these|those|there)\b/i;
const CONTINUATION_PATTERN =
  /\b(more|again|also|too|instead|continue|elaborate|expand|about (it|them|him|her)|same)\b/i;

export function detectFollowUp(query, history) {
  if (!history || history.length === 0) return false;
  return REFERENCE_PATTERN.test(query) || CONTINUATION_PATTERN.test(query);
}

// True when the latest question is about a DIFFERENT subject than what the
// chat has been discussing (celebrity -> "how does JVM architecture work").
// One conversation is not one topic: users switch subjects freely, and the
// planner is otherwise told to stay on topic, so it needs an explicit signal.
//
// Deliberately conservative — a false positive costs a little prompt clarity,
// a false negative costs a blended answer, so:
// - no history            -> not a switch
// - reference/continuation wording -> NEVER a switch. "When was he born?"
//   shares no keyword with the history but is unambiguously a follow-up.
// - self-contained question sharing no keyword with the RECENT turns -> a
//   switch. Only the last turns count: older messages drag in unrelated words
//   from earlier topics and would mask a real switch.
export function isTopicSwitch(query, history) {
  if (!history || history.length === 0) return false;
  if (detectFollowUp(query, history)) return false;
  const queryWords = keywordSet(query);
  if (queryWords.size === 0) return false;
  const recent = history.slice(-2);
  const historyWords = keywordSet(recent.map((m) => m.text).join(" "));
  return !shareKeyword(queryWords, historyWords);
}

// Cleans the rewrite model's output down to the bare question.
export function extractStandalone(raw, fallback) {
  let out = String(raw ?? "").trim();
  // Strip common prefixes models add despite instructions
  out = out.replace(/^(standalone question|rewritten question|rewritten)\s*:\s*/i, "");
  // Strip surrounding quotes
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  // One line only — the rewritten query is a single question
  out = out.split("\n")[0].trim();
  return out || fallback;
}

// Turns a context-dependent follow-up into a standalone question using the
// conversation history. Small, cheap call (~80 tokens) — only fires when
// detectFollowUp() says so.
export async function rewriteStandaloneQuery(query, history, model = undefined) {
  const prompt =
    "Rewrite the user's latest question as a standalone question using the " +
    "conversation history so it can be understood with no other context. " +
    "Preserve the exact original intent. If it is already standalone, return " +
    "it unchanged. If it is about a completely different subject than the " +
    "history, return it unchanged too. " +
    "Reply with ONLY the rewritten question, nothing else.\n\n" +
    "Conversation history:\n" +
    history.map((m) => `${m.role}: ${m.text}`).join("\n") +
    `\n\nLatest question: ${query}`;

  const { text: out } = await callModel(prompt, 80, model);
  return extractStandalone(out, query);
}

// ---------- planner ----------

const PLANNER_INSTRUCTIONS =
  "You are a planner. You have access to these tools:\n" +
  "1. wikipediaAgent - looks up factual/encyclopedic info (history, science, definitions, people, places)\n" +
  "Given the user question below, decide:\n" +
  "1. Which tool(s) are needed, in order.\n" +
  "2.How may tokens the final answer will likely need (simple factual = 100 ~ 500, detailed explaination = 500~1000, multi-topic = 1000~2000 <MAX TOKEN COUNT IS 2000>)\n" +
  "3. Given this user query, output the best Wikipedia article title(s) to search for.\n" +
  "4. IMPORTANT: If the question asks about a CURRENT specific person holding a role " +
  "(e.g. 'who is the current president', 'who is the current CEO of X', 'who currently leads Y'), " +
  "search for the PERSON'S NAME first (your best guess of who currently holds that role), " +
  "and list the general office/role article as a secondary backup title. " +
  "Do NOT rely only on the general office/role article, since it usually describes the " +
  "institution itself and may not clearly name the current holder.\n" +
  "5. For 'who is the CURRENT [role]' questions, in addition to your best " +
  "guess of the person's name, ALWAYS also include the corresponding " +
  "'List of ___' Wikipedia article as a search title " +
  "(e.g. 'List of presidents of the United States', 'List of CEOs of X'), " +
  "since this list format reliably shows the most recent/current holder " +
  "even if your guess of their name is outdated.\n" +
    "6. When RECENT CONVERSATION is provided: one chat is NOT one topic — users " +
    "change subject freely mid-conversation (e.g. one question about a celebrity, " +
    "the next about JVM architecture). If the latest question is on a NEW subject, " +
    "ignore the earlier conversation and plan ONLY for the latest question. " +
    "When the latest question instead CONTINUES the earlier topic, resolve any " +
    "reference in it (pronouns like 'he/his/it/they', 'more', 'again', 'also') " +
    "against that conversation. A follow-up must not be pulled back onto the old " +
    "subject, and a new subject must not be blended with the old one.\n" +
  "7. When the user asks for MORE detail or the CURRENT status of an " +
  "already-discussed topic, output titles for NEW supporting angles (e.g. a " +
  "career/stats/season article, related people or events) in addition to the " +
  "main article — not only the same title as before.\n" +
  "Reply int EXACTLY this format, Nothing else:\n" +
  "TOKENS: <single integer only, no ranges, no dashes - e.g 800>\n" +
  "DEPTH: <lead or full — 'full' if the user wants MORE detail, current status, recent developments or deeper coverage than a summary; 'lead' for simple lookups>\n" +
  "WIKIPEDIA_SEARCH_TITLE(s): <article title eg. query - 'I want to understand how black holes form, what happens at the event horizon and how Hawking radiation works, also who discovered them' then titles would be 'Black hole', 'Event horizon', 'Hawking radiation' or eg. 'what are persian cats', titles would be 'persian cats' or eg. 'who is the current president of the United States and when did they take office' then titles would be 'Donald Trump', 'President of the United States', 'List of presidents of the United States'>";

// Optional history → appended context block so the planner can resolve
// references and keep follow-ups on topic. topicSwitch flips the framing so a
// deliberate subject change isn't argued back onto the previous topic.
export function historyBlock(history, topicSwitch = false) {
  if (!history || history.length === 0) return "";
  const lines = history.map(
    (m) => `${m.role}: ${String(m.text).slice(0, 300)}`
  );
  if (topicSwitch) {
    return (
      "\nRECENT CONVERSATION (the latest question switched subject — use this ONLY " +
      "if the latest question explicitly refers back to it):\n" +
      lines.join("\n") +
      "\n"
    );
  }
  return (
    "\nRECENT CONVERSATION (for resolving references — follow-ups stay on the same topic):\n" +
    lines.join("\n") +
    "\n"
  );
}

// Port of Java plannerResponse(): returns the raw planner text.
export async function plannerResponse(
  userQuery,
  history = [],
  model = undefined,
  topicSwitch = false
) {
  const { text } = await callModel(
    PLANNER_INSTRUCTIONS + historyBlock(history, topicSwitch) + userQuery,
    150,
    model
  );
  console.log("PLAN IS: " + text);
  return text.trim();
}

const TOKEN_PATTERN = /^TOKENS:\s*(.*)$/i;
const DEPTH_PATTERN = /^DEPTH:\s*(lead|full)\b/i;
const TITLE_PATTERN = /^WIKIPEDIA_SEARCH_TITLE(?:\(S\)|S)?:\s*(.*)$/i;

// Parses a raw planner response into { tokenBudget, depth, searchTitles }.
export function parsePlan(plan) {
  let tokenLine = "";
  let depth = "lead";
  const searchTitles = [];

  for (const rawLine of String(plan).split("\n")) {
    const line = rawLine.trim();

    const tm = line.match(TOKEN_PATTERN);
    if (tm) {
      tokenLine = tm[1].trim();
      continue;
    }

    const dm = line.match(DEPTH_PATTERN);
    if (dm) {
      depth = dm[1].toLowerCase() === "full" ? "full" : "lead";
      continue;
    }

    const sm = line.match(TITLE_PATTERN);
    if (sm) {
      searchTitles.push(...parseTitles(sm[1].trim()));
    }
  }

  const digits = tokenLine.replace(/[^0-9]/g, "");
  const tokenBudget = tokenLine && digits ? Number.parseInt(digits, 10) : 500;

  return { tokenBudget, depth, searchTitles };
}
