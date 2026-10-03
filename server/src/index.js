import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { sessionMiddleware } from "./middleware/session.js";
import askRouter from "./routes/ask.js";
import sessionsRouter from "./routes/sessions.js";
import modelsRouter from "./routes/models.js";
import authRouter from "./routes/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const app = express();

// Behind Render/HTTPS (single origin): trust the proxy so secure cookies work.
app.set("trust proxy", 1);

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/ask", askRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/models", modelsRouter);

// Single-origin deploy: serve the built React app (baked into the image at
// server/public by the Dockerfile). Skipped silently in dev when absent.
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"), (err) => {
      if (err) next();
    });
  });
}

app.listen(config.port, async () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  if (!config.apiKey) {
    console.warn("[config] OPENROUTER_API_KEY is empty — agent calls will fail until set in .env");
  }
  await connectDb();
});
