import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = fs
  .readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8")
  .match(/MONGODB_URI=(.*)/)[1]
  .trim();

const { default: mongoose } = await import("mongoose");
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
const keys = [
  "summary|Lionel Messi",
  "summary-full|Lionel Messi",
  "summary|Inter Miami CF",
  "summary-full|Inter Miami CF",
];
const r = await mongoose.connection.db
  .collection("wiki_cache")
  .updateMany({ key: { $in: keys } }, { $set: { fetchedAt: threeDaysAgo } });
console.log(
  `backdated to 3 days ago: ${r.modifiedCount} docs (expiresAt untouched → still within 7d TTL)`
);
await mongoose.disconnect();
