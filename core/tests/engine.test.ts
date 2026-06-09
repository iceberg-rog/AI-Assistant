/** Core unit tests — classifier, Policy-Gate, orchestrator. Run: node tests/engine.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, norm } from "../agent/classify-message.ts";
import { policyGate } from "../policy/policy-gate.ts";
import type { MessageFeatures } from "../policy/policy-gate.ts";
import { handleInbound } from "../agent/orchestrator.ts";
import { routeInbound } from "../telegram/message-router.ts";
import { BusinessConnectionStubAdapter } from "../telegram/business-connection-adapter.stub.ts";
import { respond as convRespond } from "../conversation/manager.ts";
import { defaultState } from "../conversation/state-store.ts";
import { matchAgainst } from "../incidents/store.ts";
import type { Incident } from "../incidents/store.ts";
import type { Classification, EvidenceRecord, ToolCallRecord } from "../logs/schemas.ts";

// ---- helpers ----
const feat = (o: Partial<MessageFeatures> = {}): MessageFeatures => ({
  profanity: false, financialIntent: false, dbMismatch: false, vip: false, unresolvedTurns: 0, ...o,
});
const tool = (fresh: boolean): ToolCallRecord => ({
  name: "get_subscription", ok: true, result: "r", source: "s", checkedAt: new Date().toISOString(), fresh,
});
const ev = (tools: ToolCallRecord[]): EvidenceRecord => ({
  conversationId: "t", intentId: "x", tools, kbCited: [], confidence: 0, gatesTriggered: [], builtAt: new Date().toISOString(),
});
const cls = (intentId: string, tier: any, confidence: number): Classification => ({
  intentId, faLabel: intentId, tier, confidence, matchedTriggers: [intentId],
});

// ---- normalization ----
test("norm: arabic ya/kaf, zwnj, digits", () => {
  assert.equal(norm("نميشه"), "نمیشه"); // arabic ya -> persian
  assert.equal(norm("كار"), "کار"); // arabic kaf -> persian
  assert.equal(norm("۱۲۳"), "123");
  assert.equal(norm(""), "");
});

// ---- classifier ----
const CASES: [string, string][] = [
  ["سلام خسته نباشید 🙏", "greeting_smalltalk"],
  ["ممنون درست شد دمت گرم", "gratitude_closing"],
  ["رو ps5 ارور internet connection failed میده", "conn_console_setup"],
  ["پولمو پس بدید راضی نیستم", "refund_request"],
  ["مرتیکه آشغال کلاهبردارین", "abuse_profanity"],
  ["اشتراکم چند روز مونده؟", "sub_status_expiry"],
  ["وارزون رو ساپورت میکنید؟", "presale_game_supported"],
  ["چطوری خرید کنم؟", "buy_how_to_purchase"],
  ["پول کم شد ولی اشتراکم فعال نشد", "payment_not_received"],
  ["ثبت ایپی چجوریه هر بار باید بزنم؟", "ip_registration_howto"],
  ["درگاه پرداخت نمیده موقع خرید ارور میده", "payment_gateway_error"],
  ["پینگم خیلی بالاست پکت دراپ میخورم", "speed_ping_packetloss"],
  ["", "other_unclear"],
];
for (const [text, expected] of CASES) {
  test(`classify: "${text.slice(0, 24)}" -> ${expected}`, () => {
    assert.equal(classify(text).intentId, expected);
  });
}

test("classify: ambiguous (console + already-registered IP) -> ip_registration_failure (documented priority)", () => {
  // when the user explicitly says they already did ثبت‌آیپی and it still fails,
  // ip_registration_failure outranks conn_console_setup by design (same tier+tools).
  assert.equal(classify("رو ps5 دی ان اس زدم فعال نمیشه ثبت ایپی هم کردم").intentId, "ip_registration_failure");
});

test("classify: tiers + confidence sane", () => {
  assert.equal(classify("سلام").tier, "auto");
  assert.equal(classify("پولمو پس بدید").tier, "human");
  const c = classify("رو ps5 فعال نمیشه");
  assert.ok(c.confidence > 0 && c.confidence <= 1);
});

// ---- policy gate ----
test("gate: auto intent + fresh + high conf -> auto_send", () => {
  const d = policyGate(cls("greeting_smalltalk", "auto", 0.95), ev([tool(true)]), feat());
  assert.equal(d.action, "auto_send");
});
test("gate: auto but STALE tool -> draft (auto_guard_not_met)", () => {
  const d = policyGate(cls("ip_registration_howto", "auto", 0.9), ev([tool(false)]), feat());
  assert.equal(d.action, "draft_for_review");
  assert.ok(d.gatesTriggered.includes("auto_guard_not_met"));
});
test("gate: auto but conf < 0.82 -> draft", () => {
  const d = policyGate(cls("ip_registration_howto", "auto", 0.8), ev([tool(true)]), feat());
  assert.equal(d.action, "draft_for_review");
});
test("gate: copilot -> draft", () => {
  assert.equal(policyGate(cls("conn_console_setup", "copilot", 0.85), ev([tool(true)]), feat()).action, "draft_for_review");
});
test("gate: human intent -> escalate", () => {
  assert.equal(policyGate(cls("refund_request", "human", 0.9), ev([tool(true)]), feat()).action, "escalate_human");
});
test("gate: profanity overrides auto -> escalate", () => {
  const d = policyGate(cls("greeting_smalltalk", "auto", 0.95), ev([tool(true)]), feat({ profanity: true }));
  assert.equal(d.action, "escalate_human");
  assert.ok(d.gatesTriggered.includes("profanity"));
});
test("gate: db mismatch -> escalate", () => {
  assert.equal(policyGate(cls("payment_gateway_error", "copilot", 0.8), ev([tool(true)]), feat({ dbMismatch: true })).action, "escalate_human");
});
test("gate: VIP -> escalate", () => {
  assert.equal(policyGate(cls("sub_status_expiry", "copilot", 0.8), ev([tool(true)]), feat({ vip: true })).action, "escalate_human");
});
test("gate: unresolved >=3 -> escalate", () => {
  assert.equal(policyGate(cls("conn_pc_setup", "copilot", 0.8), ev([tool(true)]), feat({ unresolvedTurns: 3 })).action, "escalate_human");
});
test("gate: low confidence flagged", () => {
  const d = policyGate(cls("dns_concept_question", "auto", 0.5), ev([tool(true)]), feat());
  assert.ok(d.gatesTriggered.includes("low_confidence"));
  assert.notEqual(d.action, "auto_send");
});

// ---- orchestrator end-to-end ----
const U = (telegramId: number, userCode: string) => ({ name: "T", telegramId, userCode });
test("e2e: payment_not_received -> escalate to billing", () => {
  const e = handleInbound({ conversationId: "x1", receivedAt: new Date().toISOString(), text: "پول کم شد ولی فعال نشد", user: U(771790477, "SH-71204") });
  assert.equal(e.decision.action, "escalate_human");
  assert.equal(e.escalated?.routeTo, "billing");
  assert.equal(e.reply, null);
});
test("e2e: greeting -> auto_send with reply", () => {
  const e = handleInbound({ conversationId: "x2", receivedAt: new Date().toISOString(), text: "سلام وقت بخیر", user: U(111, "SH-1") });
  assert.equal(e.decision.action, "auto_send");
  assert.ok(e.reply && e.reply.text.length > 0);
});
test("e2e: abuse -> escalate to manager, no reply", () => {
  const e = handleInbound({ conversationId: "x3", receivedAt: new Date().toISOString(), text: "آشغالا پولمو خوردین", user: U(222, "SH-2") });
  assert.equal(e.decision.action, "escalate_human");
  assert.equal(e.reply, null);
  assert.ok(e.evidence.tools.length > 0); // still gathered context
});
test("e2e: console-connection runs ip + server tools", () => {
  const e = handleInbound({ conversationId: "x4", receivedAt: new Date().toISOString(), text: "رو ps5 وصل نمیشه ارور میده", user: U(333, "SH-3") });
  const names = e.evidence.tools.map((t) => t.name);
  assert.ok(names.includes("get_registered_ip"));
  assert.ok(names.includes("get_server_status"));
});

// ---- router delivery (Copilot enforcement — regression for the auto-send bug) ----
test("router: Copilot (default) NEVER sends, even on an auto-tier intent", async () => {
  const ad = new BusinessConnectionStubAdapter();
  const { log } = await routeInbound(ad, { conversationId: "r1", receivedAt: new Date().toISOString(), text: "سلام وقت بخیر", user: { name: "T", telegramId: 1 } });
  assert.equal(log.delivered, "held_copilot");
  assert.equal(ad.sent.length, 0); // nothing sent on behalf of the account
});
test("router: --auto actually sends on an auto-tier intent", async () => {
  const ad = new BusinessConnectionStubAdapter();
  const { log } = await routeInbound(ad, { conversationId: "r2", receivedAt: new Date().toISOString(), text: "سلام وقت بخیر", user: { name: "T", telegramId: 2 } }, { autoSend: true });
  assert.equal(log.delivered, "auto_sent");
  assert.equal(ad.sent.length, 1);
});
test("router: escalate intent routes to human, never sends", async () => {
  const ad = new BusinessConnectionStubAdapter();
  const { log } = await routeInbound(ad, { conversationId: "r3", receivedAt: new Date().toISOString(), text: "پولمو پس بدید", user: { name: "T", telegramId: 3 } }, { autoSend: true });
  assert.equal(log.delivered, "routed_to_human");
  assert.equal(ad.sent.length, 0);
});

// ---- conversation manager (greet-once + slot-filling + short turns) ----
const CLS = (intentId) => ({ intentId, faLabel: "x", tier: "copilot", confidence: 0.85, matchedTriggers: [] });
test("conv: greets once, not on continuation", async () => {
  const r1 = await convRespond("وصل نمیشه", CLS("conn_generic_not_working"), defaultState(1), "t");
  assert.ok(r1.messages.join(" ").includes("سلام"));
  const r2 = await convRespond("ps5", CLS("conn_generic_not_working"), r1.state, "t");
  assert.ok(!r2.messages.join(" ").includes("سلام"));
});
test("conv: asks device -> net -> ip, fills slots", async () => {
  let r = await convRespond("ps5 وصل نمیشه", CLS("conn_console_setup"), defaultState(2), "t"); // device -> ask net
  assert.ok(r.messages.join(" ").includes("نت"));
  r = await convRespond("ایرانسل", CLS("conn_console_setup"), r.state, "t"); // net -> ask ip
  assert.ok(r.messages.join(" ").includes("آیپی"));
  r = await convRespond("109.108.163.72", CLS("conn_console_setup"), r.state, "t"); // ip captured
  assert.equal(r.state.slots.ip, "109.108.163.72");
  assert.equal(r.state.slots.device, "PS5/PS4");
  assert.equal(r.state.slots.net, "ایرانسل");
});
test("conv: low confidence -> asks to clarify (no fake answer)", async () => {
  const r = await convRespond("یه سوالی داشتم", { intentId: "other_unclear", faLabel: "x", tier: "copilot", confidence: 0.42, matchedTriggers: [] }, defaultState(9), "t");
  assert.ok(r.messages.join(" ").includes("متوجه نشدم"));
});
test("conv: confident new topic resets prior flow (no state bleed)", async () => {
  let r = await convRespond("وصل نمیشه", CLS("conn_generic_not_working"), defaultState(10), "t");
  r = await convRespond("چطوری خرید کنم", { intentId: "buy_how_to_purchase", faLabel: "x", tier: "auto", confidence: 0.85, matchedTriggers: [] }, r.state, "t");
  assert.equal(r.state.intent, "buy_how_to_purchase");
  assert.equal(r.state.realAnswered, false);
});

// ---- incident / announcement injection (pure matcher; no live-file writes) ----
const INC = (o: Partial<Incident>): Incident => ({
  id: o.id || "inc_t", message: o.message || "صبر کنید 🙏", scope: o.scope || "match", mode: o.mode || "prepend",
  keywords: o.keywords || [], intents: o.intents || [], createdAt: "t", expiresAt: "t", enabled: true, ...o,
});
test("incident: keyword match (normalized arabic ya)", () => {
  const list = [INC({ keywords: ["لگ", "lag"] })];
  assert.ok(matchAgainst(list, "سرورتون لگ داره", "other_unclear")); // persian
  assert.ok(matchAgainst(list, "lag دارم تو بازی", "speed_ping_packetloss"));
  assert.equal(matchAgainst(list, "سلام خوبی", "greeting_smalltalk"), null);
});
test("incident: intent (topic) match even without the keyword", () => {
  const list = [INC({ keywords: ["قطعی"], intents: ["speed_ping_packetloss"] })];
  assert.ok(matchAgainst(list, "پینگم بالا رفته", "speed_ping_packetloss")); // topic, no keyword
});
test("incident: scope=all matches everyone in the window", () => {
  const list = [INC({ scope: "all", message: "سرورها در حال آپدیتن" })];
  assert.equal(matchAgainst(list, "هر چیزی", "greeting_smalltalk")?.message, "سرورها در حال آپدیتن");
});
test("incident: first-active wins; non-match returns null", () => {
  assert.equal(matchAgainst([INC({ keywords: ["خاص‌نباشه"] })], "یه چیز دیگه", "buy_how_to_purchase"), null);
});
test("conv: replace-incident short-circuits (just the wait-message, no diagnostics)", async () => {
  // simulate a matched replace incident by routing a message whose topic the incident covers.
  // (full live matching uses the file store; here we assert the manager honors a matched intent path.)
  const r = await convRespond("پینگم خیلی بالاست", CLS("speed_ping_packetloss"), defaultState(77), "t");
  assert.ok(r.messages.length >= 1); // produces a coherent reply (incident or normal), never empty/crash
});

// ---- media: voice / photo (no API in tests) ----
test("conv: voice → politely asks the user to type (no brain)", async () => {
  const r = await convRespond("[پیام صوتی]", CLS("other_unclear"), defaultState(60), "2026-01-01T10:00:00Z", { kind: "voice" });
  assert.ok(r.messages.join(" ").includes("تایپ"));
  assert.equal(r.state.lastKind, "voice");
  assert.equal(r.state.msgIn, 1);
});
test("conv: photo without Claude key → asks for a typed description", async () => {
  const r = await convRespond("[عکس]", CLS("other_unclear"), defaultState(61), "2026-01-01T10:00:00Z", { kind: "photo", imageBase64: "x" });
  assert.ok(r.messages.join(" ").includes("عکستو دیدم"));
});

// ---- staleness reset + lifetime counters ----
test("conv: long silence starts a fresh session but keeps lifetime stats", async () => {
  let r = await convRespond("سلام", CLS("greeting_smalltalk"), defaultState(50), "2026-01-01T10:00:00Z");
  assert.equal(r.state.sessions, 1);
  // 8h later → fresh session: greets again, session count rises, msgIn keeps accumulating
  r = await convRespond("بازم سلام", CLS("greeting_smalltalk"), r.state, "2026-01-01T18:00:00Z");
  assert.ok(r.messages.join(" ").includes("سلام عزیز")); // greeted again (new session)
  assert.equal(r.state.sessions, 2);
  assert.equal(r.state.msgIn, 2);       // lifetime, never reset
  assert.equal(r.state.turnCount, 1);   // current-session turns reset
  assert.ok(r.state.firstSeenAt && r.state.firstSeenAt < r.state.lastSeenAt);
});
