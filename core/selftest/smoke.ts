/** Smoke test: proves the Claude key works and fixes the exact messages that broke before.
 *  Run: node core/selftest/smoke.ts   (loads .env via load-env, like the live connector). */
import "../load-env.ts"; // populates CLAUDE_API_KEY before config flags evaluate (same path the connector uses)
import { CLAUDE_REAL, CLAUDE_MODEL } from "../config.ts";
import { consultClaude } from "../agent/llm-brain.ts";

const CASES = [
  "نمیتونم بخش انلاین رو پلی بدم",   // the screenshot bug → was other_unclear 0.42
  "آموزش ثبت ای پی",                  // self-test miss → other_unclear
  "تا چند کاربر میشه؟",               // self-test miss → other_unclear
  "اندروید هم دارید یا فقط ویندوز؟",  // self-test miss → other_unclear
  "وسط بازی قطع و وصل میشم چیکار کنم", // a real-world phrasing
];

console.log(`Claude: ${CLAUDE_REAL ? "ON (" + CLAUDE_MODEL + ")" : "OFF — key not loaded!"}`);
if (!CLAUDE_REAL) process.exit(1);

for (const text of CASES) {
  const v = await consultClaude({ text, history: [], regexIntent: "other_unclear", regexConfidence: 0.42, userRecord: null, incident: null });
  if (!v) { console.log(`\n«${text}»\n  ✗ no verdict (api error)`); continue; }
  console.log(`\n«${text}»\n  → intent: ${v.intentId}  conf: ${v.confidence.toFixed(2)}  human: ${v.needsHuman}\n  reply: ${v.reply}`);
}
console.log("");
