/** STUB DNS health adapter — replace with a live health-probe over the registry (ADR-5: never KB-only). */
import type { ToolResult, ServerStatus, DnsForCategory } from "./types.ts";
import { nowIso } from "./_util.ts";
import { dnsPools } from "../data.ts";

// demo: one pool degraded to exercise the "server problem" path
const DEGRADED = new Set<string>(["10.30.72.0/24 (RFC1918 private)"]);

export function getServerStatus(poolHint: string): ToolResult<ServerStatus> {
  const pool = dnsPools.find((p) => (p.subnet || "").includes(poolHint)) || dnsPools[0] || { subnet: poolHint };
  const status: ServerStatus["status"] = DEGRADED.has(pool.subnet) ? "degraded" : "up";
  return {
    ok: true,
    value: { pool: pool.subnet, status, probedAt: nowIso() },
    summary: `${pool.subnet}: ${status === "up" ? "پایدار" : "اختلال جزئی"}`,
    source: "health-probe",
    checkedAt: nowIso(),
  };
}

export function getDnsForCategory(category: string): ToolResult<DnsForCategory> {
  // map a category to a real pool from the registry
  const map: Record<string, string> = { console: "78.157.34", mobile: "78.157.32", general: "2.189.86" };
  const hint = map[category] || "2.189.86";
  const pool = dnsPools.find((p) => (p.subnet || "").includes(hint)) || dnsPools[0];
  const ips: string[] = (pool?.example_ips || []).slice(0, 4);
  const value: DnsForCategory = {
    category,
    primary: ips.slice(0, 2),
    secondary: ips.slice(2, 4),
  };
  return {
    ok: true,
    value,
    summary: `دی‌ان‌اس ${category}: primary ${value.primary.join(" / ") || "—"}`,
    source: "dns-registry",
    checkedAt: nowIso(),
  };
}
