/**
 * Policy-Gate (ADR-6): the single chokepoint before any outbound message.
 * Maps (classification + evidence + features) -> a PolicyDecision. Explicit, auditable.
 */
import type { ActionKind, Classification, EvidenceRecord, PolicyDecision, Tier } from "../logs/schemas.ts";
import { HUMAN_FORCE, AUTO_CONFIDENCE, LOW_CONFIDENCE } from "./escalation-rules.ts";

export interface MessageFeatures {
  profanity: boolean;
  financialIntent: boolean;
  dbMismatch: boolean;
  vip: boolean;
  unresolvedTurns: number;
}

const RANK: Record<ActionKind, number> = { auto_send: 0, draft_for_review: 1, escalate_human: 2 };
const raise = (a: ActionKind, b: ActionKind): ActionKind => (RANK[b] > RANK[a] ? b : a);
const baseFromTier = (t: Tier): ActionKind =>
  t === "auto" ? "auto_send" : t === "human" ? "escalate_human" : "draft_for_review";

export function policyGate(
  cls: Classification,
  evidence: EvidenceRecord,
  features: MessageFeatures
): PolicyDecision {
  let action = baseFromTier(cls.tier);
  const gates: string[] = [];
  const reasons: string[] = [`tier پایه: ${cls.tier}`];

  if (HUMAN_FORCE.has(cls.intentId)) {
    action = raise(action, "escalate_human");
    gates.push("intent_requires_human");
    reasons.push("نیت نیازمند انسان (مالی/انتقال/توهین)");
  }
  if (cls.intentId === "security_threat") {
    action = raise(action, "escalate_human");
    gates.push("security_threat");
    reasons.push("تهدید/نگرانیِ امنیتی — بررسیِ انسانی لازم است");
  }
  if (features.profanity) {
    action = raise(action, "escalate_human");
    gates.push("profanity");
    reasons.push("فحاشی تشخیص داده شد");
  }
  if (features.dbMismatch) {
    action = raise(action, "escalate_human");
    gates.push("db_mismatch");
    reasons.push("تناقض دیتابیس (پرداخت موفق ولی فعال نشده)");
  }
  if (features.vip) {
    action = raise(action, "escalate_human");
    gates.push("vip_user");
    reasons.push("کاربر VIP");
  }
  if (features.unresolvedTurns >= 3) {
    action = raise(action, "escalate_human");
    gates.push("unresolved_after_3_turns");
    reasons.push("بعد از ۳ نوبت حل نشده");
  }
  if (cls.confidence < LOW_CONFIDENCE) {
    action = raise(action, "draft_for_review");
    gates.push("low_confidence");
    reasons.push(`confidence پایین (${cls.confidence.toFixed(2)})`);
  }

  // auto_send extra guard: facts must be fresh AND confidence high
  if (action === "auto_send") {
    const allFresh = evidence.tools.every((t) => t.fresh);
    if (!allFresh || cls.confidence < AUTO_CONFIDENCE) {
      action = "draft_for_review";
      gates.push("auto_guard_not_met");
      reasons.push(!allFresh ? "داده‌ی tool تازه نیست" : `confidence < ${AUTO_CONFIDENCE}`);
    }
  }

  return { action, tier: cls.tier, reasons, gatesTriggered: gates };
}
