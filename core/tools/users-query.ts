/**
 * REAL users-DB adapter via the getusersquery.php endpoint. READ-ONLY by hard guard.
 * NEVER runs anything but SELECT (no insert/update/delete/drop/etc; no `;`).
 * Keyed by telegram_id (which we have from every Telegram message).
 *
 * SECURITY NOTE: this endpoint takes raw SQL + a key in the URL and exports results to a
 * server file on every call — it should be replaced by a narrow read-only API. Until then,
 * this module is the ONLY place that talks to it, with a strict SELECT-only guard.
 */
import { nowIso } from "./_util.ts";

const BASE = process.env.USERS_QUERY_BASE || "";
const FORBIDDEN = /;|\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|into\s+outfile|load_file)\b/i;

function toEndpointQuery(sql: string): string {
  if (!/^\s*select\s/i.test(sql)) throw new Error("read-only: only SELECT is allowed");
  if (FORBIDDEN.test(sql)) throw new Error("read-only: forbidden token in query");
  // endpoint convention: spaces -> '-', then URL-encode the rest
  return encodeURIComponent(sql.trim().replace(/\s+/g, "-"));
}

export async function selectQuery(sql: string): Promise<any[]> {
  if (!BASE) throw new Error("USERS_QUERY_BASE not set");
  const url = `${BASE}&query=${toEndpointQuery(sql)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`users-query HTTP ${r.status}`);
  const j = (await r.json()) as { status?: string; data?: any[] };
  return j.data || [];
}

export interface UserRecord {
  found: boolean;
  active: boolean;
  daysLeft: number;
  expiry: string | null;
  banned: boolean;
  isTest: boolean;
  ip1: string | null;
  ip2: string | null;
}

export async function getUserRecord(telegramId: number): Promise<UserRecord> {
  const id = Number(telegramId);
  if (!Number.isInteger(id)) throw new Error("invalid telegram_id");
  const rows = await selectQuery(
    `SELECT plan_expiry,ip_address_1,ip_address_2,is_banned,is_test_plan FROM users WHERE telegram_id=${id} LIMIT 1`
  );
  if (!rows.length) {
    return { found: false, active: false, daysLeft: 0, expiry: null, banned: false, isTest: false, ip1: null, ip2: null };
  }
  const u = rows[0];
  const expiry: string | null = u.plan_expiry || null;
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : 0;
  return {
    found: true,
    active: daysLeft > 0,
    daysLeft,
    expiry,
    banned: !!Number(u.is_banned),
    isTest: !!Number(u.is_test_plan),
    ip1: u.ip_address_1 || null,
    ip2: u.ip_address_2 || null,
  };
}

export { nowIso };
