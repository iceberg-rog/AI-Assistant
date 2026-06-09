#!/usr/bin/env node
/**
 * Shelter — Telegram Business Connection STAGING PROBE (step 4.1)
 * ------------------------------------------------------------------
 * Purpose: verify the ONE unverified ADR risk before building the full skeleton —
 * how a connected business bot actually behaves: business_message intake, replying
 * ON BEHALF of the support account, the ~24h reply window, inline keyboards,
 * manual takeover, and pause/resume. Every event is logged.
 *
 * It connects via LONG POLLING (no public URL / webhook needed — works behind NAT).
 *
 * SETUP (you do this — needs your Telegram):
 *   1) @BotFather -> /newbot -> copy the token.
 *   2) On the SUPPORT account (@ShelterAdm, needs Telegram Premium):
 *        Settings -> Telegram Business -> Chatbots -> add the bot's @username,
 *        enable "Reply to messages", pick chat scope (start with a test scope).
 *   3) Put the token in  staging/.token  (one line) OR set env TELEGRAM_BOT_TOKEN.
 *   4)  node staging/telegram-probe.mjs
 *   5) From a SECOND Telegram account, message the support account. Watch:
 *        live log -> http://localhost:4040
 *   6) Operator controls: DM the BOT directly (normal chat) with:
 *        /status  /pause  /resume  /conn  /help
 *
 * Nothing here is destructive: replies are clearly marked test messages.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LOG_PORT = 4040;
const EVENTS_FILE = path.join(__dir, "events.jsonl");

// ---------- token ----------
function readToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
  try {
    const t = fs.readFileSync(path.join(__dir, ".token"), "utf8").trim();
    if (t) return t;
  } catch {}
  return null;
}
const TOKEN = readToken();
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

// ---------- state ----------
const state = {
  me: null,
  autoReply: true,
  connections: {}, // business_connection_id -> { user_chat_id, rights, is_enabled }
  events: [],      // in-memory ring (last 500)
};

function logEvent(type, data = {}) {
  const ev = { t: new Date().toISOString(), type, ...data };
  state.events.push(ev);
  if (state.events.length > 500) state.events.shift();
  try { fs.appendFileSync(EVENTS_FILE, JSON.stringify(ev) + "\n"); } catch {}
  const tag = { in: "📥", out: "📤", err: "⛔", info: "•", conn: "🔗", cmd: "⌨" }[data._k || "info"] || "•";
  console.log(`${tag} [${ev.t.slice(11, 19)}] ${type}`, data.detail ? "— " + data.detail : "");
  return ev;
}

// ---------- telegram helper ----------
async function tg(method, params = {}) {
  if (!API) throw new Error("no token");
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({ ok: false, description: "non-json response" }));
  if (!data.ok) {
    const err = new Error(data.description || "telegram error");
    err.telegram = data;
    throw err;
  }
  return data.result;
}

// ---------- probes ----------
async function sendOnBehalf(bcid, chatId, text, extra = {}) {
  return tg("sendMessage", { business_connection_id: bcid, chat_id: chatId, text, ...extra });
}

async function handleBusinessMessage(msg) {
  const bcid = msg.business_connection_id;
  const chatId = msg.chat?.id;
  const from = msg.from || {};
  logEvent("business_message.in", {
    _k: "in",
    bcid,
    chat_id: chatId,
    user: { id: from.id, name: [from.first_name, from.last_name].filter(Boolean).join(" "), username: from.username },
    text: (msg.text || "").slice(0, 300),
    detail: `from ${from.first_name || from.id}: ${(msg.text || "").slice(0, 60)}`,
  });

  if (!state.autoReply) {
    logEvent("auto_reply.skipped", { _k: "info", detail: "AI paused — operator handles manually (takeover)" });
    return;
  }

  // 1) plain reply on behalf of the support account
  try {
    await sendOnBehalf(bcid, chatId, "🔧 [probe] پیامت رسید — این یک تست اتصال است (پاسخ از طرف اکانت پشتیبانی).");
    logEvent("reply.plain.ok", { _k: "out", chat_id: chatId, detail: "plain on-behalf reply sent" });
  } catch (e) {
    logEvent("reply.plain.err", { _k: "err", chat_id: chatId, detail: e.telegram?.description || e.message, telegram: e.telegram });
  }

  // 2) inline-keyboard test (the key open question)
  try {
    await sendOnBehalf(bcid, chatId, "🔧 [probe] تست inline keyboard:", {
      reply_markup: { inline_keyboard: [[
        { text: "ثبت آیپی ✅", callback_data: "probe_ip" },
        { text: "وضعیت اشتراک", callback_data: "probe_sub" },
      ]] },
    });
    logEvent("reply.inline.ok", { _k: "out", chat_id: chatId, detail: "inline keyboard ACCEPTED on-behalf" });
  } catch (e) {
    logEvent("reply.inline.err", { _k: "err", chat_id: chatId, detail: e.telegram?.description || e.message, telegram: e.telegram });
  }
}

async function handleOperatorCommand(msg) {
  const chatId = msg.chat.id;
  const cmd = (msg.text || "").trim().split(/\s+/);
  logEvent("operator.command", { _k: "cmd", detail: msg.text });
  const reply = (text) => tg("sendMessage", { chat_id: chatId, text }).catch(() => {});
  switch (cmd[0]) {
    case "/start":
    case "/help":
      return reply("PROBE controls:\n/status — وضعیت\n/pause — خاموش‌کردن پاسخ خودکار (takeover)\n/resume — روشن‌کردن\n/conn — اتصال‌های Business و مجوزها\n/replyto <bcid> <chat_id> <text> — تست دستیِ ارسال (برای پنجره ۲۴h)");
    case "/status":
      return reply(`autoReply: ${state.autoReply ? "ON" : "OFF (takeover)"}\nconnections: ${Object.keys(state.connections).length}\nevents: ${state.events.length}\nlog: http://localhost:${LOG_PORT}`);
    case "/pause":
      state.autoReply = false; logEvent("ai.paused", { _k: "info" }); return reply("⏸ پاسخ خودکار خاموش شد — اپراتور دستی جواب می‌دهد.");
    case "/resume":
      state.autoReply = true; logEvent("ai.resumed", { _k: "info" }); return reply("▶️ پاسخ خودکار روشن شد.");
    case "/conn":
      return reply(JSON.stringify(state.connections, null, 2).slice(0, 3500) || "هیچ اتصالی ثبت نشده");
    case "/replyto": {
      const [, bcid, target, ...rest] = cmd;
      if (!bcid || !target) return reply("usage: /replyto <bcid> <chat_id> <text>");
      try {
        await sendOnBehalf(bcid, target, rest.join(" ") || "🔧 [probe] manual 24h-window test");
        logEvent("replyto.ok", { _k: "out", detail: `manual send to ${target} OK` });
        return reply("✅ ارسال موفق — یعنی داخل پنجره مجاز بودیم.");
      } catch (e) {
        logEvent("replyto.err", { _k: "err", detail: e.telegram?.description || e.message });
        return reply("⛔ خطا: " + (e.telegram?.description || e.message) + "\n(اگر پیام آخرِ آن چت >۲۴h باشد، همین خطای پنجره مورد انتظار است.)");
      }
    }
    default:
      return reply("دستور ناشناخته. /help");
  }
}

function handleBusinessConnection(bc) {
  state.connections[bc.id] = {
    user_chat_id: bc.user_chat_id,
    user: bc.user ? { id: bc.user.id, username: bc.user.username } : null,
    rights: bc.rights || bc.can_reply, // newer API exposes `rights`; older exposes can_reply
    is_enabled: bc.is_enabled,
  };
  logEvent("business_connection", {
    _k: "conn",
    bcid: bc.id,
    is_enabled: bc.is_enabled,
    detail: `connected=${bc.is_enabled} rights=${JSON.stringify(bc.rights || { can_reply: bc.can_reply })}`,
  });
}

async function handleUpdate(u) {
  if (u.business_connection) return handleBusinessConnection(u.business_connection);
  if (u.business_message) return handleBusinessMessage(u.business_message);
  if (u.edited_business_message) return logEvent("business_message.edited", { _k: "in", detail: (u.edited_business_message.text || "").slice(0, 60) });
  if (u.deleted_business_messages) return logEvent("business_message.deleted", { _k: "in", detail: `count=${u.deleted_business_messages.message_ids?.length}` });
  if (u.message && u.message.chat?.type === "private") return handleOperatorCommand(u.message);
  if (u.callback_query) return logEvent("callback_query", { _k: "in", detail: u.callback_query.data });
}

// ---------- long-poll loop ----------
const ALLOWED = ["message", "callback_query", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"];
async function pollLoop() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 50, allowed_updates: ALLOWED });
      for (const u of updates) {
        offset = u.update_id + 1;
        try { await handleUpdate(u); } catch (e) { logEvent("handler.error", { _k: "err", detail: e.message }); }
      }
    } catch (e) {
      logEvent("poll.error", { _k: "err", detail: e.telegram?.description || e.message });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ---------- live log HTTP server ----------
const PAGE = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>Telegram Probe — Shelter</title><style>
body{background:#07080b;color:#e6e8ee;font-family:Tahoma,Segoe UI,sans-serif;margin:0;padding:16px}
h1{font-size:16px;margin:0 0 4px}.sub{color:#7b8190;font-size:12px;margin-bottom:14px}
.row{border:1px solid #1c2230;border-radius:8px;padding:8px 10px;margin:5px 0;font-size:12px;display:flex;gap:10px}
.t{color:#5b6472;font-family:monospace;direction:ltr}.ty{color:#34d399;min-width:190px;direction:ltr}
.d{color:#c3c8d2;flex:1}.err .ty{color:#fb7185}.out .ty{color:#38bdf8}.conn .ty{color:#fbbf24}
.bar{display:flex;gap:8px;margin-bottom:12px}.pill{background:#11151c;border:1px solid #1c2230;border-radius:6px;padding:4px 10px;font-size:12px}
</style></head><body>
<h1>🔧 Telegram Business Connection — Probe Log</h1>
<div class="sub">staging risk-test (step 4.1) · زنده، هر ۲ ثانیه رفرش</div>
<div class="bar" id="bar"></div><div id="log"></div>
<script>
const KCLS={err:'err',out:'out',conn:'conn'};
async function tick(){
 const r=await fetch('/events.json');const j=await r.json();
 document.getElementById('bar').innerHTML=
   '<span class=pill>me: '+(j.me||'—')+'</span>'+
   '<span class=pill>autoReply: '+(j.autoReply?'ON':'OFF (takeover)')+'</span>'+
   '<span class=pill>connections: '+j.connections+'</span>'+
   '<span class=pill>events: '+j.events.length+'</span>';
 document.getElementById('log').innerHTML=j.events.slice().reverse().map(e=>{
   const k=KCLS[e._k]||'';
   return '<div class="row '+k+'"><span class=t>'+e.t.slice(11,19)+'</span><span class=ty>'+e.type+'</span><span class=d>'+(e.detail||'')+'</span></div>';
 }).join('');
}
setInterval(tick,2000);tick();
</script></body></html>`;

http.createServer((req, res) => {
  if (req.url.startsWith("/events.json")) {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ me: state.me?.username || null, autoReply: state.autoReply, connections: Object.keys(state.connections).length, events: state.events }));
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(PAGE);
}).listen(LOG_PORT, () => console.log(`\n📊 live probe log: http://localhost:${LOG_PORT}\n`));

// ---------- boot ----------
(async () => {
  logEvent("probe.start", { _k: "info", detail: `log on :${LOG_PORT}` });
  if (!TOKEN) {
    console.log("\n⛔ توکن پیدا نشد. توکن بات را در staging/.token بگذار یا env TELEGRAM_BOT_TOKEN را ست کن.");
    console.log("   (سرور لاگ بالاست ولی تا توکن نباشد، polling شروع نمی‌شود.)\n");
    return;
  }
  try {
    state.me = await tg("getMe");
    logEvent("getMe.ok", { _k: "info", detail: `@${state.me.username} (id ${state.me.id})` });
    console.log(`\n✅ bot @${state.me.username} — منتظر business_message…  (DM بات: /help)\n`);
    pollLoop();
  } catch (e) {
    logEvent("getMe.err", { _k: "err", detail: e.telegram?.description || e.message });
    console.log("\n⛔ توکن نامعتبر یا خطای شبکه:", e.telegram?.description || e.message, "\n");
  }
})();
