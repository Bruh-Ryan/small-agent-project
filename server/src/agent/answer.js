import { callModel } from "./llm.js";

// Port of Java answerWithContext(): produces the final answer, grounded in
// the gathered Wikipedia context.
export async function answerWithContext(question, context, tokenBudget) {
  const instructions =
    "Using the following context, answer the user's question clearly.\n" +
    "Rules:\n" +
    "- Base all specific facts, numbers, names, and dates strictly on the context provided.\n" +
    "- You may use general reasoning or well-known background knowledge only to connect ideas or explain terms, " +
    "not to supply specific facts, figures, or dates that aren't in the context.\n" +
    "- If the context clearly describes the SAME entity the user is asking about but under a " +
    "slightly different name or description (e.g. the user says 'the band X' but the context " +
    "describes a solo musician named X, or a minor wording/spelling difference), treat it as a " +
    "match: answer using that context and briefly note the correction " +
    "(e.g. 'X is actually a solo musician, not a band'). Do not refuse over a near-miss in wording.\n" +
    "- Only say the information isn't available when the context genuinely does not cover the " +
    "subject at all. If a specific sub-fact needed to fully answer isn't in the context, answer " +
    "what you can and say which part isn't specified, rather than refusing entirely.\n" +
    "Context:\n" + context + "\n" +
    "Question: " + question;

  return callModel(instructions, tokenBudget);
}
