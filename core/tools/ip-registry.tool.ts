/** STUB DNS IP-auth adapter — replace with the real ثبت‌آیپی API (ADR confirmed it exists). */
import type { ToolResult, RegisteredIp } from "./types.ts";
import { hash01, nowIso, minutesAgoIso } from "./_util.ts";

export function getRegisteredIp(userCode: string): ToolResult<RegisteredIp> {
  const h = hash01(userCode + "ip");
  const minutesSince = Math.round(h * 4000);
  const matches = h > 0.5;
  const value: RegisteredIp = {
    registeredAt: minutesAgoIso(minutesSince),
    registeredIp: `5.${Math.round(h * 250)}.${Math.round(h * 99)}.x`,
    currentIp: matches ? `5.${Math.round(h * 250)}.${Math.round(h * 99)}.x` : `2.${Math.round(h * 200)}.${Math.round(h * 99)}.x`,
    matchesCurrent: matches,
    minutesSince,
  };
  return {
    ok: true,
    value,
    summary: matches
      ? `IP ثبت‌شده مطابق نت فعلی (${minutesSince} دقیقه پیش)`
      : `آخرین ثبت ${Math.round(minutesSince / 60)} ساعت پیش — IP فعلی متفاوت است (نیاز به ری‌ثبت)`,
    source: "dnsauth-api",
    checkedAt: nowIso(),
  };
}

export function registerIp(userCode: string, ip: string): ToolResult<{ ok: boolean }> {
  return {
    ok: true,
    value: { ok: true },
    summary: `IP ${ip} برای ${userCode} ثبت شد (stub)`,
    source: "dnsauth-api",
    checkedAt: nowIso(),
  };
}
