/** STUB payment adapter — replace with gateway callback/log query (ADR-3). Activation/refund stay human. */
import type { ToolResult, PaymentStatus } from "./types.ts";
import { hash01, nowIso } from "./_util.ts";

/** forceMismatch: simulate the classic "paid but not activated" case for the demo. */
export function getPaymentStatus(userCode: string, forceMismatch = false): ToolResult<PaymentStatus> {
  const h = hash01(userCode + "pay");
  const success = forceMismatch || h > 0.25;
  const activated = forceMismatch ? false : success;
  const value: PaymentStatus = {
    userCode,
    lastTxStatus: success ? "success" : "failed",
    amountToman: 229000,
    activatedInBot: activated,
    callbackComplete: activated,
  };
  return {
    ok: true,
    value,
    summary: success
      ? activated
        ? "تراکنش موفق و فعال‌شده"
        : "تراکنش موفق ولی callback ناقص — مبلغ کسر شده، فعال نشده"
      : "آخرین تراکنش ناموفق",
    source: "gateway-log",
    checkedAt: nowIso(),
  };
}
