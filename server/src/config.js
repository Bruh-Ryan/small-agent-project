import path from "node:path";
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
};
