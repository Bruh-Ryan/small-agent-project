// Test helper: create simple owned chats so the 15-chat retention cap can
// be exercised without spending LLM calls.
//
// Usage:  node scripts/seed-chats.js <username> <count>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const username = process.argv[2]?.trim().toLowerCase();
const count = Number(process.argv[3] ?? 0);

if (!username || !Number.isInteger(count) || count < 1) {
  console.error("Usage: node scripts/seed-chats.js <username> <count>");
  process.exit(1);
}

const uri = fs
  .readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8")
  .match(/MONGODB_URI=(.*)/)[1]
  .trim();

const { default: mongoose } = await import("mongoose");
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

try {
  const user = await mongoose.connection.db
    .collection("users")
    .findOne({ username });
  if (!user) {
    console.error(`No user "${username}" — register first.`);
    process.exit(1);
  }

  const now = new Date();
  const docs = Array.from({ length: count }, (_, i) => ({
    title: `Seeded chat ${i + 1}`,
    owner: user._id,
    messages: [],
    createdAt: new Date(now.getTime() - (count - i) * 60000),
    updatedAt: new Date(now.getTime() - (count - i) * 60000),
  }));
  const res = await mongoose.connection.db.collection("chats").insertMany(docs);
  const total = await mongoose.connection.db
    .collection("chats")
    .countDocuments({ owner: user._id });
  console.log(`Seeded ${res.insertedCount} chat(s); "${username}" now owns ${total}.`);
} finally {
  await mongoose.disconnect();
}
