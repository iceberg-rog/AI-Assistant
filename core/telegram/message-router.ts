/** Routes one inbound message through the agent and delivers per the Policy-Gate decision. */
import type { TelegramAdapter } from "./telegram-adapter.interface.ts";
import type { AgentActionLog, ConversationEvent } from "../logs/schemas.ts";
import { handleInbound } from "../agent/orchestrator.ts";
import type { Inbound } from "../agent/orchestrator.ts";
import type { ConvState } from "../conversation/state-store.ts";
import { respondWithState } from "../conversation/respond.ts";

export interface RouteResult {
  event: ConversationEvent;
  log: AgentActionLog;
  state?: ConvState;
}

export async function routeInbound(
  adapter: TelegramAdapter,
  inb: Inbound,
  opts: { autoSend?: boolean; state?: ConvState } = {}
): Promise<RouteResult> {
  const autoSend = opts.autoSend === true; // COPILOT by default: never send
  let event: ConversationEvent;
  let newState: ConvState | undefined;
  if (opts.state) {
    const r = await respondWithState(inb, opts.state); // stateful, human-paced reply
    event = r.event;
    newState = r.state;
  } else {
    event = handleInbound(inb); // stateless single-shot (tests / simple demo)
  }
  const chatId = inb.user.telegramId;
  let delivered: AgentActionLog["delivered"];

  switch (event.decision.action) {
    case "auto_send":
      if (autoSend) {
        await adapter.sendTyping(chatId);
        await adapter.sendMessage({
          conversationId: inb.conversationId,
          chatId,
          text: event.reply?.text || "",
        });
        delivered = "auto_sent";
      } else {
        delivered = "held_copilot"; // Copilot mode: do NOT send; hold for human review
      }
      break;
    case "draft_for_review":
      delivered = "queued_for_review"; // surfaces in dashboard Confirm Queue; not sent
      break;
    case "escalate_human":
    default:
      await adapter.markHumanTakeover(chatId);
      delivered = "routed_to_human";
      break;
  }

  const log: AgentActionLog = {
    conversationId: inb.conversationId,
    at: new Date().toISOString(),
    action: event.decision.action,
    intentId: event.classification.intentId,
    confidence: event.classification.confidence,
    delivered,
  };
  return { event, log, state: newState };
}
