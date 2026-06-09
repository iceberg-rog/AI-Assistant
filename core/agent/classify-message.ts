/**
 * Intent classifier — same real triggers used to bucket the 40k chats (extract3),
 * ported to JS. Cheap, deterministic router; the LLM never invents the intent.
 */
import type { Classification } from "../logs/schemas.ts";
import { intentById } from "../data.ts";
import { tierOf } from "../policy/intent-tier-map.ts";

const ZWNJ = "‌";
export function norm(s: string): string {
  if (!s) return "";
  s = s.replace(/[يى]/g, "ی").replace(/ك/g, "ک");
  s = s.replace(/[ً-ْـ]/g, "");
  s = s.split(ZWNJ).join(" ");
  s = s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const FINE: Record<string, RegExp> = {
  presale_game_supported: /بازی.*(جواب|ساپورت|رفع فیلتر|هست)|(جواب میده|ساپورت میکن|رفع فیلتر).*بازی|fc ?2[0-9]|پابجی|pubg|وارزون|warzone|battlefield|ساپورت میکن|جوابگو|کالاف|فیفا/,
  presale_trial_request: /تست (دار|میخوا|بدید|بده|فعال|کوتاه|کن)|قبل خرید تست|اشتراک تست|تست رایگان/,
  presale_pricing_plans: /قیمت|چنده|چند هست|پلن.*کاربر|دو کاربر|تخفیف|همزمان رو|چند ماهه|تعرفه|کد تخفیف/,
  buy_how_to_purchase: /میخوام (اشتراک|بخرم|بگیرم|دی ?ان ?اس)|از کجا (بخرم|بگیرم|بخرم)|چجوری.*(بخرم|خرید)|چطوری? .*(بخرم|خرید)|نحوه خرید|برای خرید|واسه خرید|خرید.*dns|دی ان اس بخرم|ربات.*خرید|میخواستم.*بخرم|خرید کنم|چطور بخرم|میخوام بخرم/,
  ip_registration_howto: /ثبت ای ?پی چجوری|مراحل ثبت|اموزش ثبت|چجوری ثبت|هربار.*ثبت ای|ثبت ای ?پی.*چی|چطور ثبت ای/,
  ip_registration_failure: /(ثبت ای ?پی).*(نمیشه|نمیکنه|کار نمیکنه|ارور|نمیزنه)|نمیشه.*ثبت ای|توکن منقضی|لینک ثبت.*باز نمیشه|ثبت ای ?پی برام کار نمیکنه|فیلترشکن روشنه/,
  ip_transfer_between_accounts: /منتقل|انتقال|مبدا و مقصد|رو شماره (خودم|اونه|دیگه)|بیارینش رو شماره|اکانت رو منتقل|شماره عوض/,
  conn_generic_not_working: /^وصل نمیشه|^کار نمیکنه|dns وصل نمیشه|هیچ کدوم.*وصل|چرا وصل نمیشه|اصلا (کار نمیکنه|وصل نمیشه)|وصل نمیشه$/,
  conn_console_setup: /(پی اس|ps ?[45]|psn|ایکس باکس|xbox|کنسول).*(ارور|وصل|fail|نمیشه|کار)|internet connection failed|ارور ریجن|nat ?type|نت تایپ/,
  conn_pc_setup: /(پی سی|\bpc\b|کامپیوتر|لپ تاپ|ویندوز|لانچر|بتل نت|اپیک|battle ?net|epic).*(باز نمیشه|ارور|وصل|نمیشه|بزنم)|secure boot|dns.*رو.*pc|رو.*سیستم.*dns/,
  conn_mobile_apn_setup: /هات اسپات|hotspot|\bapn\b|اپ ?ان|dns مخصوص موبایل|dns changer|موبایل.*(نمیاره|بازی)|گوشی (ایفون|اندروید).*(ps|کنسول)/,
  game_login_match_fail: /مچ ?میکینگ|مچ ?میکنگ|لاگین|login|لابی|lobby|ultimate team|وارد (مچ|بازی|لابی).*نمیشه|verification|وارد منو میشه ولی|مچ نمیشه/,
  speed_ping_packetloss: /پینگ|ping|سرعت|پکت|packet|\blag\b|لگ|قطع و وصل|وسط بازی قطع|دیلی|delay|پک لاس|کند/,
  outage_service_status: /(شلتر|سرور|سرورا|سروری|دی ?ان ?اس).*(کار میکنه|مشکل|قطع|رفته|سوخته|اوکی|برمیگرده)|سرورا مشکل|سرور هامون|قطعی سراسری|الان کار میکنه/,
  sub_status_expiry: /منقضی|چند روز.*مونده|پلنی نداری|اشتراکم.*نشون|زمان باقی|تاریخ انقضا|باقی مانده|اشتراکم چند|چقدر مونده|تمدید کنم/,
  outage_compensation_request: /جبران|روزای از دست رفته|اشتراک سوخته|فریز|اضافه شد ولی نشده|روز اضافه|تمدید نشده جبران|روزای قطعی/,
  payment_not_received: /(پول|واریز|پرداخت|مبلغ).*(کم شد|برنگشت|نرسید|کسر|برداشت|زدم)|پرداخت کردم.*(نفرستاد|نشد)|اشتراک فعال نشده|دوبار (خرید|کسر)|شارژ نشد|پول کم شد/,
  payment_gateway_error: /درگاه.*(نمیده|ارور|باگ|کار نمیکنه|پرداخت نمیده|نمیاد)|موقع پرداخت ارور|نمیزاره بخرم|صفحه.*پرداخت.*ارور|درگاه پرداخت/,
  refund_request: /پولم ?و? ?(پس|عودت|برگردون|مرجوع)|پس بدید|عودت وجه|مرجوع|کنسل.*وجه|پولمو خوردین|راضی نیستم پولمو|پولم رو پس/,
  complaint_anger: /چه وضعشه|افتضاح|اصلا خوب نیست|یبارم وصل نشده|چه پشتیبانیه|مسخره|چه وضعه|ریدین|خسته شدم|کلافه/,
  dns_concept_question: /فرق dns|dns.*چیه|برنامه نویسان چه فرق|توربو چیه|ای ?پی ثابت|ipv4|دامنه|سرویستون.*چطور|دقیقا چطور وصل|دی ?ان ?اس چیه/,
  free_download_dns_request: /رایگان|مجانی|مفت|dns.*دانلود|دانلود.*dns|بهترین dns برای دانلود|دی ان اس رایگان/,
  bot_telegram_issue: /ربات.*(کار نمیکنه|بسته|باز نمیشه|ارسال نمیشه|نمیده)|پیجتون|لینک خرید.*ارسال نمیشه|ربات شلتر بسته|پیج.*تعطیل|ربات باز نمیشه/,
  // security/data threat: user CLAIMS or THREATENS to dump/leak/hack/ddos/back-up Shelter's DB/servers.
  // Conservative on purpose — benign questions like «بکاپ می‌گیرید؟» must NOT match (no verb/target).
  security_threat: /هکتون|هک می ?کنم|هکت کردم|دیداس|\bddos\b|دامپ گرفتم|دامپ کردم|نفوذ کردم|دیتابیستون.*(دارم|دستمه|هک|دامپ|لو|بکاپ گرفتم|گرفتم|دزدیدم)|(دیتابیس|سرور).*شلتر.*(بکاپ|دامپ|هک|نفوذ|دانلود کردم)|بکاپ.*دیتابیس.*شلتر|سرورتونو? ?(داون|down|هک)|لو می ?دم/,
};
const GREET = /^سلام|^درود|وقت بخیر|خسته نباشید|عرض ادب|^های$|^سلام$/;
const GRAT = /ممنون|مرسی|تشکر|دمت گرم|لطف کرد|خداقوت|دستت درد نکنه/;
export const PROFANITY = /کیر|کص|کس کش|کسکش|جنده|کونی|حروم|ریدم|گه خور|مادرت|ناموس|بیشرف|بی شرف|اشغال|عوضی|گوه|کلاهبردار|دزد/;

// pleasantry tokens — stripped to see if a "greeting" actually carries a real question underneath.
const SMALLTALK = /سلام|درود|وقت ?بخیر|وقتتون بخیر|صبح بخیر|شب بخیر|خسته نباشید|عرض ادب|های|hi|hello|hey|ممنون|مرسی|تشکر|دمت گرم|خداقوت|دستت درد نکنه|لطف کرد|خوبی|چطوری|داداش|عزیز|گلم|جان|قربانت|سپاس/g;
function carriesRealQuestion(n: string): boolean {
  const rest = n.replace(SMALLTALK, " ").replace(/[\s،.!?؟…:؛()\-]+/g, " ").trim();
  return rest.length > 10; // a greeting + a few real words = an actual question the regex missed
}

// primary-selection priority (most consequential first)
const PRIORITY = [
  "security_threat", "abuse_profanity", "refund_request", "payment_not_received", "ip_transfer_between_accounts",
  "payment_gateway_error", "outage_compensation_request", "ip_registration_failure",
  "conn_console_setup", "conn_pc_setup", "conn_mobile_apn_setup", "game_login_match_fail",
  "speed_ping_packetloss", "outage_service_status", "sub_status_expiry", "bot_telegram_issue",
  "conn_generic_not_working", "ip_registration_howto", "dns_concept_question",
  "free_download_dns_request", "presale_game_supported", "presale_trial_request",
  "presale_pricing_plans", "buy_how_to_purchase", "complaint_anger",
  "greeting_smalltalk", "gratitude_closing", "other_unclear",
];

export function classify(text: string): Classification {
  const n = norm(text);
  const matched: string[] = [];
  for (const [id, rx] of Object.entries(FINE)) if (rx.test(n)) matched.push(id);
  if (PROFANITY.test(n)) matched.push("abuse_profanity");
  if (!matched.length) {
    if (GRAT.test(n)) matched.push("gratitude_closing");
    else if (GREET.test(n)) matched.push("greeting_smalltalk");
    else matched.push("other_unclear");
  }
  let primary = PRIORITY.find((p) => matched.includes(p)) || matched[0];

  // a greeting/thanks that actually carries a real (regex-unrecognized) question → don't answer it
  // as smalltalk; demote to other_unclear so the LLM brain reads the whole message.
  if ((primary === "greeting_smalltalk" || primary === "gratitude_closing") && carriesRealQuestion(n)) {
    primary = "other_unclear";
  }

  let confidence: number;
  if (primary === "security_threat" || primary === "abuse_profanity" || primary === "refund_request" || primary === "payment_not_received") confidence = 0.9;
  else if (primary === "greeting_smalltalk" || primary === "gratitude_closing") confidence = 0.95;
  else if (primary === "other_unclear") confidence = 0.42;
  else if (matched.length === 1) confidence = 0.85;
  else if (matched.length <= 3) confidence = 0.72;
  else confidence = 0.6;

  return {
    intentId: primary,
    faLabel: intentById.get(primary)?.fa_label || primary,
    tier: tierOf(primary),
    confidence,
    matchedTriggers: matched,
  };
}
