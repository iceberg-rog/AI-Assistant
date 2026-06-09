/**
 * The single-call agent pipeline:
 *   inbound -> classify -> plan+run tools -> evidence -> policy-gate -> reply | escalate
 * One pass per message. The LLM never produces facts; tools do (ADR-5).
 */
import type { ConversationEvent, ConversationUser } from "../logs/schemas.ts";
import { classify } from "./classify-message.ts";
import { buildEvidenceRecord } from "./build-evidence-record.ts";
import type { NamedToolResult } from "./build-evidence-record.ts";
import { decideAction } from "./decide-action.ts";
import { generateReply } from "./generate-reply.ts";
import { routeFor } from "../policy/escalation-rules.ts";
import { Tools } from "../tools/index.ts";

export interface Inbound {
  conversationId: string;
  user: ConversationUser;
  text: string;
  receivedAt: string;
  unresolvedTurns?: number;
  businessConnectionId?: string; // needed to reply on behalf of the account
  kind?: "text" | "voice" | "photo"; // non-text media (voice/photo) handled specially
  imageBase64?: string;              // jpeg base64 when kind === "photo"
  imageMediaType?: string;           // e.g. image/jpeg
  caption?: string;                  // photo caption, if any
}

function planTools(intentId: string, user: ConversationUser): NamedToolResult[] {
  const out: NamedToolResult[] = [];
  const code = user.userCode || "SH-0000";
  out.push({ name: "get_user_profile", res: Tools.getUserByTelegramId(user.telegramId, user.name, user.userCode) });

  if (intentId === "greeting_smalltalk" || intentId === "gratitude_closing") return out;

  if (intentId.startsWith("ip_registration") || intentId.startsWith("conn_") || intentId === "game_login_match_fail") {
    const cat = intentId === "conn_console_setup" ? "console" : intentId === "conn_mobile_apn_setup" ? "mobile" : "general";
    out.push({ name: "get_subscription", res: Tools.getSubscription(code) });
    out.push({ name: "get_registered_ip", res: Tools.getRegisteredIp(code) });
    out.push({ name: "get_server_status", res: Tools.getServerStatus(cat === "console" ? "78.157.34" : "2.189.86") });
    out.push({ name: "get_dns_for_category", res: Tools.getDnsForCategory(cat) });
  } else if (intentId === "payment_not_received") {
    out.push({ name: "get_subscription", res: Tools.getSubscription(code) });
    out.push({ name: "get_payment_status", res: Tools.getPaymentStatus(code, true) }); // intent = paid-but-not-active
  } else if (intentId === "payment_gateway_error") {
    out.push({ name: "get_payment_status", res: Tools.getPaymentStatus(code) });
  } else if (["sub_status_expiry", "outage_compensation_request", "refund_request", "abuse_profanity"].includes(intentId)) {
    out.push({ name: "get_subscription", res: Tools.getSubscription(code) });
  } else if (["speed_ping_packetloss", "outage_service_status", "free_download_dns_request", "dns_concept_question"].includes(intentId)) {
    out.push({ name: "get_subscription", res: Tools.getSubscription(code) });
    out.push({ name: "get_server_status", res: Tools.getServerStatus("2.189.86") });
    out.push({ name: "get_dns_for_category", res: Tools.getDnsForCategory("general") });
  }
  return out;
}

export function handleInbound(inb: Inbound): ConversationEvent {
  const cls = classify(inb.text);
  const named = planTools(cls.intentId, inb.user);

  const evidence = buildEvidenceRecord(inb.conversationId, cls, named, []);
  const decision = decideAction(cls, evidence, named, inb.unresolvedTurns || 0);
  evidence.gatesTriggered = decision.gatesTriggered;

  let reply = null;
  let escalated = null;
  if (decision.action === "escalate_human") {
    escalated = Tools.createEscalation({
      conversationId: inb.conversationId,
      intentId: cls.intentId,
      faLabel: cls.faLabel,
      routeTo: routeFor(cls.intentId, decision.gatesTriggered),
      reason: decision.reasons.join(" · "),
      user: inb.user,
      lastMessage: inb.text,
      createdAt: new Date().toISOString(),
    });
  } else {
    reply = generateReply(cls, named);
  }

  return {
    conversationId: inb.conversationId,
    receivedAt: inb.receivedAt,
    user: inb.user,
    inbound: inb.text,
    classification: cls,
    evidence,
    decision,
    reply,
    escalated,
  };
}
