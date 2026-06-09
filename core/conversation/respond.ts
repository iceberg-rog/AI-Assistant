/** Runs the stateless pipeline, then replaces the reply with a stateful, human-paced one. */
import type { ConversationEvent } from "../logs/schemas.ts";
import type { ConvState } from "./state-store.ts";
import type { Inbound } from "../agent/orchestrator.ts";
import { handleInbound } from "../agent/orchestrator.ts";
import { respond as managerRespond } from "./manager.ts";
import { intentById } from "../data.ts";
import { routeFor, FINANCIAL } from "../policy/escalation-rules.ts";
import { policyGate } from "../policy/policy-gate.ts";
import { tierOf } from "../policy/intent-tier-map.ts";
import { Tools } from "../tools/index.ts";

export async function respondWithState(inb: Inbound, state: ConvState): Promise<{ event: ConversationEvent; state: ConvState }> {
  state.name = inb.user.name; state.username = inb.user.username;
  const event = handleInbound(inb);

  // confident human-tier intents (refund/payment/abuse) escalate up front — a human handles it.
  if (event.decision.action === "escalate_human") {
    if (!state.firstSeenAt) state.firstSeenAt = inb.receivedAt;
    state.lastSeenAt = inb.receivedAt;
    state.msgIn = (state.msgIn || 0) + 1;
    state.escalations = (state.escalations || 0) + 1;
    if (!state.sessions) state.sessions = 1;
    state.history.push({ role: "user", text: inb.text, at: inb.receivedAt });
    state.lastUserAt = inb.receivedAt;
    state.turnCount++;
    return { event, state };
  }

  const media = { kind: inb.kind, imageBase64: inb.imageBase64, imageMediaType: inb.imageMediaType, caption: inb.caption };
  const r = await managerRespond(inb.text, event.classification, state, inb.receivedAt, media);
  const ns = r.state;

  // Claude was consulted → adopt its verdict as the classification and RE-RUN the Policy-Gate
  // on it, so the action ladder (auto/draft/escalate) reflects Claude's intent + confidence,
  // not the stale regex guess.
  if (r.llm) {
    event.classification = {
      intentId: r.llm.intentId,
      faLabel: intentById.get(r.llm.intentId)?.fa_label || r.llm.intentId,
      tier: tierOf(r.llm.intentId),
      confidence: r.llm.confidence,
      matchedTriggers: event.classification.matchedTriggers,
    };
    event.evidence.confidence = r.llm.confidence;
    event.evidence.tools = [
      { name: "claude_review", ok: true, result: `${r.llm.intentId} · conf ${r.llm.confidence.toFixed(2)}${r.llm.needsHuman ? " · needsHuman" : ""}`, source: r.llm.model, checkedAt: new Date().toISOString(), fresh: true },
      ...event.evidence.tools,
    ];
    if (!r.escalate) {
      const features = {
        profanity: r.llm.intentId === "abuse_profanity",
        financialIntent: FINANCIAL.has(r.llm.intentId),
        dbMismatch: false, vip: false, unresolvedTurns: inb.unresolvedTurns || 0,
      };
      event.decision = policyGate(event.classification, event.evidence, features);
      event.evidence.gatesTriggered = event.decision.gatesTriggered;
    }
  }

  // escalate when the manager flagged needsHuman, OR the (recomputed) Policy-Gate raised to human.
  if (r.escalate || event.decision.action === "escalate_human") {
    const reason = r.escalate?.reason || (event.decision.reasons || []).join(" · ") || "policy_gate_escalation";
    event.decision.action = "escalate_human";
    if (r.escalate) event.decision.gatesTriggered = [...(event.decision.gatesTriggered || []), "needs_human"];
    event.reply = null; // a drafted reply is dropped — a human takes over
    event.escalated = Tools.createEscalation({
      conversationId: inb.conversationId,
      intentId: event.classification.intentId,
      faLabel: event.classification.faLabel,
      routeTo: routeFor(event.classification.intentId, event.decision.gatesTriggered),
      reason,
      user: inb.user,
      lastMessage: inb.text,
      createdAt: new Date().toISOString(),
    });
    ns.escalations = (ns.escalations || 0) + 1;
    return { event, state: ns };
  }

  event.reply = {
    text: r.messages.join("\n"),
    usedGolden: event.classification.intentId,
    injectedFacts: [],
    messages: r.messages,
  };

  // replace stub subscription/ip evidence with the REAL users.db record
  if (ns.userRecord && ns.userRecord.found) {
    const u = ns.userRecord;
    const real = {
      name: "get_user_record",
      ok: true,
      result: `اشتراک: ${u.active ? u.daysLeft + " روز مونده" : "منقضی"} · آیپی ثبت‌شده: ${u.ip1 || "—"}${u.ip2 ? " / " + u.ip2 : ""}${u.banned ? " · مسدود" : ""}`,
      source: `users.db#tg${ns.telegramId}`,
      checkedAt: new Date().toISOString(),
      fresh: true,
    };
    event.evidence.tools = [real, ...event.evidence.tools.filter((t) => !["get_subscription", "get_registered_ip"].includes(t.name))];
  }

  return { event, state: ns };
}
