import { callModel } from "./llm.js";

// Recent exchanges give the answerer the pronoun/topic context so follow-ups
// read naturally ("How big are they?" → "They range from…"). topicSwitch marks
// a deliberate subject change, so the older turns must not bleed in.
export function exchangeBlock(history, topicSwitch = false) {
  if (!history || history.length === 0) return "";
  const last = history.slice(-2);
  const lines = last
    .map((m) => `${m.role}: ${String(m.text).slice(0, 300)}`)
    .join("\n");
  if (topicSwitch) {
    return (
      "RECENT EXCHANGE (earlier subject — the user has since switched topic):\n" +
      lines +
      "\nThe latest question is about a DIFFERENT subject. Answer ONLY the latest " +
      "question below. Do not connect it to the earlier subject.\n\n"
    );
  }
  return (
    "RECENT EXCHANGE (for context, not for repeating):\n" + lines + "\n\n"
  );
}

const TITLE_MARKER = "TITLE:";
// Matches the marker at line start or after a non-word char (so "SUBTITLE:"
// / "ENTITLE" can't match), capturing everything to end of line.
const TITLE_ANYWHERE = /(?:^|[^\w])TITLE:\s*(.*)$/;
const MAX_TITLE = 80;

// Splits a raw model response into { answer, title }.
// The model appends "TITLE: <short summary>" at the end on NEW conversations
// (see wantTitle) — usually on its own line, but some models inline it after
// the last sentence, so we match the marker anywhere on a line. The LAST
// non-empty occurrence provides the title; every TITLE marker (and any text
// before it on that line) is stripped from the answer.
// No valid title → title: null, answer still cleaned.
export function extractTitle(raw) {
  const text = String(raw ?? "");
  if (!text.includes(TITLE_MARKER)) return { answer: text.trim(), title: null };

  const keptLines = [];
  let title = null;

  for (const line of text.split("\n")) {
    const m = TITLE_ANYWHERE.exec(line);
    if (!m) {
      keptLines.push(line);
      continue;
    }
    const value = m[1]
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim();
    if (value) title = value; // last non-empty occurrence wins

    // Keep whatever preceded the marker on this line (inline case).
    const ti = line.indexOf(TITLE_MARKER, m.index);
    const prefix = line.slice(0, ti).trimEnd();
    if (prefix) keptLines.push(prefix);
  }

  let answer = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (title && title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE - 3).trimEnd() + "...";

  // Degenerate title → drop it but keep the (already stripped) answer.
  if (!title || title.length < 3) return { answer: answer || "(empty answer)", title: null };
  // Title only, nothing else → don't leak the raw marker as the answer.
  if (!answer) return { answer: "(empty answer)", title };
  return { answer, title };
}

// Builds the full answer prompt. Extracted so the prompt-limit retry can
// rebuild it with a trimmed context.
export function buildPrompt(
  question,
  context,
  history,
  { recency, wantTitle, topicSwitch = false }
) {
  const recencyRule = recency
    ? "- The user asks about CURRENT or RECENT information. Wikipedia can lag " +
      "real-world events. Unless the context explicitly states a recent fact " +
      "(with a date or unmistakable recency), phrase present-state claims as " +
      "\"As of Wikipedia's last update, ...\" instead of asserting they are " +
      "up to the moment. If the context has nothing recent, say what it does " +
      "cover and note that newer developments may not be reflected.\n"
    : "";

  return (
    exchangeBlock(history, topicSwitch) +
    "You are the overpowered Wikipedia search. When asked what you can do, say you are " +
    "the overpowered Wikipedia search that plans, fetches Wikipedia, and answers with sources.\n" +
    "Using the following context, answer the user's question clearly.\n" +
    "Rules:\n" +
    "- Base all specific facts, numbers, names, and dates strictly on the context provided.\n" +
    "- You may use general reasoning or well-known background knowledge only to connect ideas or explain terms, " +
    "not to supply specific facts, figures, or dates that aren't in the context.\n" +
    recencyRule +
    "- If the user asks for MORE detail or the CURRENT status of something, prioritize the most " +
    "recent and specific information in the context and go deeper than a general summary. If the " +
    "context does not contain recent/current details, say what it does cover and explicitly note " +
    "what is not covered, rather than either repeating a general summary or inventing specifics.\n" +
    "- If the context clearly describes the SAME entity the user is asking about but under a " +
    "slightly different name or description (e.g. the user says 'the band X' but the context " +
    "describes a solo musician named X, or a minor wording/spelling difference), treat it as a " +
    "match: answer using that context and briefly note the correction " +
    "(e.g. 'X is actually a solo musician, not a band'). Do not refuse over a near-miss in wording.\n" +
    "- Only say the information isn't available when the context genuinely does not cover the " +
    "subject at all. If a specific sub-fact needed to fully answer isn't in the context, answer " +
    "what you can and say which part isn't specified, rather than refusing entirely.\n" +
    (wantTitle
      ? "- After your answer, start a NEW line (its own line, nothing after it) and " +
        "output exactly: TITLE: <a concise title for this conversation, max 8 words>. " +
        "No quotes, no code block.\n"
      : "") +
    "Context:\n" + context + "\n" +
    "Question: " + question
  );
}

// OpenRouter free keys' PROMPT limit fluctuates (depletes as allowance is
// used). "Prompt tokens limit exceeded: 3964 > 1621" tells us the hard cap —
// trim ~4 chars/token of overage off the END of the context (earlier
// articles are higher priority) and retry once.
function trimForPromptLimit(raw, context) {
  const m = raw.match(/Prompt tokens limit exceeded:\s*(\d+)\s*>\s*(\d+)/);
  if (!m || !raw.startsWith("Model call failed")) return null;
  const overChars = (Number(m[1]) - Number(m[2])) * 4 + 400;
  const keep = context.length - overChars;
  if (keep < 600) return null;
  return context.slice(0, keep);
}

// Port of Java answerWithContext(): produces the final answer, grounded in
// the gathered Wikipedia context. Returns { answer, title, modelUsed,
// fallback } — title is the parsed conversation title when wantTitle was set
// (new chats only); modelUsed/fallback report which model actually answered
// (Phase 7 auto-fallback may have swapped the requested one).
export async function answerWithContext(
  question,
  context,
  tokenBudget,
  history = [],
  { recency = false, model = undefined, wantTitle = false, topicSwitch = false } = {}
) {
  const opts = { recency, wantTitle, topicSwitch };
  // +40 completion tokens when a TITLE line is requested so the final line
  // isn't cut off by max_tokens.
  const maxTokens = wantTitle ? tokenBudget + 40 : tokenBudget;

  const first = await callModel(
    buildPrompt(question, context, history, opts),
    maxTokens,
    model
  );
  let raw = first.text;
  let modelUsed = first.modelUsed;
  let fallback = first.fallback;
  let failures = first.failures ?? [];

  const smaller = trimForPromptLimit(raw, context);
  if (smaller) {
    console.warn(
      `[answer] 402 prompt limit — trimming context ${context.length}→${smaller.length} chars, retrying`
    );
    const retry = await callModel(
      buildPrompt(question, smaller, history, opts),
      maxTokens,
      model
    );
    raw = retry.text;
    modelUsed = retry.modelUsed;
    fallback = retry.fallback;
    failures = retry.failures ?? [];
  }

  const parsed = extractTitle(raw);
  if (wantTitle && !parsed.title) {
    console.warn(`[title] parse miss — response tail: …${raw.slice(-180)}`);
  }
  // Every model in the fallback chain failed → the agent has no answer at all.
  // The caller turns this into a user-facing "providers unavailable" message.
  return { ...parsed, modelUsed, fallback, allFailed: modelUsed === null, failures };
}
