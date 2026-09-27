import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { sessionMiddleware } from "./middleware/session.js";
import askRouter from "./routes/ask.js";
import sessionsRouter from "./routes/sessions.js";
import modelsRouter from "./routes/models.js";
import authRouter from "./routes/auth.js";

const app = express();

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/ask", askRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/models", modelsRouter);

app.listen(config.port, async () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  if (!config.apiKey) {
    console.warn("[config] OPENROUTER_API_KEY is empty — agent calls will fail until set in .env");
  }
  await connectDb();
});
