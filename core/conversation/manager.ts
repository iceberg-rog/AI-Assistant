/**
 * Conversation Manager — human-paced, stateful dialog (grounded in the 7-month data:
 * short messages, greet once, one thing per turn). Hybrid brain:
 *   - cheap regex classifier handles the confident cases (fast, free, deterministic)
 *   - when confidence < CONF_FLOOR (or other_unclear), Claude re-reads it grounded in the
 *     real KB + history + the user's DB record, and answers like our admins
 *   - if even Claude is unsure (or it needs a human) → escalate; never fabricate an answer
 * Incident/announcement rules are injected on top (prepend or replace).
 */
import type { Classification } from "../logs/schemas.ts";
import type { ConvState } from "./state-store.ts";
import { maybeResetSession } from "./state-store.ts";
import { norm } from "../agent/classify-message.ts";
import { goldenById } from "../data.ts";
import { IP_TOOL_REAL, USERS_DB_REAL, CLAUDE_REAL, CONF_FLOOR, SESSION_GAP_MS } from "../config.ts";
import { isIpRegistered } from "../tools/ip-registry.real.ts";
import { getUserRecord } from "../tools/users-query.ts";
import { matchIncident, bumpHit } from "../incidents/store.ts";
import { consultClaude, consultClaudeVision } from "../agent/llm-brain.ts";
import type { LlmVerdict } from "../agent/llm-brain.ts";

export interface Media { kind?: string; imageBase64?: string; imageMediaType?: string; caption?: string; }

const FACT_DEP = (id: string): boolean =>
  id.startsWith("ip_registration") || id.startsWith("conn_") ||
  id === "speed_ping_packetloss" || id === "sub_status_expiry" || id === "outage_compensation_request";

// intents whose canned golden answer is too generic/risky → always let Claude tailor the reply
// (reads the user's specific question instead of dumping a template). They are NOT fact-dependent.
const LLM_PREFERRED = new Set([
  "complaint_anger", "presale_pricing_plans", "presale_game_supported", "presale_trial_request",
  "dns_concept_question", "free_download_dns_request", "bot_telegram_issue", "game_login_match_fail",
]);

// ip is asked LAST (after device/net) and unlocks the real registration check
const SLOT_ORDER = ["device", "net", "ip"];
const SLOT_Q: Record<string, string> = {
  device: "دستگاهت چیه؟ (PS5 / ایکس‌باکس / موبایل / PC)",
  net: "با چه نتی وصلی؟ (ایرانسل / همراه‌اول / مخابرات / فیبر…)",
  ip: "آیپیت رو از این لینک برام بفرست تا چک کنم ثبت شده یا نه 🙏 ip.sheltertm.com",
};

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;
function detectDevice(n: string): string | undefined {
  if (/ps ?5|ps ?4|پلی ?استیشن|\bpsn\b/.test(n)) return "PS5/PS4";
  if (/ایکس ?باکس|xbox/.test(n)) return "Xbox";
  if (/موبایل|گوشی|ایفون|آیفون|اندروید/.test(n)) return "موبایل";
  if (/\bpc\b|کامپیوتر|لپ ?تاپ|ویندوز|سیستم/.test(n)) return "PC";
  return undefined;
}
function detectNet(n: string): string | undefined {
  if (/ایرانسل/.test(n)) return "ایرانسل";
  if (/همراه ?اول|\bmci\b/.test(n)) return "همراه‌اول";
  if (/مخابرات|adsl/.test(n)) return "مخابرات";
  if (/مبین/.test(n)) return "مبین‌نت";
  if (/فیبر/.test(n)) return "فیبر";
  if (/شاتل/.test(n)) return "شاتل";
  if (/رایتل/.test(n)) return "رایتل";
  if (/وای ?فای|wi ?-?fi/.test(n)) return "وای‌فای";
  return undefined;
}
function fillSlots(slots: ConvState["slots"], raw: string, n: string): void {
  if (!slots.device) { const d = detectDevice(n); if (d) slots.device = d; }
  if (!slots.net) { const x = detectNet(n); if (x) slots.net = x; }
  if (!slots.ip) { const m = raw.match(IPV4); if (m) slots.ip = m[0]; }
}
const GREETING_LINE = /^[،\s]*(سلام|درود|وقت بخیر|خسته نباشید|عرض ادب)/;
// defensive: strip a leading greeting from an LLM reply (the app owns the single greeting).
function stripGreeting(s: string): string {
  const r = s.trimStart().replace(/^(?:سلام|درود|وقت بخیر|وقتت? بخیر|خسته نباشید|عرض ادب)[\s،]*(?:عزیز|دوستِ? عزیز|داداش|گلم|جان)?[\s،]*[🙏❤️😊🌹]*[\s،]*/u, "");
  return r.trim() || s.trim();
}
function shortGolden(intentId: string): string {
  const g = goldenById.get(intentId);
  const lines = ((g?.final_answer_fa || "") as string).split("\n").map((s) => s.trim()).filter(Boolean);
  const substantive = lines.find((l) => !GREETING_LINE.test(l));
  return substantive || lines[0] || "در خدمتم 🙏 بگو دقیقا چی شده تا کمکت کنم.";
}

export interface ConvReply {
  messages: string[];
  state: ConvState;
  escalate?: { reason: string };       // low confidence even after Claude → route to a human
  confidence?: number;                  // effective confidence (Claude's if consulted)
  llm?: LlmVerdict | null;              // present when Claude was consulted
  incidentId?: string;                  // present when an incident rule fired
}

export async function respond(text: string, cls: Classification, state: ConvState, at: string, media?: Media): Promise<ConvReply> {
  // ── lifetime stats (NEVER reset) — "from the first day they messaged to the last" ──
  if (!state.firstSeenAt) state.firstSeenAt = at;
  state.lastSeenAt = at;
  state.msgIn = (state.msgIn || 0) + 1;
  state.lastKind = media?.kind || "text";
  // ── long silence → fresh session (don't read months-old context for a returning user) ──
  if (maybeResetSession(state, at, SESSION_GAP_MS)) state.sessions = (state.sessions || 0) + 1;
  else if (!state.sessions) state.sessions = 1;

  const wasGreeted = state.greeted;
  state.history.push({ role: "user", text, at });
  state.lastUserAt = at;
  state.turnCount++;

  const countOut = (lines: string[]) => { state.msgOut = (state.msgOut || 0) + lines.length; };

  // ── voice → we can't process audio; politely ask them to type (no brain, no API) ──
  if (media?.kind === "voice") {
    const v: string[] = [];
    if (!state.greeted) { v.push("سلام عزیز 🙏❤️"); state.greeted = true; }
    v.push("ببخشید فعلاً امکانِ بررسیِ پیامِ صوتی برامون نیست 🙏 لطفاً مشکلت رو همینجا تایپ کن تا سریع کمکت کنم ❤️");
    state.stage = "ask_text";
    for (const l of v) state.history.push({ role: "bot", text: l, at });
    state.lastBotAt = at; countOut(v);
    return { messages: v, state, confidence: 1 };
  }

  const n = norm(text);
  fillSlots(state.slots, text, n);
  // topic switch: a confident, DIFFERENT intent starts a fresh sub-flow (no state bleed)
  if (cls.intentId !== "other_unclear" && cls.confidence >= CONF_FLOOR && state.intent && state.intent !== cls.intentId) {
    state.intent = cls.intentId;
    state.realAnswered = false;
    state.slots = {};
    state.stage = "new";
  } else if (!state.intent || state.intent === "other_unclear") {
    state.intent = cls.intentId;
  }
  let intent = state.intent || cls.intentId;

  const lines: string[] = [];
  if (!state.greeted) { lines.push("سلام عزیز 🙏❤️"); state.greeted = true; }

  // ── 1) incident / announcement injection (admin temporary rule) ──
  const incident = matchIncident(text, intent);
  let incidentId: string | undefined;
  if (incident) {
    bumpHit(incident.id);
    incidentId = incident.id;
    lines.push(incident.message);
    if (incident.mode === "replace") {
      // short-circuit: just the wait-message, no diagnostics / no fact-claims
      state.stage = "incident";
      for (const l of lines) state.history.push({ role: "bot", text: l, at });
      state.lastBotAt = at; countOut(lines);
      return { messages: lines, state, incidentId };
    }
    // prepend mode: notice leads, normal answer continues below
  }

  // ── 1b) photo → Claude vision reads the screenshot (error), grounded in KB + DB ──
  if (media?.kind === "photo") {
    if (CLAUDE_REAL && media.imageBase64) {
      let u = state.userRecord;
      if (!u && USERS_DB_REAL) { try { u = await getUserRecord(state.telegramId); state.userRecord = u; } catch { u = null; } }
      const vv = await consultClaudeVision({ imageBase64: media.imageBase64, imageMediaType: media.imageMediaType, caption: media.caption, history: state.history, userRecord: u, incident });
      if (vv) {
        if (vv.intentId !== "other_unclear") state.intent = vv.intentId;
        if (vv.needsHuman) {
          state.greeted = wasGreeted; state.stage = "human";
          return { messages: [], state, escalate: { reason: vv.reason || "needs_human" }, confidence: vv.confidence, llm: vv, incidentId };
        }
        lines.push(stripGreeting(vv.reply));
        state.stage = "answered_vision"; state.realAnswered = true;
        for (const l of lines) state.history.push({ role: "bot", text: l, at });
        state.lastBotAt = at; countOut(lines);
        return { messages: lines, state, confidence: vv.confidence, llm: vv, incidentId };
      }
    }
    // no key / vision failed → ask them to describe it
    lines.push("عکستو دیدم 🙏 یه‌کم برام تایپ کن دقیقاً چه ارور یا مشکلی داری و رو چه دستگاهی، تا دقیق راهنماییت کنم ❤️");
    state.stage = "ask_desc";
    for (const l of lines) state.history.push({ role: "bot", text: l, at });
    state.lastBotAt = at; countOut(lines);
    return { messages: lines, state, confidence: 0.5, incidentId };
  }

  // ── 2) low-confidence → Claude re-checks (grounded), else cheap regex path ──
  let verdict: LlmVerdict | null = null;
  let effConfidence = cls.confidence;
  const needLlm = CLAUDE_REAL && (cls.confidence < CONF_FLOOR || intent === "other_unclear" || LLM_PREFERRED.has(intent));
  if (needLlm) {
    let u = state.userRecord;
    if (!u && USERS_DB_REAL) { try { u = await getUserRecord(state.telegramId); state.userRecord = u; } catch { u = null; } }
    verdict = await consultClaude({
      text, history: state.history, regexIntent: intent, regexConfidence: cls.confidence, userRecord: u, incident,
    });
    if (verdict) {
      effConfidence = verdict.confidence;
      if (verdict.intentId !== "other_unclear") { state.intent = verdict.intentId; intent = verdict.intentId; }
      if (verdict.needsHuman) {
        // a genuine human case (billing/refund/transfer/stuck) → route to a human, no fake answer.
        state.greeted = wasGreeted;
        state.stage = "human";
        return { messages: [], state, escalate: { reason: verdict.reason || "needs_human" }, confidence: effConfidence, llm: verdict, incidentId };
      }
      // Claude understood → send its reply (often a clarifying question). Low confidence is NOT
      // discarded — the Policy-Gate holds it for review and flags it; a useful question still goes out.
      lines.push(stripGreeting(verdict.reply));
      state.stage = verdict.confidence >= CONF_FLOOR ? "answered_llm" : "answered_llm_lowconf";
      state.realAnswered = true;
      for (const l of lines) state.history.push({ role: "bot", text: l, at });
      state.lastBotAt = at; countOut(lines);
      return { messages: lines, state, confidence: effConfidence, llm: verdict, incidentId };
    }
    // Claude unavailable/errored → fall through to the regex path (degrade safely)
  }

  // ── 3) regex path (confident, or no-key fallback) ──
  if (cls.confidence < 0.6 && intent === "other_unclear") {
    // not confident and no LLM to rescue it → ask to clarify (operator sees low_confidence flag).
    lines.push("ببخشید دقیق متوجه نشدم 🙏 می‌تونی یه‌کم واضح‌تر بگی مشکلت چیه یا دنبال چی هستی؟");
    state.stage = "clarify";
  } else if (FACT_DEP(intent)) {
    if (USERS_DB_REAL) {
      let u = state.userRecord;
      if (!u) { try { u = await getUserRecord(state.telegramId); state.userRecord = u; } catch { u = null; } }
      if (u && !state.realAnswered) {
        state.realAnswered = true;
        if (!u.found) {
          lines.push("با این آیدی تلگرام اکانتت رو پیدا نکردم 🤔 مطمئنی با همین اکانت خرید کردی؟ اگه آره، اولین پیامِ ربات (کد کاربری) رو برام فوروارد کن.");
          state.stage = "needs_user";
        } else if (u.banned) {
          lines.push("اکانتت مسدوده — می‌فرستمش برای پشتیبانِ انسانی که بررسی کنه 🙏");
          state.stage = "human";
        } else if (!u.active) {
          lines.push(`چک کردم، اشتراکت منقضی شده (${Math.abs(u.daysLeft)} روز پیش). برای فعال‌شدن دوباره باید از ربات تمدید کنی ❤️`);
          state.stage = "resolved";
        } else if (!u.ip1) {
          lines.push(`اشتراکت فعاله (${u.daysLeft} روز مونده) ولی هنوز هیچ آیپی‌ای ثبت نکردی — برو داخل ربات «ثبت آیپی» رو بزن (فیلترشکن و دی‌ان‌اس موقع ثبت خاموش)، بعد تست کن ❤️`);
          state.stage = "resolved";
        } else {
          lines.push(`اشتراکت فعاله (${u.daysLeft} روز مونده) و آیپیِ ثبت‌شده‌ت ${u.ip1}${u.ip2 ? " / " + u.ip2 : ""} هست.`);
          lines.push("اگه نتت عوض شده یا قطع‌وصل شدی، یه بار دیگه از ربات ثبت آیپی کن (فیلترشکن خاموش، نت گوشی و کنسولت یکی)، بعد تست کن. نشد یه عکس از ارور بفرست 🙏");
          state.stage = "resolved";
        }
      } else if (u) {
        lines.push("اگه بعد این مراحل بازم وصل نشدی، یه عکس از ارور بفرست تا دقیق ببینم چی شده 🙏");
      } else {
        lines.push("ممنون 🙏 الان وضعیتت رو چک می‌کنم و راه‌حل می‌دم.");
      }
    } else {
      const next = SLOT_ORDER.find((s) => !(state.slots as Record<string, string>)[s]);
      if (next) {
        lines.push(SLOT_Q[next]);
        state.stage = "collecting";
      } else if (IP_TOOL_REAL && state.slots.ip) {
        try {
          const res = await isIpRegistered(state.slots.ip);
          lines.push(res.value.registered
            ? `آیپیت (${state.slots.ip}) ثبت هست ✅ پس مشکل از ثبت‌آیپی نیست؛ فیلترشکن و دی‌ان‌اس قبلی رو خاموش کن و دوباره تست کن.`
            : `چک کردم، آیپی ${state.slots.ip} ثبت نیست ❌ — از داخل ربات «ثبت آیپی» بزن، بعد دوباره تست کن ❤️`);
          state.stage = "resolved";
        } catch { lines.push("ممنون 🙏 الان چک می‌کنم و راه‌حل می‌دم."); }
      } else {
        lines.push("ممنون 🙏 با همینا الان دقیق چک می‌کنم و راه‌حلو می‌دم ❤️");
        state.stage = "ready";
      }
    }
  } else {
    lines.push(shortGolden(intent));
    state.stage = "answered";
  }

  for (const l of lines) state.history.push({ role: "bot", text: l, at });
  state.lastBotAt = at; countOut(lines);
  return { messages: lines, state, confidence: effConfidence, llm: verdict, incidentId };
}
