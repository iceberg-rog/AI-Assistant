/**
 * LIVE connector — wires the support Telegram account to the engine.
 * Run:  node core/run-live.ts   (after putting TELEGRAM_BOT_TOKEN in Shelter/.env)
 *
 * Flow: getUpdates(business_message) -> orchestrator -> Policy-Gate -> reply | escalate,
 * sending on behalf of @ShelterAdm via business_connection_id. Writes live status +
 * conversations the dashboard reads. Auto-reply starts DISABLED for safety (Copilot mode):
 * pass --auto to enable auto_send; otherwise everything is drafted/escalated for humans.
 */
import "./load-env.ts"; // MUST be first — populates process.env before config flags are read
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LiveBusinessConnectionAdapter } from "./telegram/business-connection-adapter.live.ts";
import { routeInbound } from "./telegram/message-router.ts";
import { createStore } from "./conversation/state-store.ts";
import { USERS_DB_REAL, IP_TOOL_REAL, CLAUDE_REAL, CLAUDE_MODEL_FAST, CLAUDE_MODEL_SMART, CONF_FLOOR, ADMIN_CHAT_ID } from "./config.ts";
import { DATA_DIR } from "./data.ts";
import { selectQuery } from "./tools/users-query.ts";
import { getRegisteredIpSet } from "./tools/ip-registry.real.ts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const AUTO = process.argv.includes("--auto") || process.env.SHELTER_AUTO_SEND === "true";

// minimal .env loader (no deps)
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dir, "..", ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const statusFile = path.join(DATA_DIR, "connection_status.json");
const liveFile = path.join(DATA_DIR, "live_conversations.json");
const status: any = {
  botOnline: false,
  bot: null,
  businessConnections: 0,
  autoReply: AUTO,
  claude: CLAUDE_REAL,
  claudeModel: CLAUDE_REAL ? `${CLAUDE_MODEL_FAST} → ${CLAUDE_MODEL_SMART}` : null,
  confFloor: CONF_FLOOR,
  usersDB: USERS_DB_REAL,
  ipWhitelist: IP_TOOL_REAL,
  processed: 0,
  sent: 0,
  actions: { auto_send: 0, draft_for_review: 0, escalate_human: 0 },
  pid: process.pid,
  startedAt: new Date().toISOString(),
  heartbeatAt: new Date().toISOString(), // refreshed every 5s; the dashboard treats >15s stale as OFFLINE
  lastActivity: null,
  error: null,
};
const writeStatus = () => { status.heartbeatAt = new Date().toISOString(); fs.writeFileSync(statusFile, JSON.stringify(status, null, 2), "utf8"); };

// single-instance guard: two pollers calling getUpdates fight over the same offset (Telegram 409),
// so neither reliably receives messages. If a fresh, alive instance is already running, step aside.
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === "EPERM"; } }
try {
  const prev = JSON.parse(fs.readFileSync(statusFile, "utf8"));
  const freshMs = prev?.heartbeatAt ? Date.now() - new Date(prev.heartbeatAt).getTime() : Infinity;
  if (prev?.pid && prev.pid !== process.pid && freshMs < 15000 && pidAlive(prev.pid)) {
    console.log(`⛔ کانکتور از قبل در حال اجراست (pid ${prev.pid}, ${Math.round(freshMs / 1000)}s پیش). برای جلوگیری از تداخل getUpdates خارج می‌شوم.`);
    process.exit(0);
  }
} catch {}

if (!TOKEN) {
  status.error = "no_token";
  writeStatus();
  console.log(`
⛔ توکن نیست. برای اتصال:
  1) @BotFather → /newbot → توکن را بگیر.
  2) روی @ShelterAdm (با Premium): Settings → Telegram Business → Chatbots → بات را اضافه کن، «Reply to messages» را بده.
  3) توکن را در Shelter/.env بگذار:  TELEGRAM_BOT_TOKEN=...
  4) دوباره اجرا کن:  node core/run-live.ts        (افزودن --auto برای ارسال خودکار؛ پیش‌فرض Copilot)
`);
  process.exit(1);
}

const adapter = new LiveBusinessConnectionAdapter(TOKEN);
let liveEvents: any[] = [];
try { liveEvents = JSON.parse(fs.readFileSync(liveFile, "utf8")).events || []; } catch { liveEvents = []; } // survive restarts
const store = createStore(path.join(DATA_DIR, "conversation_state.json")); // per-user conversation memory

// telegramId → business_connection_id, persisted so the operator can message any user (even after a restart)
const bcidFile = path.join(DATA_DIR, "bcid_map.json");
let bcidMap: Record<string, string> = {};
try { bcidMap = JSON.parse(fs.readFileSync(bcidFile, "utf8")) || {}; } catch { bcidMap = {}; }
const writeBcid = () => { try { fs.writeFileSync(bcidFile, JSON.stringify(bcidMap, null, 2), "utf8"); } catch {} };

// live escalation queue (real human-support inbox) — persisted so it survives restarts
const escFile = path.join(DATA_DIR, "escalations_live.json");
let escEvents: any[] = [];
try { escEvents = JSON.parse(fs.readFileSync(escFile, "utf8")).items || []; } catch { escEvents = []; }
const writeEsc = () => { try { fs.writeFileSync(escFile, JSON.stringify({ generatedAt: new Date().toISOString(), items: escEvents }, null, 2), "utf8"); } catch {} };

// list of connected Business accounts — the operator can add the bot to ANY number of support
// accounts; each is tracked here. Persisted because the business_connection update fires only once.
const bcListFile = path.join(DATA_DIR, "business_connections.json");
try { adapter.seedConnections(JSON.parse(fs.readFileSync(bcListFile, "utf8")).items || []); } catch {}
const writeBcList = () => {
  try {
    const full = adapter.businessConnections; // {id, user, date, is_enabled, ...} from business_connection updates
    const haveIds = new Set(full.map((b: any) => b.id));
    // also surface bcids that are actively serving traffic (from bcid_map) but whose one-time
    // setup-update we missed (e.g., the account connected before this connector run started)
    const partial = [...new Set(Object.values(bcidMap))]
      .filter((id) => id && !haveIds.has(id))
      .map((id) => ({ id, partial: true }));
    fs.writeFileSync(bcListFile, JSON.stringify({ generatedAt: new Date().toISOString(), items: [...full, ...partial] }, null, 2), "utf8");
  } catch {}
};

// keep the connected-accounts list + count fresh even before the first message
setInterval(() => {
  status.businessConnections = adapter.businessConnections.length;
  writeBcList();
  writeStatus();
}, 5000);

try {
  const me = await adapter.getMe();
  status.botOnline = true;
  status.bot = "@" + me.username;
  writeStatus();
  console.log(`✅ bot ${status.bot} آنلاین. حالت: ${AUTO ? "AUTO" : "COPILOT (فقط دراف/ارجاع)"}`);
  console.log(`🔧 real tools → usersDB:${USERS_DB_REAL}  ipWhitelist:${IP_TOOL_REAL}`);
  console.log(`🧠 Claude brain → ${CLAUDE_REAL ? "ON (tiered: " + CLAUDE_MODEL_FAST + " → " + CLAUDE_MODEL_SMART + ")" : "OFF"}  · 📣 incident-injection active`);
  console.log(`   منتظر اتصال Business و پیام‌ها… (وضعیت زنده: داشبورد /connect)`);
} catch (e: any) {
  status.error = e.message;
  writeStatus();
  console.log("⛔ توکن نامعتبر یا خطای شبکه:", e.message);
  process.exit(1);
}

// ── live health-check (tests every integration) + editable non-secret settings ──
const envPath = path.join(__dir, "..", ".env");
const EDITABLE = new Set(["CLAUDE_MODEL", "CLAUDE_MODEL_FAST", "SHELTER_CONF_FLOOR", "SHELTER_FAST_TRUST", "SHELTER_SESSION_GAP_HOURS", "SHELTER_AUTO_SEND", "ADMIN_CHAT_ID"]);
function readEnvRaw(): Record<string, string> {
  const out: Record<string, string> = {};
  try { for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) out[m[1]] = m[2].trim(); } } catch {}
  return out;
}
function writeEnvLine(key: string, value: string): void {
  let lines: string[] = [];
  try { lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/); } catch {}
  let found = false;
  lines = lines.map((l) => { const m = l.match(/^\s*([A-Z_]+)\s*=/); if (m && m[1] === key) { found = true; return `${key}=${value}`; } return l; });
  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(envPath, lines.join("\n"), "utf8");
}
function setEnvKey(key: string, value: string): void {
  if (!EDITABLE.has(key)) throw new Error("not editable: " + key); // hard guard — secrets go through dedicated, validated paths
  writeEnvLine(key, value);
}
async function timed(fn: () => Promise<string>): Promise<any> {
  const t0 = Date.now();
  try { const detail = await fn(); return { ok: true, ms: Date.now() - t0, detail }; } // await BEFORE measuring
  catch (e: any) { return { ok: false, ms: Date.now() - t0, error: e?.message || "error" }; }
}
async function runHealthcheck(): Promise<any> {
  const KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const [telegram, claude, usersDb, ipWhitelist] = await Promise.all([
    timed(async () => { const me = await adapter.getMe(); return "@" + me.username; }),
    timed(async () => {
      if (!KEY) throw new Error("کلیدِ Claude تنظیم نشده");
      // FREE GET /models — verifies the key without spending any credit
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return "کلید معتبر (تستِ رایگانِ /models)";
    }),
    timed(async () => { if (!USERS_DB_REAL) throw new Error("USERS_QUERY_BASE تنظیم نشده"); await selectQuery("SELECT 1"); return "کوئریِ SELECT جواب داد"; }),
    timed(async () => { if (!IP_TOOL_REAL) throw new Error("IP_REGISTRY_ALLIPS_URL تنظیم نشده"); const set = await getRegisteredIpSet(); return set.size + " آی‌پی در وایت‌لیست"; }),
  ]);
  return { at: new Date().toISOString(), telegram, claude, usersDb, ipWhitelist };
}

// control server: the dashboard POSTs operator-approved drafts here -> send on behalf of the account
http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthcheck") {
    const out = await runHealthcheck();
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(out));
  }
  if (req.method === "GET" && req.url === "/settings") {
    const env = readEnvRaw();
    const present = (k: string) => !!env[k];
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      editable: {
        CLAUDE_MODEL: env.CLAUDE_MODEL || CLAUDE_MODEL_SMART,
        CLAUDE_MODEL_FAST: env.CLAUDE_MODEL_FAST || CLAUDE_MODEL_FAST,
        SHELTER_CONF_FLOOR: env.SHELTER_CONF_FLOOR || String(CONF_FLOOR),
        SHELTER_AUTO_SEND: env.SHELTER_AUTO_SEND || (AUTO ? "true" : "false"),
      },
      // secrets are NEVER returned — only whether they're present (so the UI shows connected/not)
      secrets: {
        TELEGRAM_BOT_TOKEN: present("TELEGRAM_BOT_TOKEN"),
        CLAUDE_API_KEY: present("CLAUDE_API_KEY"),
        USERS_QUERY_BASE: present("USERS_QUERY_BASE"),
        IP_REGISTRY_ALLIPS_URL: present("IP_REGISTRY_ALLIPS_URL"),
      },
    }));
  }
  if (req.method === "POST" && req.url === "/settings") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { updates } = JSON.parse(body || "{}");
        const applied: string[] = [];
        for (const [k, v] of Object.entries(updates || {})) { if (EDITABLE.has(k)) { setEnvKey(k, String(v)); applied.push(k); } }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, applied, restarting: applied.length > 0 }));
        if (applied.length) { console.log(`⚙ settings updated: ${applied.join(", ")} → restarting`); setTimeout(() => process.exit(0), 400); } // supervisor revives with new .env
      } catch (e: any) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  if (req.method === "POST" && req.url === "/settoken") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const t = String(JSON.parse(body || "{}").token || "").trim();
        if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(t)) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "قالبِ توکن نامعتبر است (مثل 123456:ABC...)" }));
        }
        // validate against Telegram BEFORE saving — a bad token must never break the running connector
        let me: any;
        try {
          const r = await fetch(`https://api.telegram.org/bot${t}/getMe`);
          const j: any = await r.json();
          if (!j.ok || !j.result?.is_bot) throw new Error(j.description || "not a bot");
          me = j.result;
        } catch (e: any) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Telegram توکن را رد کرد: " + (e?.message || "invalid") }));
        }
        const newBot = "@" + me.username;
        const botChanged = newBot !== status.bot;
        writeEnvLine("TELEGRAM_BOT_TOKEN", t);
        if (botChanged) {
          // a DIFFERENT bot → previous business connections belong to the old bot; clear for a fresh start
          try { fs.writeFileSync(bcidFile, "{}", "utf8"); } catch {}
          try { fs.writeFileSync(bcListFile, JSON.stringify({ generatedAt: new Date().toISOString(), items: [] }, null, 2), "utf8"); } catch {}
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, bot: newBot, restarting: true, botChanged }));
        console.log(`🔑 token set → ${newBot}${botChanged ? " (bot changed — connections cleared)" : ""} · restarting`);
        setTimeout(() => process.exit(0), 400); // supervisor revives with the new token
      } catch (e: any) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  if (req.method === "POST" && req.url === "/approve") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { chatId, text, businessConnectionId } = JSON.parse(body || "{}");
        if (!chatId || !text) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "missing chatId/text" }));
        }
        const bcid = businessConnectionId || bcidMap[String(chatId)]; // fall back to the persisted bcid
        const r = await adapter.sendMessage({ conversationId: `bc:${chatId}`, chatId, text, businessConnectionId: bcid });
        if (r.ok) {
          status.sent++;
          status.lastActivity = new Date().toISOString();
          writeStatus();
          console.log(`[sent→user] chat ${chatId}`);
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(r));
      } catch (e: any) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("shelter connector control");
})
  .on("error", (e: any) => {
    // port already bound → another connector is live. Step aside instead of crash-looping the supervisor.
    if (e?.code === "EADDRINUSE") {
      console.log("⛔ پورت 4050 اشغال است — یک کانکتور دیگر فعال است. خارج می‌شوم.");
      process.exit(0);
    }
    console.log("⚠ control server error:", e?.message);
  })
  .listen(4050, () => console.log("🛂 control server: http://localhost:4050 (approve→send)"));

// per-user serialization + cross-user concurrency: many simultaneous requests are handled at once,
// but two messages from the SAME user process in order (no state race).
const chains = new Map<number, Promise<void>>();
async function processInbound(inb: any): Promise<void> {
  if (inb.businessConnectionId && bcidMap[String(inb.user.telegramId)] !== inb.businessConnectionId) {
    bcidMap[String(inb.user.telegramId)] = inb.businessConnectionId; writeBcid();
  }
  const st0 = store.get(inb.user.telegramId);
  const { event, log, state } = await routeInbound(adapter, inb, { autoSend: AUTO, state: st0 });
  if (state) { store.set(inb.user.telegramId, state); store.persist(); }
  status.processed++;
  status.actions[event.decision.action]++;
  if (log.delivered === "auto_sent") status.sent++;
  status.businessConnections = adapter.businessConnections.length;
  status.lastActivity = new Date().toISOString();
  writeStatus();
  // persist a sent photo so the operator can open it in the dashboard
  let imageUrl: string | null = null;
  if (inb.kind === "photo" && inb.imageBase64) {
    try {
      const mdir = path.join(DATA_DIR, "media");
      fs.mkdirSync(mdir, { recursive: true });
      const fname = `${(inb.conversationId || "").replace(/[^a-z0-9]/gi, "")}_${(inb.receivedAt || "").replace(/[^0-9]/g, "")}.jpg`;
      fs.writeFileSync(path.join(mdir, fname), Buffer.from(inb.imageBase64, "base64"));
      imageUrl = `/api/media?f=${fname}`;
      const files = fs.readdirSync(mdir).filter((f) => f.endsWith(".jpg")).sort();
      for (const old of files.slice(0, Math.max(0, files.length - 80))) { try { fs.unlinkSync(path.join(mdir, old)); } catch {} } // keep last 80
    } catch {}
  }

  liveEvents.unshift({ ...event, kind: inb.kind || "text", imageUrl, delivered: log.delivered, businessConnectionId: inb.businessConnectionId, chatId: inb.user.telegramId });
  if (liveEvents.length > 50) liveEvents.pop();
  fs.writeFileSync(liveFile, JSON.stringify({ generatedAt: new Date().toISOString(), events: liveEvents }, null, 2), "utf8");

  // ── routed to a human → record in the live escalation inbox + ping the admin ──
  if (event.decision.action === "escalate_human" && event.escalated) {
    try { escEvents = JSON.parse(fs.readFileSync(escFile, "utf8")).items || []; } catch {} // merge dashboard claim/resolve
    escEvents.unshift({
      ...event.escalated,
      id: `esc_${Date.now().toString(36)}`,
      telegramId: inb.user.telegramId,
      username: inb.user.username || null,
      kind: inb.kind || "text",
      resolved: false,
      claimedBy: null,
      at: new Date().toISOString(),
    });
    if (escEvents.length > 200) escEvents.pop();
    writeEsc();
    if (ADMIN_CHAT_ID) {
      adapter
        .notifyChat(ADMIN_CHAT_ID, `🔔 ارجاع جدید به پشتیبانی انسانی\n👤 ${inb.user.name} ${inb.user.username || ""}\n📌 ${event.escalated.faLabel}\n⚠️ ${event.escalated.reason}\n💬 ${inb.text.slice(0, 200)}`)
        .catch(() => {});
    }
    console.log(`🔔 [ESCALATED→${event.escalated.routeTo}] ${event.escalated.faLabel} ← ${inb.user.name}`);
  } else {
    console.log(`[${log.delivered}] ${event.classification.faLabel} ← ${inb.user.name}${inb.kind && inb.kind !== "text" ? " (" + inb.kind + ")" : ""}`);
  }
}

await adapter.startIngest((inb) => {
  const uid = inb.user.telegramId;
  const prev = chains.get(uid) || Promise.resolve();
  const next = prev.then(() => processInbound(inb)).catch((e: any) => console.log("⚠ proc error:", e?.message));
  chains.set(uid, next);
  next.finally(() => { if (chains.get(uid) === next) chains.delete(uid); });
  return Promise.resolve(); // return immediately → adapter keeps reading → concurrent across users
});
