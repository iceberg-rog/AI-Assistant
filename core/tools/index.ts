/** Tool registry — the only source of FACTS for the agent (ADR-5). */
import { getSubscription } from "./billing.tool.ts";
import { getRegisteredIp, registerIp } from "./ip-registry.tool.ts";
import { getPaymentStatus } from "./payment.tool.ts";
import { getServerStatus, getDnsForCategory } from "./dns-health.tool.ts";
import { getUserByTelegramId } from "./user-profile.tool.ts";
import { createEscalation, getEscalations, clearEscalations } from "./escalation.tool.ts";

export const Tools = {
  getSubscription,
  getRegisteredIp,
  registerIp,
  getPaymentStatus,
  getServerStatus,
  getDnsForCategory,
  getUserByTelegramId,
  createEscalation,
  getEscalations,
  clearEscalations,
};
export type ToolName = keyof typeof Tools;
