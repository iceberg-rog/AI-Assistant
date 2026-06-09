/**
 * Core schemas / types for the Shelter support engine.
 * These are the contracts the dashboard reads (conversation events, evidence
 * records, agent action logs, escalations). String-union "enums" (erasable TS).
 */

export type Tier = "auto" | "copilot" | "human";

export type ActionKind = "auto_send" | "draft_for_review" | "escalate_human";

export interface Classification {
  intentId: string;
  faLabel: string;
  tier: Tier;
  confidence: number; // 0..1
  matchedTriggers: string[];
}

/** One deterministic tool call + its provenance (source + timestamp). */
export interface ToolCallRecord {
  name: string;
  ok: boolean;
  result: string; // human-readable summary for the dashboard
  source: string; // e.g. billing#SH-1234, gateway-log, dnsauth-api, health-probe
  checkedAt: string; // ISO
  fresh: boolean; // within the freshness window
}

export interface KbCitation {
  id: string; // e.g. golden:ip_registration
  version: string;
}

/** Everything that justifies an outbound message — the "confirmable" core. */
export interface EvidenceRecord {
  conversationId: string;
  intentId: string;
  tools: ToolCallRecord[];
  kbCited: KbCitation[];
  confidence: number;
  gatesTriggered: string[];
  builtAt: string;
}

export interface PolicyDecision {
  action: ActionKind;
  tier: Tier;
  reasons: string[];
  gatesTriggered: string[];
}

export interface GeneratedReply {
  text: string;
  usedGolden: string | null;
  injectedFacts: string[];
  messages?: string[]; // human-paced: split into short messages (greeting, then one question…)
}

export interface EscalationItem {
  conversationId: string;
  intentId: string;
  faLabel: string;
  routeTo: string; // human | billing | technical | manager
  reason: string;
  user: ConversationUser;
  lastMessage: string;
  createdAt: string;
}

export interface ConversationUser {
  name: string;
  username?: string;
  telegramId: number;
  userCode?: string;
}

/** The full record of one inbound message run through the pipeline. */
export interface ConversationEvent {
  conversationId: string;
  receivedAt: string;
  user: ConversationUser;
  inbound: string;
  classification: Classification;
  evidence: EvidenceRecord;
  decision: PolicyDecision;
  reply: GeneratedReply | null;
  escalated: EscalationItem | null;
}

export interface AgentActionLog {
  conversationId: string;
  at: string;
  action: ActionKind;
  intentId: string;
  confidence: number;
  delivered: "auto_sent" | "queued_for_review" | "routed_to_human" | "held_copilot";
}
