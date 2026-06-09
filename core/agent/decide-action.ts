/** Extracts message features, then defers to the Policy-Gate for the action decision. */
import type { Classification, EvidenceRecord, PolicyDecision } from "../logs/schemas.ts";
import type { NamedToolResult } from "./build-evidence-record.ts";
import { policyGate } from "../policy/policy-gate.ts";
import type { MessageFeatures } from "../policy/policy-gate.ts";
import { FINANCIAL } from "../policy/escalation-rules.ts";

export function extractFeatures(
  cls: Classification,
  named: NamedToolResult[],
  unresolvedTurns: number
): MessageFeatures {
  const pay = named.find((x) => x.name === "get_payment_status")?.res;
  const user = named.find((x) => x.name === "get_user_profile")?.res;
  const dbMismatch = !!pay && pay.value.lastTxStatus === "success" && !pay.value.activatedInBot;
  return {
    profanity: cls.matchedTriggers.includes("abuse_profanity"),
    financialIntent: FINANCIAL.has(cls.intentId),
    dbMismatch,
    vip: !!user && user.value.vip,
    unresolvedTurns,
  };
}

export function decideAction(
  cls: Classification,
  evidence: EvidenceRecord,
  named: NamedToolResult[],
  unresolvedTurns = 0
): PolicyDecision {
  return policyGate(cls, evidence, extractFeatures(cls, named, unresolvedTurns));
}
