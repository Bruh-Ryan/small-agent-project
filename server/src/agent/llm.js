import { config } from "../config.js";

// Port of Java callModel(): posts a single user message to OpenRouter and
// returns the assistant content string. JSON.stringify handles escaping
// (the Java version did this by hand, which caused escape-loop bugs).
export async function callModel(prompt, maxTokens) {
  const body = JSON.stringify({
    model: "openai/gpt-4o",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text();
  const json = parseJsonSafe(text);
  if (!json || !Array.isArray(json.choices) || json.choices.length === 0) {
    return `Model call failed (${res.status}). Raw response: ${text}`;
  }
  return json.choices[0]?.message?.content ?? "";
}

// Safe JSON parse: returns null (instead of throwing) for empty/non-JSON
// bodies — e.g. HTML error pages or rate-limit plain-text responses.
export function parseJsonSafe(body) {
  if (body == null) return null;
  const trimmed = String(body).trim();
  if (trimmed === "" || trimmed[0] !== "{") {
    console.warn(
      `[json] non-JSON response skipped: ${trimmed.slice(0, 80)}`
    );
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    console.warn(`[json] parse failed, skipping: ${e.message}`);
    return null;
  }
}
