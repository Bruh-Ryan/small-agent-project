import session from "express-session";
import MongoStore from "connect-mongo";
import { config } from "../config.js";

// Cookie sessions stored in MongoDB (`sessions` collection). httpOnly +
// sameSite=lax works through the Vite proxy (same-origin). If Atlas is
// unreachable we fall back to the in-memory store so the server still boots
// (login itself will fail until the DB returns — users live in Mongo too).
function buildStore() {
  try {
    return MongoStore.create({
      mongoUrl: config.mongoUri,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60, // match cookie maxAge (seconds)
    });
  } catch (err) {
    console.warn(`[session] MongoStore unavailable (${err.message}) — using MemoryStore`);
    return undefined;
  }
}

export const sessionMiddleware = session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: buildStore(),
  name: "wiki.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // https on Render; http in dev
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
  },
});
