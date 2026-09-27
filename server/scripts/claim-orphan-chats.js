// One-off migration: give every pre-auth (ownerless) conversation to an
// account, so that user sees their old history after logging in (Phase 6C).
//
// Usage:  node scripts/claim-orphan-chats.js <username>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usernameArg = process.argv[2]?.trim().toLowerCase();

if (!usernameArg) {
  console.error("Usage: node scripts/claim-orphan-chats.js <username>");
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
    .findOne({ username: usernameArg });
  if (!user) {
    console.error(`No user "${usernameArg}" — register first, then re-run.`);
    process.exit(1);
  }

  const res = await mongoose.connection.db.collection("chats").updateMany(
    { $or: [{ owner: { $exists: false } }, { owner: null }] },
    { $set: { owner: user._id } }
  );
  console.log(
    `Claimed ${res.modifiedCount} orphaned chat(s) for "${usernameArg}" (${user._id}).`
  );
} finally {
  await mongoose.disconnect();
}
