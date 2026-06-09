/** STUB billing adapter — replace with read-only query against the billing read-replica (ADR-2). */
import type { ToolResult, Subscription } from "./types.ts";
import { hash01, nowIso, pick } from "./_util.ts";

const PLANS = ["یک‌ماهه", "دوماهه", "سه‌ماهه", "سالانه"];

export function getSubscription(userCode: string): ToolResult<Subscription> {
  const h = hash01(userCode);
  const daysLeft = Math.round(h * 60) - 8; // some expired (negative)
  const active = daysLeft > 0;
  const plan = pick(PLANS, h);
  const comp = Math.round(hash01(userCode + "c") * 5);
  const value: Subscription = {
    userCode,
    active,
    plan,
    expiresJalali: `۱۴۰۵/۰${1 + Math.round(h * 4)}/${10 + Math.round(h * 18)}`,
    daysLeft,
    compensationDays: comp,
  };
  return {
    ok: true,
    value,
    summary: active
      ? `${plan} فعال — ${daysLeft} روز مونده${comp ? ` (+${comp} روز جبرانی)` : ""}`
      : `${plan} — منقضی ${Math.abs(daysLeft)} روز پیش`,
    source: `billing#${userCode}`,
    checkedAt: nowIso(),
  };
}
