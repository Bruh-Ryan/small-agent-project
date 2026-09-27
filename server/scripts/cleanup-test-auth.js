// One-off cleanup after 6C verification: remove test accounts + seeded
// chats, return claimed chats to orphan state so a real account can claim
// them via claim-orphan-chats.js.
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
const db = mongoose.connection.db;

const t1 = await db.collection("users").findOne({ username: "tester1" });
const t2 = await db.collection("users").findOne({ username: "tester2" });

if (t1) {
  const seeded = await db
    .collection("chats")
    .deleteMany({ owner: t1._id, title: /^Seeded chat/ });
  console.log("deleted seeded chats:", seeded.deletedCount);
  const reset = await db
    .collection("chats")
    .updateMany({ owner: t1._id }, { $set: { owner: null } });
  console.log("reset to orphans:", reset.modifiedCount);
  await db.collection("users").deleteOne({ _id: t1._id });
}
if (t2) {
  const c = await db.collection("chats").deleteMany({ owner: t2._id });
  console.log("deleted tester2 chats:", c.deletedCount);
  await db.collection("users").deleteOne({ _id: t2._id });
}
await db.collection("sessions").deleteMany({});

const orphans = await db
  .collection("chats")
  .countDocuments({ $or: [{ owner: { $exists: false } }, { owner: null }] });
const users = await db.collection("users").countDocuments();
console.log(`state: ${orphans} orphan chats, ${users} users, sessions cleared`);

await mongoose.disconnect();
