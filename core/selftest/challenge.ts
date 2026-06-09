/** Final challenge: ~100 diverse/hard questions → full pipeline → Claude judge. ONE clean run.
 *  SAFETY: prod DB/IP stay OFF (only CLAUDE_API_KEY read). Run:
 *    CLAUDE_API_KEY=... node core/selftest/challenge.ts  (pool low to avoid rate-limit bursts) */
import fs from "node:fs";
import path from "node:path";
import { respondWithState } from "../conversation/respond.ts";
import { defaultState } from "../conversation/state-store.ts";
import { CLAUDE_REAL, CLAUDE_MODEL } from "../config.ts";
import { DATA_DIR } from "../data.ts";
import { loadRealPairs } from "./bank.ts";
import { judgeReply } from "./judge.ts";

const POOL = Number((process.argv.find((_, i) => process.argv[i - 1] === "--pool")) || "2") || 2;

// curated hard/diverse battery — typos, slang, mixed greeting+question, adversarial, en/finglish, multi-issue
const CURATED: string[] = [
  // connection — varied phrasings / typos / slang
  "رو ps5 وصل نمیشه هرکاری میکنم", "ایکس باکسم ارور میده نمیتونم آنلاین بازی کنم", "دیشب اوکی بود الان قطع شد",
  "نمیتونم بخش انلاین رو پلی بدم", "هیچ راه وصل شدنی نیست خسته شدم", "dns set کردم ولی کار نمیکنه",
  "وای فای خونه وصل نمیشه ولی با دیتا اوکیه", "بازی لود نمیشه میمونه رو صفحه اول",
  // ip registration
  "آموزش ثبت ای پی", "هربار باید ثبت ایپی کنم؟ خسته کننده ست", "ثبت ایپی زدم ولی بازم وصل نمیشم",
  "لینک ثبت آیپی باز نمیشه فیلتره", "آیپیم عوض شده چیکار کنم",
  // presale
  "تا چند کاربر میشه؟", "اشتراکمو همزمان رو کنسول و موبایل میتونم استفاده کنم؟", "وارزون رو ساپورت میکنید",
  "battlefield 6 جواب میده؟", "قیمت اشتراک سه ماهه چنده", "تست دارید قبل خرید امتحان کنم؟",
  "اندروید هم دارید یا فقط ویندوز؟", "برای دانلود سرعتش خوبه؟", "کالاف موبایل رو رفع فیلتر میکنه؟",
  // payment / refund (should mostly escalate)
  "پولمو پس بدید راضی نیستم", "پول کم شد ولی اشتراکم فعال نشد", "دوبار پول ازم کسر شد",
  "درگاه پرداخت کار نمیکنه نمیتونم بخرم", "کارت به کارت کردم رسید فرستادم فعال نشد",
  // speed / ping
  "پینگم خیلی بالاست", "وسط بازی قطع و وصل میشم", "پکت لاس میخورم تو بازی", "سرعت دانلودم افت کرده",
  // subscription / outage
  "اشتراکم چند روز مونده", "اشتراکم تموم شده تمدید کنم چطوری", "سرورا قطعه؟ هیچکس جواب نمیده",
  "روزای قطعی رو جبران میکنید؟",
  // dns concept / misc
  "فرق dns شما با بقیه چیه", "دی ان اس رایگان خوب سراغ دارید؟", "ربات خرید باز نمیشه",
  // greeting + real question (the bug we fixed)
  "سلام وقت بخیر، شلتر برای فورتنایت خوبه؟", "سلام خسته نباشید تست 2ساعته فعال نشد برام",
  "سلام داداش گوشی ایفون دارم برای پلی استیشن چیکار کنم", "درود، اشتراکم رو میشه بذارید برای بعد؟",
  // adversarial / abuse / vague
  "آشغال", "مرتیکه کلاهبردار پولمو خوردین", "خیلی ضعیفه سرویستون", "یه سوال داشتم", "کمک",
  "اخه این چه وضعشه", "🙏", "test", "salam khaste nabashid dns kar nemikone",
  // english / finglish
  "hi my dns is not working on ps5", "ping is too high in warzone what to do",
  "chera vasl nemishe har kari mikonam", "subscription faal nemishe pool dadam",
  // multi-issue / tricky
  "هم پینگم بالاست هم وسط بازی قطع میشم رو ایرانسل", "اشتراک خریدم ولی نمیدونم چطوری dns رو ست کنم رو کامپیوتر",
  "آیپیمو ثبت کردم اشتراکمم فعاله ولی بازم تو call of duty مچ نمیشم",
];

let _id = 5_000_000;
async function ask(q: string) {
  const tid = _id++;
  const inb = { conversationId: "ch:" + tid, user: { name: "Test", telegramId: tid, userCode: "SH-T" }, text: q, receivedAt: new Date().toISOString() };
  const { event } = await respondWithState(inb, defaultState(tid));
  return event;
}
async function pool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function main() {
  console.log(`\n🎯 Shelter — challenge run · Claude ${CLAUDE_REAL ? "ON (" + CLAUDE_MODEL + ")" : "OFF"}\n`);

  // ~100 = curated hard + stratified real sample across the 13 coarse buckets
  const real = loadRealPairs();
  const byCoarse: Record<string, { q: string; refReply: string }[]> = {};
  for (const r of real) (byCoarse[r.coarse] ||= []).push(r);
  const realSample: { q: string; refReply: string }[] = [];
  for (const c of Object.keys(byCoarse)) realSample.push(...byCoarse[c].slice(3, 7)); // 4 per bucket, skip the noisiest first 3
  const items = [
    ...CURATED.map((q) => ({ q, refReply: "" })),
    ...realSample.slice(0, 100 - CURATED.length),
  ];
  console.log(`battery: ${CURATED.length} curated-hard + ${items.length - CURATED.length} real = ${items.length} questions\n`);

  // run pipeline
  const rows = await pool(items, POOL, async (it) => {
    const ev = await ask(it.q);
    const reply = ev.reply?.messages?.join(" / ") || (ev.reply ? ev.reply.text : "");
    return {
      q: it.q, refReply: it.refReply,
      intent: ev.classification.intentId, conf: ev.classification.confidence,
      action: ev.decision.action, claude: (ev.evidence.tools || []).some((t: any) => t.name === "claude_review"),
      reply, escalatedTo: ev.escalated?.routeTo || null,
    };
  });

  // judge (every answered row)
  const judged = await pool(rows, POOL, async (r) => {
    if (r.action === "escalate_human" || !r.reply) return { ...r, score: null as number | null, issue: "" };
    const j = await judgeReply(r.q, r.reply, r.refReply);
    return { ...r, score: j?.score ?? null, issue: j?.issue || "" };
  });

  // print every Q→A
  console.log("──────── Q → A ────────");
  for (const r of judged) {
    const tag = r.action === "escalate_human" ? `↗ارجاع:${r.escalatedTo}` : `${r.intent} ${r.conf.toFixed(2)}${r.claude ? "🧠" : ""}`;
    const sc = r.score != null ? ` [${r.score}/5]` : "";
    const ans = r.action === "escalate_human" ? "(به انسان ارجاع شد)" : r.reply;
    console.log(`\n«${r.q}»\n  ${tag}${sc}  →  ${ans}${r.issue ? "\n   ⚠ " + r.issue : ""}`);
  }

  // aggregate
  const answered = judged.filter((r) => r.score != null);
  const avg = answered.length ? answered.reduce((s, r) => s + (r.score || 0), 0) / answered.length : 0;
  const ok = answered.filter((r) => (r.score || 0) >= 4).length;
  const unclear = judged.filter((r) => r.intent === "other_unclear").length;
  const escal = judged.filter((r) => r.action === "escalate_human").length;
  const claudeN = judged.filter((r) => r.claude).length;
  console.log(`\n──────── AGGREGATE (${judged.length}) ────────`);
  console.log(`  judged answers:     ${answered.length}`);
  console.log(`  avg quality (1–5):  ${avg.toFixed(2)}`);
  console.log(`  acceptable (≥4):    ${answered.length ? Math.round((100 * ok) / answered.length) : 0}%`);
  console.log(`  other_unclear:      ${Math.round((100 * unclear) / judged.length)}%`);
  console.log(`  escalated→human:    ${Math.round((100 * escal) / judged.length)}%`);
  console.log(`  Claude consulted:   ${Math.round((100 * claudeN) / judged.length)}%`);

  const report = {
    generatedAt: new Date().toISOString(), mode: "challenge", claude: CLAUDE_REAL, model: CLAUDE_MODEL,
    bank: { synthetic: 0, real: judged.length },
    accuracy: { fine: 0, coarseSynth: 0, coarseRealAgree: 0 },
    health: { otherUnclearRate: unclear / judged.length, deadEndRate: 0, claudeRate: claudeN / judged.length, escalateRate: escal / judged.length },
    confidenceDist: {}, actionDist: {},
    judge: { n: answered.length, avgScore: Number(avg.toFixed(2)), okRate: answered.length ? Number(((100 * ok) / answered.length).toFixed(1)) : 0,
      worst: answered.filter((r) => (r.score || 0) <= 2).slice(0, 10).map((r) => ({ q: r.q.slice(0, 50), reply: r.reply.slice(0, 70), score: r.score, issue: r.issue })) },
    examples: judged.slice(0, 100).map((r) => ({ q: r.q, intent: r.intent, conf: r.conf, action: r.action, reply: r.reply, score: r.score })),
    sampleMisses: [],
  };
  try { fs.writeFileSync(path.join(DATA_DIR, "selftest_report.json"), JSON.stringify(report, null, 2), "utf8"); console.log(`\n📝 → dashboard/data/selftest_report.json (نمایش در /selftest)`); } catch {}
  console.log("");
}
main();
