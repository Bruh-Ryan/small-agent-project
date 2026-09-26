import mongoose from "mongoose";
import { config } from "./config.js";

// Never log credentials — show mongodb+srv://user:***@host/db only.
function maskUri(uri) {
  return uri.replace(/(:\/\/[^:/@]+:)[^@]+@/, "$1***@");
}

// Connects to MongoDB but never crashes the server if it is unreachable —
// phases 1-2 don't need the DB yet, and a missing local Mongo shouldn't block
// development. Returns true on success, false otherwise.
export async function connectDb() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`[db] connected: ${maskUri(config.mongoUri)}`);
    return true;
  } catch (err) {
    console.warn(`[db] could not connect to ${maskUri(config.mongoUri)}: ${err.message}`);
    console.warn("[db] continuing WITHOUT persistence (sessions/cache disabled)");
    return false;
  }
}
