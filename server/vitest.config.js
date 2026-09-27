import { defineConfig } from "vitest/config";

// The unit suite must run on a fresh clone with no .env (CI has none) and must
// never spend real API quota. dotenv does not override variables that already
// exist, so these values win over a developer's .env: every test stubs fetch,
// so the keys only need to be truthy for providerEnabled() to be true.
// Keep GEMINI_API_KEY / HF_TOKEN unset so the "provider with no key is hidden"
// paths stay exercised, exactly as in the real .env.
export default defineConfig({
  test: {
    env: {
      OPENROUTER_API_KEY: "test-openrouter-key",
      GROQ_API_KEY: "test-groq-key",
      MISTRAL_API_KEY: "test-mistral-key",
      MODEL: "groq:openai/gpt-oss-120b",
    },
  },
});
