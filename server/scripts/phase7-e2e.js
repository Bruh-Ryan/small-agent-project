// Phase 7 end-to-end check against a running server. Uses a throwaway account
// and a temp cookie jar so it can be run against servers started with different
// FORCE_FAIL_PROVIDERS values without touching real accounts.
//
// Usage:
//   node scripts/phase7-e2e.js models
//   node scripts/phase7-e2e.js login                    # registers or logs in
//   node scripts/phase7-e2e.js ask "<question>" [model-id]
//   node scripts/phase7-e2e.js cleanup
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const USER = process.env.DEMO_USER ?? "phase7demo";
const PASS = process.env.DEMO_PASS ?? "Phase7Demo!234";
const JAR = path.join(os.tmpdir(), "phase7-demo-cookie.txt");

const [cmd, ...rest] = process.argv.slice(2);

function cookieHeader() {
  if (!fs.existsSync(JAR)) {
    console.error("no cookie jar — run: node scripts/phase7-e2e.js login");
    process.exit(1);
  }
  return `${COOKIE_NAME}=${fs.readFileSync(JAR, "utf8").trim()}`;
}

// Routes (see server/src/index.js): auth is mounted at /api/auth.
const AUTH = `${BASE}/api/auth`;

// The session cookie is named `wiki.sid` (see the session middleware in
// server/src/index.js) — grab whatever name the server actually sent rather
// than hard-coding it.
const COOKIE_NAME = "wiki.sid";

function readCookie(res) {
  const raw = res.headers.getSetCookie?.()?.join("; ") ?? res.headers.get("set-cookie") ?? "";
  return raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1] ?? null;
}

function dumpResponse(label, res) {
  console.error(`\n[${label}] HTTP ${res.status} ${res.statusText}`);
  for (const [k, v] of res.headers) {
    console.error(`  ${k}: ${v}`);
  }
}

async function login() {
  let res = await fetch(`${AUTH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });

  if (res.status === 401) {
    // First run: create the throwaway account (register logs in immediately).
    const reg = await fetch(`${AUTH}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (!reg.ok) {
      dumpResponse("register", reg);
      console.error(await reg.text());
      process.exit(1);
    }
    console.log(`registered ${USER}`);
    res = reg;
  } else if (!res.ok) {
    dumpResponse("login", res);
    console.error(await res.text());
    process.exit(1);
  } else {
    console.log(`logged in as ${USER}`);
  }

  const sid = readCookie(res);
  if (!sid) {
    dumpResponse("no session cookie", res);
    process.exit(1);
  }
  fs.writeFileSync(JAR, sid);
}

async function cleanup() {
  // Delete the throwaway account, its chats and its session rows only.
  const uri = fs
    .readFileSync(path.join(process.cwd(), "..", ".env"), "utf8")
    .match(/MONGODB_URI=(.*)/)[1]
    .trim();
  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const user = await db.collection("users").findOne({ username: USER });
  if (user) {
    const chats = await db.collection("chats").deleteMany({ owner: user._id });
    const sessions = await db
      .collection("sessions")
      .deleteMany({ session: { $regex: String(user._id) } });
    await db.collection("users").deleteOne({ _id: user._id });
    console.log(
      `removed ${USER}: ${chats.deletedCount} chat(s), ${sessions.deletedCount} session(s)`
    );
  } else {
    console.log(`${USER} does not exist — nothing to clean up`);
  }
  await mongoose.disconnect();
  if (fs.existsSync(JAR)) fs.unlinkSync(JAR);
}

async function showModels() {
  const res = await fetch(`${BASE}/api/models`);
  const body = await res.json();
  const ids = (body.models ?? []).map((m) => m.id);
  console.log(`status ${res.status}, ${ids.length} models, default=${body.default}`);
  const groups = new Map();
  for (const m of body.models ?? []) {
    if (!groups.has(m.provider)) groups.set(m.provider, []);
    groups.get(m.provider).push(m.id);
  }
  for (const [provider, list] of groups) {
    console.log(`  ${provider.padEnd(11)} ${list.length}: ${list.join(", ")}`);
  }
  const hidden = ["gemini", "hf"].filter((p) => groups.has(p));
  console.log(`hidden providers (no key): ${hidden.length ? hidden.join(", ") : "none"}`);
  console.log(`top-level keys: ${Object.keys(body).join(", ")}`);
}

async function ask() {
  const question = rest[0] ?? "What is a black hole?";
  const model = rest[1];
  const body = { query: question };
  if (model) body.model = model;

  const started = Date.now();
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(`status ${res.status} in ${Date.now() - started}ms`);
  if (!res.ok) {
    console.log(`error: ${json.error}`);
    return;
  }
  // A logged-out cookie must fail loudly rather than look like a fallback bug.
  if (json.error === "authentication required") {
    console.error("session rejected — run: node scripts/phase7-e2e.js login");
    process.exitCode = 1;
    return;
  }
  console.log(`requestedModel: ${json.requestedModel}`);
  console.log(`model (answered): ${json.model}`);
  console.log(`fallback:        ${json.fallback ? JSON.stringify(json.fallback) : "none"}`);
  console.log(`allFailed:       ${json.allFailed}`);
  if (json.failures?.length) {
    console.log(`failures:        ${json.failures.map((f) => `${f.model} (${f.reason})`).join(" | ")}`);
  }
  console.log(`sessionId:       ${json.sessionId}`);
  console.log(`answer:\n---\n${json.answer}\n---`);
}

switch (cmd) {
  case "login":
    await login();
    break;
  case "models":
    await showModels();
    break;
  case "ask":
    await ask();
    break;
  case "cleanup":
    await cleanup();
    break;
  default:
    console.error("usage: phase7-e2e.js models | login | ask [model] | cleanup");
    process.exit(1);
}
