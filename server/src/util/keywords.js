// Port of Java keywordSet(): lowercased set of "meaningful" words
// (length > 3, drops common stopwords).
const STOPWORDS = new Set([
  "the", "and", "that", "was", "were", "with",
  "about", "from", "this", "tell", "what", "which", "whose",
  "focusing", "released", "its", "for", "are", "who",
]);

export function keywordSet(text) {
  const words = new Set();
  for (const w of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length > 3 && !STOPWORDS.has(w)) words.add(w);
  }
  return words;
}

// True if the two keyword sets share at least one word.
export function shareKeyword(a, b) {
  for (const w of a) {
    if (b.has(w)) return true;
  }
  return false;
}
