import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = fs
  .readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8")
  .match(/MONGODB_URI=(.*)/)[1]
  .trim();

const { default: mongoose } = await import("mongoose");
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  const chats = await db.collection("chats").find({}).toArray();
  console.log("chats docs:", chats.length);
  chats.forEach((c) => console.log("  -", c.title, `(${c.messages.length} msgs)`));

  const cache = await db
    .collection("wiki_cache")
    .find({}, { projection: { key: 1, fetchedAt: 1, expiresAt: 1 } })
    .toArray();
  console.log("wiki_cache docs:", cache.length);
  cache.forEach((c) => console.log("  -", c.key, "expires", c.expiresAt.toISOString()));

  const idx = await db.collection("wiki_cache").indexes();
  console.log(
    "wiki_cache indexes:",
    idx.map((i) => `${i.name} (expireAfterSeconds=${i.expireAfterSeconds})`).join(", ")
  );
} catch (e) {
  console.log("FAILED:", e.message);
} finally {
  await mongoose.disconnect().catch(() => {});
}
