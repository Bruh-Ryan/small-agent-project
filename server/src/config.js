import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the project-root .env regardless of which directory the server was
// started from (dotenv only reads .env relative to cwd by default).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/wiki-agent",
  port: Number(process.env.PORT) || 3001,
  // Express-session signing secret. Missing → random per-boot fallback
  // (logins won't survive a restart — set SESSION_SECRET in .env).
  sessionSecret: process.env.SESSION_SECRET || crypto.randomUUID(),
  // Optional extra LLM providers (Phase 7). Empty string = provider disabled
  // and hidden from the model picker.
  groqKey: process.env.GROQ_API_KEY || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  mistralKey: process.env.MISTRAL_API_KEY || "",
  hfToken: process.env.HF_TOKEN || "",
};
