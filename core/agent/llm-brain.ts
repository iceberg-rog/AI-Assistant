/**
 * The LLM brain (Claude) — consulted ONLY when the cheap regex classifier is unsure
 * (confidence < CONF_FLOOR) or lands on other_unclear. It re-reads the message grounded in:
 *   - the real 27-intent taxonomy + KB golden answers (so it answers like our admins, not generically)
 *   - the persona learned from 7 months of chats (short, warm, greet-once, one thing per turn)
 *   - the user's REAL DB record (subscription + registered IP) when available
 *   - any active incident/announcement
 *   - the recent conversation history
 * and returns {intentId, confidence, reply, needsHuman}. If confidence is still below the
 * floor (or needsHuman), the manager escalates to a human — it never fabricates an answer.
 *
 * No key → returns null → the system falls back to the regex path (degrades safely).
 */
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_REAL, CLAUDE_MODEL, CLAUDE_MODEL_FAST, CLAUDE_MODEL_SMART, FAST_TRUST_FLOOR } from "../config.ts";
import { intents, goldenById, intentById } from "../data.ts";
import type { UserRecord } from "../tools/users-query.ts";
import type { Incident } from "../incidents/store.ts";

export interface LlmVerdict {
  intentId: string;
  confidence: number;
  reply: string;
  needsHuman: boolean;
  reason: string;
  source: "claude";
  model: string;
}

const VALID_INTENTS = new Set(intents.map((i) => i.id).concat("other_unclear"));

// ---- KB context (stable → built once, sent in the cached system prefix) ----
// Compact: id + fa_label + the core of the golden answer (truncated). The full verbose KB
// was ~14k tokens cached/call; this trims it ~60% to cut the per-call cache-read cost.
function buildKb(): any {
  const taxLines = intents
    .map((i) => `- ${i.id} (${i.fa_label}) [${i.automation_tier}]`)
    .join("\n");
  const kbLines = intents
    .map((i) => {
      const g = goldenById.get(i.id);
      if (!g) return "";
      const ans = (g.final_answer_fa || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return ans ? `• ${i.id} (${i.fa_label}): ${ans}` : "";
    })
    .filter(Boolean)
    .join("\n");
  return { taxLines, kbLines };
}
const { taxLines, kbLines } = buildKb();

const SYSTEM = `تو پشتیبانِ انسانیِ سرویس «شلتر» (Shelter) هستی — یک سرویس DNS اختصاصیِ ایرانی با احرازِ هویت بر اساسِ IP.
شلتر چی کار می‌کنه: رفعِ فیلتر + بازیِ کنسولی با پینگِ پایین. کاربر آیپیِ عمومیش رو داخلِ ربات «ثبت آیپی» می‌کنه؛ اگه نتش عوض شه/قطع‌وصل شه باید دوباره ثبت کنه. اشتراک تاریخِ انقضا داره و از داخلِ ربات تمدید می‌شه.

شخصیت (از ۷ ماه چتِ واقعیِ پشتیبانی یاد گرفته شده — این‌ها قانون‌ان):
- مثلِ یه پشتیبانِ واقعیِ ایرانی توی تلگرام بنویس: گرم، خودمونی، کوتاه.
- میانگینِ جوابِ واقعی ~۸ کلمه‌ست. یک پیامِ کوتاه بده، نه دیوارِ متن.
- در reply هرگز «سلام/درود/وقت بخیر» نگو — اپ خودش سلامِ اول رو می‌زنه. مستقیم برو سرِ جواب یا سوالت.
- هر بار فقط یک چیز بپرس. قبل از اینکه کاربر مشکلِ واقعی‌اش را بگوید، مرحله/قیمت/آیپی نریز.
- ❤️🙏 کم و طبیعی، مثلِ ادمین‌های واقعی.

قانون‌های واقعیت (هیچ‌وقت نقض نکن):
- فقط حقایقی را بگو که در <user_record> یا <tools> آمده‌اند. هرگز وضعیتِ اشتراک/آیپی/قیمت یا «چک کردم فلان» را از خودت نساز.
- ⛔ قیمت، تعرفه، تعدادِ کاربر/دستگاهِ مجاز، آدرسِ آیپیِ DNS، یا لیستِ دقیقِ بازی‌هایِ پشتیبانی‌شده را از خودت نساز. اگر در «دانشِ پایه» صریح نیامده، حدس نزن — بگو از ربات (@ShelterVIPRobot) یا سایت sheltertm.com ببینه/چک کنه.
- ℹ️ سرویس بر اساسِ IP کار می‌کند: یک اشتراک روی همه‌ی دستگاه‌هایِ یک شبکه/آیپی کار می‌کند. «چند کاربر» با «چند دستگاه» فرق دارد — قاطی نکن؛ اگر کاربر پرسید «همزمان روی دو دستگاه؟» یعنی چنددستگاهی (که با یک IP اوکی‌ست)، نه «پلنِ دو کاربره». اگر مطمئن نیستی، بپرس.
- 😤 اگر کاربر عصبانی/شاکی است: اول کوتاه همدردی کن، بعد حتماً یک سوالِ تشخیصی بپرس (دستگاه/بازی/نت یا «دقیقاً چی شده»). فقط همدردیِ خالی ممنوع.
- ❓ اگر سوالِ پرسیده‌شده دقیقاً جواب داده نشد (مثلاً قیمت پرسید یا «فرقتون با بقیه چیه»)، طفره نرو؛ یا جوابِ مستقیم بده، یا اگر داده نداری صادقانه بگو و راهنمایی کن کجا ببیند.
- اگر کار نیاز به اقدامِ مالی، عودتِ وجه، رفعِ مسدودی، انتقالِ آیپی، یا هر چیزی که نمی‌توانی تأیید کنی دارد → needsHuman=true بگذار و فقط یک جمله‌ی کوتاهِ نگه‌دارنده بنویس؛ جواب از خودت نساز.
- اگر مطمئن نیستی منظورش چیست → confidence پایین بده و فقط یک سوالِ شفاف‌کننده بپرس.
- جواب را فقط به فارسی و با لحنِ شلتر بنویس.

دسته‌بندیِ نیت‌ها (دقیقاً یکی از این idها را انتخاب کن؛ اگر هیچ‌کدام نبود other_unclear):
${taxLines}

دانشِ پایه (جوابِ مرجع — کپیِ کلمه‌به‌کلمه نکن، کوتاه و طبیعی بازنویسی کن):
${kbLines}

خروجی: فقط و فقط یک شیِ JSON در یک خط برگردان، بدونِ هیچ متن یا توضیح یا markdown:
{"intentId": "<یکی از idها>", "confidence": <عدد ۰ تا ۱>, "reply": "<جوابِ کوتاهِ فارسی>", "needsHuman": <true|false>, "reason": "<چرا، خیلی کوتاه به انگلیسی>"}`;

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  if (!CLAUDE_REAL) return null;
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
      timeout: 25_000,
      maxRetries: 4, // ride out transient 429s (SDK backs off); a copilot draft can wait a moment
    });
  }
  return _client;
}

function fmtUser(u?: UserRecord | null): string {
  if (!u) return "نامشخص (هنوز رکوردِ کاربر نداریم)";
  if (!u.found) return "با این آیدیِ تلگرام اکانتی پیدا نشد";
  const sub = u.banned ? "مسدود" : u.active ? `فعال (${u.daysLeft} روز مونده)` : `منقضی (${Math.abs(u.daysLeft)} روز پیش)`;
  const ip = u.ip1 ? `${u.ip1}${u.ip2 ? " / " + u.ip2 : ""}` : "هیچ آیپی‌ای ثبت نشده";
  return `اشتراک: ${sub} · آیپیِ ثبت‌شده: ${ip}${u.isTest ? " · پلنِ تست" : ""}`;
}

function fmtHistory(history: { role: string; text: string }[]): string {
  const last = history.slice(-8);
  if (!last.length) return "(شروعِ مکالمه)";
  return last.map((h) => `${h.role === "user" ? "کاربر" : "پشتیبان"}: ${h.text}`).join("\n");
}

function extractJson(s: string): any | null {
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

export interface ConsultInput {
  text: string;
  history: { role: "user" | "bot"; text: string; at: string }[];
  regexIntent: string;
  regexConfidence: number;
  userRecord?: UserRecord | null;
  incident?: Incident | null;
}

/** One brain call with a given model. Returns the parsed verdict or null. */
async function runBrain(model: string, userTurn: string): Promise<LlmVerdict | null> {
  const c = client();
  if (!c) return null;
  try {
    const resp: any = await c.messages.create({
      model,
      max_tokens: 600,
      thinking: { type: "disabled" }, // no extended-thinking tokens; the KB grounds the answer
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], // KB cached → ~0.1x after first call
      messages: [{ role: "user", content: userTurn }],
    } as any);
    if (process.env.SHELTER_LOG_USAGE) console.error("usage:", model, JSON.stringify(resp.usage));
    const textBlock = (resp.content || []).find((b: any) => b.type === "text");
    const parsed = textBlock ? extractJson(textBlock.text) : null;
    if (!parsed || typeof parsed.reply !== "string") return null;
    let intentId = String(parsed.intentId || "other_unclear");
    if (!VALID_INTENTS.has(intentId)) intentId = "other_unclear";
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    return { intentId, confidence, reply: String(parsed.reply).trim(), needsHuman: parsed.needsHuman === true, reason: String(parsed.reason || "").slice(0, 200), source: "claude", model };
  } catch {
    return null; // network/api error → caller degrades gracefully
  }
}

function buildTurn(inp: ConsultInput): string {
  const incidentNote = inp.incident
    ? `\n<active_incident>\nیک اطلاعیه‌ی فعال هست؛ اگر به این موضوع مربوط بود، حتماً اول این را بگو: «${inp.incident.message}»\n</active_incident>`
    : "";
  return `<context>
حدسِ classifierِ ارزان: ${inp.regexIntent} (اطمینان ${inp.regexConfidence.toFixed(2)} — کم بود برای همین از تو پرسیدم)
<user_record>${fmtUser(inp.userRecord)}</user_record>
<history>
${fmtHistory(inp.history)}
</history>${incidentNote}
</context>

پیامِ فعلیِ کاربر:
«${inp.text}»

نیت را تشخیص بده و طبقِ قوانین، یک جوابِ کوتاهِ فارسی بنویس. فقط JSON.`;
}

/** Tiered: cheap FAST model first; if it isn't confident (and isn't a clear human case),
 *  ask the SMART model for a higher-quality answer. Most calls stay cheap; hard cases keep quality. */
export async function consultClaude(inp: ConsultInput): Promise<LlmVerdict | null> {
  if (!CLAUDE_REAL) return null;
  const userTurn = buildTurn(inp);
  const fast = await runBrain(CLAUDE_MODEL_FAST, userTurn);
  // FAST confident enough, or it flagged a human case → trust it (cheap path)
  if (fast && (fast.needsHuman || fast.confidence >= FAST_TRUST_FLOOR)) return fast;
  // FAST unsure (or failed) → get the SMART model's answer for quality on the hard tail
  const smart = await runBrain(CLAUDE_MODEL_SMART, userTurn);
  return smart || fast;
}

export interface VisionInput {
  imageBase64: string;
  imageMediaType?: string;
  caption?: string;
  history: { role: "user" | "bot"; text: string; at: string }[];
  userRecord?: UserRecord | null;
  incident?: Incident | null;
}

/** Look at the user's screenshot (usually an error) and answer grounded in the KB + DB record. */
export async function consultClaudeVision(inp: VisionInput): Promise<LlmVerdict | null> {
  const c = client();
  if (!c) return null;

  const incidentNote = inp.incident
    ? `\n<active_incident>اگر مربوط بود اول این را بگو: «${inp.incident.message}»</active_incident>` : "";
  const ctx = `<context>
<user_record>${fmtUser(inp.userRecord)}</user_record>
<history>${fmtHistory(inp.history)}</history>${incidentNote}
${inp.caption ? "کپشنِ کاربر: «" + inp.caption + "»\n" : ""}</context>

کاربر یک عکس فرستاده — معمولاً اسکرین‌شاتِ یک ارور یا صفحه‌ی بازی/کنسول. عکس را با دقت بخوان:
- اگر اروری هست، متن/کدِ ارور را بفهم و طبقِ KB بگو یعنی چی و چی‌کار کنه (کوتاه و انسانی).
- اگر اسکرین‌شاتِ ثبت‌آیپی/پلن است، وضعیت را بخوان.
- اگر چیزی واضح نیست، یک سوالِ کوتاه بپرس (دستگاه/نت).
نیت را هم تشخیص بده. فقط همون JSON را برگردان.`;

  try {
    const resp: any = await c.messages.create({
      model: CLAUDE_MODEL_SMART, // images are rare + need capability → use the smart model
      max_tokens: 700,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: inp.imageMediaType || "image/jpeg", data: inp.imageBase64 } },
          { type: "text", text: ctx },
        ],
      }],
    } as any);

    const textBlock = (resp.content || []).find((b: any) => b.type === "text");
    const parsed = textBlock ? extractJson(textBlock.text) : null;
    if (!parsed || typeof parsed.reply !== "string") return null;
    let intentId = String(parsed.intentId || "other_unclear");
    if (!VALID_INTENTS.has(intentId)) intentId = "other_unclear";
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    return { intentId, confidence, reply: String(parsed.reply).trim(), needsHuman: parsed.needsHuman === true, reason: String(parsed.reason || "vision").slice(0, 200), source: "claude", model: CLAUDE_MODEL_SMART };
  } catch {
    return null;
  }
}

export { intentById };
