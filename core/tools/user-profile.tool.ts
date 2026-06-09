/** STUB user-profile adapter — maps telegram_id <-> user_code, VIP flag, prior issues. */
import type { ToolResult, UserProfile } from "./types.ts";
import { hash01, nowIso } from "./_util.ts";

export function getUserByTelegramId(telegramId: number, name = "کاربر", userCode?: string): ToolResult<UserProfile> {
  const h = hash01(String(telegramId));
  const value: UserProfile = {
    telegramId,
    name,
    userCode,
    vip: h > 0.9,
    priorIssues: Math.round(h * 4),
  };
  return {
    ok: true,
    value,
    summary: `${name}${value.vip ? " · VIP" : ""} · ${value.priorIssues} مشکل قبلی`,
    source: "user-profile",
    checkedAt: nowIso(),
  };
}
