/**
 * End-to-end demo: run sample inbound messages through the whole 4.2 pipeline
 * (classify -> tools -> evidence -> policy-gate -> reply|escalate -> stub adapter),
 * then write results the dashboard reads. Run:  node run-demo.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessConnectionStubAdapter } from "./telegram/business-connection-adapter.stub.ts";
import { routeInbound } from "./telegram/message-router.ts";
import { createStore } from "./conversation/state-store.ts";
import type { Inbound } from "./agent/orchestrator.ts";
import { Tools } from "./tools/index.ts";
import { DATA_DIR } from "./data.ts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString();

const SAMPLES: Inbound[] = [
  { conversationId: "c-2001", receivedAt: iso(2), text: "سلام خسته نباشید 🙏",
    user: { name: "Omid", username: "@omid_ps", telegramId: 1715560318, userCode: "SH-44820" } },
  { conversationId: "c-2002", receivedAt: iso(4), text: "اشتراکم چند روز مونده؟ تمدید کنم تخفیف میخوره؟",
    user: { name: "Mina", username: "@mina_rd", telegramId: 7310326464, userCode: "SH-90551" } },
  { conversationId: "c-2003", receivedAt: iso(6), text: "رو ps5 دی ان اس زدم فعال نمیشه، ثبت ایپی هم کردم بازم وصل نمیشه",
    user: { name: "Salar", username: "@salar_g", telegramId: 597146499, userCode: "SH-88213" } },
  { conversationId: "c-2004", receivedAt: iso(8), text: "وارزون رو ساپورت میکنید؟ میخوام بخرم",
    user: { name: "Hadi", username: "@hadi_xb", telegramId: 7204970844, userCode: "SH-77310" } },
  { conversationId: "c-2005", receivedAt: iso(10), text: "پول از کارتم کم شد ولی اشتراکم فعال نشد، شناسه پرداخت دارم",
    user: { name: "Reza", username: "@reza_jh", telegramId: 771790477, userCode: "SH-71204" } },
  { conversationId: "c-2006", receivedAt: iso(12), text: "مرتیکه پولمو پس بدید آشغالا کلاهبردارین",
    user: { name: "کاربر", username: "@k_8842", telegramId: 8016799684, userCode: "SH-50012" } },
  { conversationId: "c-2007", receivedAt: iso(14), text: "پینگم رو fc25 خیلی بالاست، دی ان اس شما افتضاحه",
    user: { name: "Amir", username: "@amir_hh", telegramId: 124315718, userCode: "SH-65890" } },
  { conversationId: "c-2008", receivedAt: iso(16), text: "ثبت ایپی چجوریه؟ هر بار باید انجام بدم؟",
    user: { name: "Sina", username: "@sina_t", telegramId: 5985593054, userCode: "SH-33019" } },
  { conversationId: "c-2009", receivedAt: iso(18), text: "ربات درگاه پرداخت نمیده، موقع خرید ارور میده",
    user: { name: "Nima", username: "@nima_p", telegramId: 5577544185, userCode: "SH-21770" } },
  { conversationId: "c-2010", receivedAt: iso(20), text: "بله",
    user: { name: "Ali", username: "@ali_x", telegramId: 7282131414, userCode: "SH-10044" } },
];

const adapter = new BusinessConnectionStubAdapter();
Tools.clearEscalations();
const store = createStore(); // in-memory conversation state for the demo

const events = [];
const actionLog = [];
const toolCalls = [];
for (const s of SAMPLES) {
  const st = store.get(s.user.telegramId);
  const { event, log, state } = await routeInbound(adapter, s, { autoSend: true, state: st });
  if (state) store.set(s.user.telegramId, state);
  events.push({ ...event, delivered: log.delivered });
  actionLog.push({
    ...log,
    userName: event.user.name,
    username: event.user.username,
    faLabel: event.classification.faLabel,
    inbound: event.inbound,
  });
  for (const t of event.evidence.tools) {
    toolCalls.push({
      conversationId: event.conversationId,
      intentId: event.classification.intentId,
      faLabel: event.classification.faLabel,
      userName: event.user.name,
      ...t,
    });
  }
}

// ---- multi-turn thread (same user): shows greet-once + slot-filling + short one-question turns ----
const tu = { name: "Kian", username: "@kian_t", telegramId: 999000111, userCode: "SH-THREAD" };
const THREAD = ["سلام دی ان اس وصل نمیشه", "رو ps5 با ایرانسل بازی میکنم", "آیپیم 109.108.163.72"];
const threadEvents = [];
for (let i = 0; i < THREAD.length; i++) {
  const inb = { conversationId: "t-thread", receivedAt: iso(6 - i * 2), text: THREAD[i], user: tu };
  const st = store.get(tu.telegramId);
  const { event, log, state } = await routeInbound(adapter, inb, { autoSend: true, state: st });
  if (state) store.set(tu.telegramId, state);
  threadEvents.push({ ...event, delivered: log.delivered });
}
events.unshift(...threadEvents); // show the thread first

const escalations = Tools.getEscalations();
const write = (name: string, obj: any) =>
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(obj, null, 2), "utf8");

write("sim_conversations.json", { generatedAt: new Date().toISOString(), note: "core 4.2 pipeline output (stub tools)", events });
write("sim_escalations.json", { generatedAt: new Date().toISOString(), items: escalations });
write("sim_action_log.json", { generatedAt: new Date().toISOString(), items: actionLog });
write("sim_tool_calls.json", { generatedAt: new Date().toISOString(), items: toolCalls });

const by = (a: string) => events.filter((e) => e.decision.action === a).length;
console.log("=== 4.2 pipeline demo ===");
console.log(`processed: ${events.length}`);
console.log(`auto_send: ${by("auto_send")} | draft_for_review: ${by("draft_for_review")} | escalate_human: ${by("escalate_human")}`);
console.log(`stub messages sent on-behalf: ${adapter.sent.length}`);
console.log(`escalations queued: ${escalations.length}  ->  ${escalations.map((e) => e.intentId + ":" + e.routeTo).join(", ")}`);
console.log(`wrote sim_conversations.json + sim_escalations.json to dashboard/data`);
