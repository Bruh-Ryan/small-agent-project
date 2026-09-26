import { callModel } from "./llm.js";

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
  "Reply int EXACTLY this format, Nothing else:\n" +
  "TOKENS: <single integer only, no ranges, no dashes - e.g 800>\n" +
  "WIKIPEDIA_SEARCH_TITLE(s): <article title eg. query - 'I want to understand how black holes form, what happens at the event horizon and how Hawking radiation works, also who discovered them' then titles would be 'Black hole', 'Event horizon', 'Hawking radiation' or eg. 'what are persian cats', titles would be 'persian cats' or eg. 'who is the current president of the United States and when did they take office' then titles would be 'Donald Trump', 'President of the United States', 'List of presidents of the United States'>";

// Port of Java plannerResponse(): returns the raw planner text.
export async function plannerResponse(userQuery) {
  const response = await callModel(PLANNER_INSTRUCTIONS + userQuery, 100);
  console.log("PLAN IS: " + response);
  return response.trim();
}

const TOKEN_PATTERN = /^TOKENS:\s*(.*)$/i;
const TITLE_PATTERN = /^WIKIPEDIA_SEARCH_TITLE(?:\(S\)|S)?:\s*(.*)$/i;

// Parses a raw planner response into { tokenBudget, searchTitles }.
// TOKENS line → integer budget (default 500); TITLE(S) line → parsed titles.
export function parsePlan(plan) {
  let tokenLine = "";
  const searchTitles = [];

  for (const rawLine of String(plan).split("\n")) {
    const line = rawLine.trim();

    const tm = line.match(TOKEN_PATTERN);
    if (tm) {
      tokenLine = tm[1].trim();
      continue;
    }

    const sm = line.match(TITLE_PATTERN);
    if (sm) {
      searchTitles.push(...parseTitles(sm[1].trim()));
    }
  }

  const digits = tokenLine.replace(/[^0-9]/g, "");
  const tokenBudget = tokenLine && digits ? Number.parseInt(digits, 10) : 500;

  return { tokenBudget, searchTitles };
}
