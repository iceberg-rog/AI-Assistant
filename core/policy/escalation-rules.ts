/** Hard override gates (ADR-4 / ADR-6). Any gate raises the action toward a human. */

/** Always to a human regardless of tier. */
export const HUMAN_FORCE = new Set<string>([
  "refund_request",
  "payment_not_received",
  "ip_transfer_between_accounts",
  "abuse_profanity",
]);

/** Financial-adjacent (read-only diagnosis ok, but no money actions by AI). */
export const FINANCIAL = new Set<string>([...HUMAN_FORCE, "payment_gateway_error"]);

export const AUTO_CONFIDENCE = 0.82; // min confidence to allow auto_send
export const LOW_CONFIDENCE = 0.7; // below this, never auto
export const FRESH_WINDOW_MIN = 10; // tool result freshness for auto_send

export function routeFor(intentId: string, gates: string[]): string {
  if (intentId === "security_threat" || gates.includes("security_threat")) return "manager"; // security review
  if (gates.includes("profanity")) return "manager";
  if (intentId === "refund_request" || intentId === "payment_not_received" || gates.includes("db_mismatch"))
    return "billing";
  if (intentId === "ip_transfer_between_accounts") return "technical";
  if (gates.includes("vip_user")) return "manager";
  return "human";
}
