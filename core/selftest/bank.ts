/**
 * Self-test question bank — built from the REAL 7-month export:
 *   - real QA pairs  (analysis/out/qa_by_intent.json) — real customer opener + real admin reply,
 *     coarse-labeled (13 buckets). Used for coverage/quality + coarse-agreement.
 *   - weighted openers (analysis/out/faq_openers.json) — the 300 most frequent first messages,
 *     with counts (so a metric can be weighted by how often it really happens).
 *   - synthetic labeled (taxonomy triggers) — exact FINE intent labels → fine-accuracy metric.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { intents } from "../data.ts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "..", "..", "analysis", "out");
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));

// our 27 fine intents → the 13 coarse buckets used by the export labeler (approximate; the
// coarse labels are themselves noisy, so coarse-agreement is a floor, not a ceiling).
export const FINE_TO_COARSE: Record<string, string> = {
  greeting_smalltalk: "other", gratitude_closing: "other", complaint_anger: "other",
  bot_telegram_issue: "other", abuse_profanity: "other", other_unclear: "other",
  presale_game_supported: "gaming", game_login_match_fail: "gaming",
  presale_trial_request: "buy_prepurchase", presale_pricing_plans: "buy_prepurchase", buy_how_to_purchase: "buy_prepurchase",
  ip_registration_howto: "ip_registration", ip_registration_failure: "ip_registration", ip_transfer_between_accounts: "ip_registration",
  conn_generic_not_working: "connection_problem",
  conn_console_setup: "platform_setup", conn_pc_setup: "platform_setup", conn_mobile_apn_setup: "platform_setup",
  speed_ping_packetloss: "speed_ping",
  outage_service_status: "server_region", outage_compensation_request: "subscription_status",
  sub_status_expiry: "subscription_status",
  payment_not_received: "payment_gateway", payment_gateway_error: "payment_gateway",
  refund_request: "refund",
  dns_concept_question: "dns_config", free_download_dns_request: "dns_config",
};

export interface RealItem { q: string; refReply: string; coarse: string; }
export interface SynthItem { q: string; expectFine: string; expectCoarse: string; }
export interface OpenerItem { q: string; count: number; }

export function loadRealPairs(): RealItem[] {
  const by = load("qa_by_intent.json").by_intent as Record<string, { pairs: { opener: string; reply: string }[] }>;
  const out: RealItem[] = [];
  for (const [coarse, g] of Object.entries(by)) {
    for (const p of g.pairs) {
      const q = (p.opener || "").trim();
      if (q.length >= 2 && q.length <= 400) out.push({ q, refReply: (p.reply || "").replace(/ ::$/, "").trim(), coarse });
    }
  }
  return out;
}

export function loadOpeners(): OpenerItem[] {
  const top = load("faq_openers.json").top as { norm: string; count: number; example?: string }[];
  return top.map((t) => ({ q: (t.example || t.norm).trim(), count: t.count })).filter((o) => o.q.length >= 1);
}

/** Synthetic, exactly-labeled bank from the taxonomy triggers (the only fine-accuracy ground truth). */
export function loadSynthetic(): SynthItem[] {
  const out: SynthItem[] = [];
  for (const i of intents) {
    for (const trg of i.triggers || []) {
      const q = String(trg).trim();
      if (q.length >= 2) out.push({ q, expectFine: i.id, expectCoarse: FINE_TO_COARSE[i.id] || "other" });
    }
  }
  return out;
}
