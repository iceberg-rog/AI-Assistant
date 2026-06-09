/** Full-pipeline smoke (classify → manager → Claude → policy recompute), DB off for safety.
 *  Run: CLAUDE_API_KEY=... node core/selftest/smoke-pipeline.ts  (does NOT load .env / prod DB). */
import { respondWithState } from "../conversation/respond.ts";
import { defaultState } from "../conversation/state-store.ts";
import { CLAUDE_REAL, CLAUDE_MODEL } from "../config.ts";

const CASES: [string, string][] = [
  ["نمیتونم بخش انلاین رو پلی بدم", "screenshot bug (was other_unclear)"],
  ["تا چند کاربر میشه؟", "self-test miss"],
  ["اندروید هم دارید یا فقط ویندوز؟", "self-test miss"],
  ["پولمو پس بدید راضی نیستم", "should escalate early (refund)"],
  ["سلام وقت بخیر", "pure greeting (fast path, no Claude)"],
];

console.log(`Claude: ${CLAUDE_REAL ? "ON (" + CLAUDE_MODEL + ")" : "OFF"}\n`);
let id = 2_000_000;
for (const [q, label] of CASES) {
  const tid = id++;
  const inb = { conversationId: "v:" + tid, user: { name: "T", telegramId: tid, userCode: "SH-T" }, text: q, receivedAt: new Date().toISOString() };
  const { event } = await respondWithState(inb, defaultState(tid));
  const claude = (event.evidence.tools || []).some((t: any) => t.name === "claude_review");
  console.log(`[${label}]  «${q}»`);
  console.log(`  intent=${event.classification.intentId} conf=${event.classification.confidence.toFixed(2)} action=${event.decision.action} claude=${claude}`);
  console.log(`  ${event.reply ? "reply: " + event.reply.text.replace(/\n/g, " / ") : "ESCALATED → " + (event.escalated?.routeTo || "?")}\n`);
}
