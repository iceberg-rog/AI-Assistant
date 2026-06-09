/**
 * Self-test harness — answers thousands of REAL questions and grades the result.
 *   node core/selftest/run.ts                 # baseline (regex path), synthetic+real banks
 *   CLAUDE_API_KEY=sk-... node core/selftest/run.ts --judge --limit 300
 *
 * SAFETY: does NOT load Shelter/.env, so the prod users-DB / IP endpoints stay OFF
 * (USERS_DB_REAL / IP_TOOL_REAL = false). Only CLAUDE_API_KEY (if you pass it) is read,
 * so the only network calls are to Claude — never to the production database.
 */
import fs from "node:fs";
import path from "node:path";
import { respondWithState } from "../conversation/respond.ts";
import { defaultState } from "../conversation/state-store.ts";
import { CLAUDE_REAL, CLAUDE_MODEL, CONF_FLOOR } from "../config.ts";
import { DATA_DIR } from "../data.ts";
import { loadRealPairs, loadSynthetic, loadOpeners, FINE_TO_COARSE } from "./bank.ts";
import { judgeReply } from "./judge.ts";

const ARG = (k: string, d?: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "1") : d;
};
const HAS = (k: string) => process.argv.includes(k);
const LIMIT = Number(ARG("--limit", "0")) || 0;
const JUDGE = HAS("--judge");
const JUDGE_N = Number(ARG("--judge-n", "40")) || 40;
const POOL = Number(ARG("--pool", CLAUDE_REAL ? "5" : "1")) || 1;

const FILLERS = [
  "ممنون 🙏 الان وضعیتت رو چک می‌کنم و راه‌حل می‌دم.",
  "ممنون 🙏 با همینا الان دقیق چک می‌کنم و راه‌حلو می‌دم ❤️",
  "ممنون 🙏 الان چک می‌کنم و راه‌حل می‌دم.",
];
const GREET = /^سلام عزیز/;

let _id = 1_000_000;
async function ask(q: string) {
  const telegramId = _id++;
  const inb = { conversationId: "selftest:" + telegramId, user: { name: "Test", telegramId, userCode: "SH-TEST" }, text: q, receivedAt: new Date().toISOString() };
  const { event } = await respondWithState(inb, defaultState(telegramId));
  return event;
}

async function pool<T, R>(items: T[], n: number, fn: (it: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

interface Row { q: string; fine: string; conf: number; action: string; claude: boolean; hasReply: boolean; deadEnd: boolean; reply: string; expectFine?: string; expectCoarse?: string; coarse?: string; refReply?: string; }

function bucket(c: number): string {
  if (c < 0.6) return "<0.60";
  if (c < CONF_FLOOR) return `0.60–${CONF_FLOOR}`;
  if (c < 0.85) return `${CONF_FLOOR}–0.85`;
  return "≥0.85";
}

async function evalOne(q: string, meta: Partial<Row>): Promise<Row> {
  const ev = await ask(q);
  const msgs: string[] = ev.reply?.messages || (ev.reply ? [ev.reply.text] : []);
  const substantive = msgs.filter((m) => !GREET.test(m));
  const deadEnd = substantive.length > 0 && substantive.every((m) => FILLERS.includes(m));
  return {
    q, fine: ev.classification.intentId, conf: ev.classification.confidence, action: ev.decision.action,
    claude: (ev.evidence.tools || []).some((t: any) => t.name === "claude_review"),
    hasReply: !!ev.reply, deadEnd, reply: msgs.join(" / "), ...meta,
  };
}

function pct(a: number, b: number) { return b ? ((100 * a) / b).toFixed(1) + "%" : "—"; }

async function main() {
  console.log(`\n🧪 Shelter self-test — Claude ${CLAUDE_REAL ? "ON (" + CLAUDE_MODEL + ")" : "OFF (regex baseline)"} · floor ${CONF_FLOOR}\n`);

  let synth = loadSynthetic();
  let real = loadRealPairs();
  const openers = HAS("--openers") ? loadOpeners() : [];
  if (LIMIT) { synth = synth.slice(0, LIMIT); real = real.slice(0, LIMIT); }
  console.log(`bank: ${synth.length} synthetic(labeled) · ${real.length} real-pairs · ${openers.length} openers\n`);

  // 1) SYNTHETIC — fine-intent accuracy (the only exact ground truth)
  const sRows = await pool(synth, POOL, (it) => evalOne(it.q, { expectFine: it.expectFine, expectCoarse: it.expectCoarse }));
  const sFine = sRows.filter((r) => r.fine === r.expectFine).length;
  const sCoarse = sRows.filter((r) => (FINE_TO_COARSE[r.fine] || "other") === r.expectCoarse).length;

  // 2) REAL — coverage / distributions (+ optional quality judge)
  const rRows = await pool(real, POOL, (it) => evalOne(it.q, { coarse: it.coarse, refReply: it.refReply }));
  const rCoarse = rRows.filter((r) => (FINE_TO_COARSE[r.fine] || "other") === r.coarse).length;

  const all = [...sRows, ...rRows];
  const unclear = all.filter((r) => r.fine === "other_unclear").length;
  const claudeN = all.filter((r) => r.claude).length;
  const deadN = all.filter((r) => r.deadEnd).length;
  const escal = all.filter((r) => r.action === "escalate_human").length;
  const confDist: Record<string, number> = {}; for (const r of all) confDist[bucket(r.conf)] = (confDist[bucket(r.conf)] || 0) + 1;
  const actDist: Record<string, number> = {}; for (const r of all) actDist[r.action] = (actDist[r.action] || 0) + 1;

  console.log("── ACCURACY (synthetic, labeled) ────────────────");
  console.log(`  fine-intent correct:   ${pct(sFine, sRows.length)}  (${sFine}/${sRows.length})`);
  console.log(`  coarse-bucket correct: ${pct(sCoarse, sRows.length)}`);
  console.log("\n── AGREEMENT (real pairs, noisy coarse labels) ──");
  console.log(`  coarse agreement:      ${pct(rCoarse, rRows.length)}  (floor — labels are noisy)`);
  console.log("\n── COVERAGE / HEALTH (all " + all.length + ") ─────────────");
  console.log(`  other_unclear:         ${pct(unclear, all.length)}`);
  console.log(`  dead-end fillers:      ${pct(deadN, all.length)}  ← must trend to ~0`);
  console.log(`  Claude consulted:      ${pct(claudeN, all.length)}  (the <${CONF_FLOOR} tail)`);
  console.log(`  escalated to human:    ${pct(escal, all.length)}`);
  console.log("  confidence:           ", Object.entries(confDist).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log("  action:               ", Object.entries(actDist).map(([k, v]) => `${k}:${v}`).join("  "));

  // worst fine misses (synthetic)
  const misses = sRows.filter((r) => r.fine !== r.expectFine).slice(0, 12);
  if (misses.length) {
    console.log("\n── sample fine misses ───────────────────────────");
    for (const m of misses) console.log(`  "${m.q.slice(0, 38)}"  → ${m.fine} (want ${m.expectFine}) c${m.conf.toFixed(2)}`);
  }

  // 3) QUALITY JUDGE (Claude) — on a sample of real pairs that produced a reply
  let judge: any = null;
  if (JUDGE) {
    if (!CLAUDE_REAL) { console.log("\n⚠ --judge needs CLAUDE_API_KEY; skipping quality scoring."); }
    else {
      const sample = rRows.filter((r) => r.hasReply && r.reply).slice(0, JUDGE_N);
      const judged = await pool(sample, POOL, async (r) => ({ r, j: await judgeReply(r.q, r.reply, r.refReply || "") }));
      const ok = judged.filter((x) => x.j);
      const avg = ok.length ? ok.reduce((s, x) => s + x.j!.score, 0) / ok.length : 0;
      const okRate = ok.length ? ok.filter((x) => x.j!.ok).length / ok.length : 0;
      const worst = ok.filter((x) => x.j!.score <= 2).slice(0, 8).map((x) => ({ q: x.r.q.slice(0, 50), reply: x.r.reply.slice(0, 60), score: x.j!.score, issue: x.j!.issue }));
      judge = { n: ok.length, avgScore: Number(avg.toFixed(2)), okRate: Number((okRate * 100).toFixed(1)), worst };
      console.log("\n── QUALITY (Claude judge, " + ok.length + " sampled) ─────");
      console.log(`  avg score (1–5):       ${judge.avgScore}`);
      console.log(`  acceptable (≥4):       ${judge.okRate}%`);
      for (const w of worst) console.log(`  ✗ ${w.score} "${w.q}" → "${w.reply}" — ${w.issue}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(), claude: CLAUDE_REAL, model: CLAUDE_REAL ? CLAUDE_MODEL : null, floor: CONF_FLOOR,
    bank: { synthetic: sRows.length, real: rRows.length },
    accuracy: { fine: sFine / (sRows.length || 1), coarseSynth: sCoarse / (sRows.length || 1), coarseRealAgree: rCoarse / (rRows.length || 1) },
    health: { otherUnclearRate: unclear / all.length, deadEndRate: deadN / all.length, claudeRate: claudeN / all.length, escalateRate: escal / all.length },
    confidenceDist: confDist, actionDist: actDist, judge,
    sampleMisses: misses.map((m) => ({ q: m.q, got: m.fine, want: m.expectFine, conf: m.conf })),
  };
  try { fs.writeFileSync(path.join(DATA_DIR, "selftest_report.json"), JSON.stringify(report, null, 2), "utf8"); console.log(`\n📝 report → dashboard/data/selftest_report.json`); } catch {}
  console.log("");
}

main();
