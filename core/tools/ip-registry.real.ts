/**
 * REAL ip-registry adapter — reads the live whitelist of registered IPs from Shelter.
 * READ-ONLY (GET). Endpoint returns a flat JSON array of all currently-registered IPv4s.
 * Lets us answer the #1 question truthfully: "is this user's IP registered?"
 *
 * Limitation: this endpoint has no user->IP mapping and no timestamps, so we need the
 * user's CURRENT public IP (they send it via an IP-check link) to check membership.
 */
import type { ToolResult } from "./types.ts";
import { nowIso } from "./_util.ts";

const URL = process.env.IP_REGISTRY_ALLIPS_URL || "";
let cache: { at: number; ips: Set<string> } = { at: 0, ips: new Set() };

export async function getRegisteredIpSet(): Promise<Set<string>> {
  if (cache.ips.size && Date.now() - cache.at < 60000) return cache.ips; // 60s cache
  if (!URL) throw new Error("IP_REGISTRY_ALLIPS_URL not set");
  const r = await fetch(URL);
  if (!r.ok) throw new Error(`getallips HTTP ${r.status}`);
  const arr = (await r.json()) as string[];
  cache = { at: Date.now(), ips: new Set(arr) };
  return cache.ips;
}

export async function isIpRegistered(ip: string): Promise<ToolResult<{ ip: string; registered: boolean; total: number }>> {
  const set = await getRegisteredIpSet();
  const registered = set.has((ip || "").trim());
  return {
    ok: true,
    value: { ip, registered, total: set.size },
    summary: registered
      ? `IP ${ip} در whitelist ثبت‌شده ✅`
      : `IP ${ip} ثبت نشده ❌ — باید از ربات «ثبت آیپی» کنه`,
    source: "sheltertm/getallips",
    checkedAt: nowIso(),
  };
}
