const USER_AGENT =
  "small-agent-project/1.0 (learning project; contact: ryan@example.com)";

// Port of Java httpGetWithRetry(): GET with descriptive User-Agent and
// exponential backoff when Wikipedia rate-limits (429 or plain-text
// "too many requests" body). Returns the final response body string.
export async function httpGetWithRetry(url, options = {}) {
  const maxAttempts = options.maxAttempts ?? 4;
  let backoffMs = options.backoffMs ?? 500;
  const log = options.log ?? console.log;
  let body = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    body = await res.text();

    const rateLimited =
      res.status === 429 ||
      (body != null && body.toLowerCase().includes("too many requests"));

    if (!rateLimited) return body;

    if (attempt < maxAttempts) {
      log(
        `  [rate-limited] waiting ${backoffMs}ms before retry ${attempt + 1}/${maxAttempts}`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs *= 2;
    }
  }
  return body; // give up; caller's parseJsonSafe will skip it
}
