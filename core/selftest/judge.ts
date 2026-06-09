/**
 * LLM judge for the self-test — scores our bot's reply against the REAL admin reply.
 * Independent of the brain (a separate, skeptical grader). Needs CLAUDE_API_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_REAL, CLAUDE_MODEL } from "../config.ts";

export interface Judgment { score: number; ok: boolean; issue: string; }

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  if (!CLAUDE_REAL) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 4 });
  return _client;
}

const SYS = `تو داورِ سخت‌گیرِ کیفیتِ پشتیبانیِ «شلتر» هستی. سرویس: DNS اختصاصی با احرازِ IP برای رفعِ فیلتر و بازیِ کنسولی.
به جوابِ بات یک نمره ۱ تا ۵ بده (۵=عالی، مثلِ بهترین ادمین؛ ۱=غلط/گمراه‌کننده/رباتیک).
معیارها: درست بودن، کوتاه و انسانی بودن، نساختنِ حقیقتِ جعلی (اشتراک/آیپی/قیمت)، و اینکه واقعاً به مشکلِ کاربر جواب بده یا درست سوالِ بعدی رو بپرسه.
جوابِ ادمینِ واقعی فقط یک مرجعِ کمکیه؛ اگر جوابِ بات روشِ متفاوتی داشت ولی درست و مفید بود، نمره‌ی خوب بده.
خروجی فقط یک JSON یک‌خطی: {"score": <1-5>, "ok": <true|false>, "issue": "<کوتاه>"}`;

function extract(s: string): any | null {
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

export async function judgeReply(q: string, botReply: string, refReply: string): Promise<Judgment | null> {
  const c = client();
  if (!c) return null;
  const turn = `سوالِ کاربر: «${q}»\n\nجوابِ بات: «${botReply}»\n\nجوابِ ادمینِ واقعی (مرجع): «${refReply || "—"}»\n\nنمره بده. فقط JSON.`;
  try {
    const resp: any = await c.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: turn }],
    } as any);
    const tb = (resp.content || []).find((b: any) => b.type === "text");
    const p = tb ? extract(tb.text) : null;
    if (!p) return null;
    let score = Number(p.score);
    if (!Number.isFinite(score)) return null;
    score = Math.max(1, Math.min(5, score));
    return { score, ok: p.ok === true || score >= 4, issue: String(p.issue || "").slice(0, 160) };
  } catch {
    return null;
  }
}
