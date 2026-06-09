/** Deterministic tool layer — every result carries provenance (source + checkedAt). */

export interface ToolResult<T> {
  ok: boolean;
  value: T;
  summary: string; // human-readable, shown on the Evidence Card
  source: string;
  checkedAt: string; // ISO
}

export interface Subscription {
  userCode: string;
  active: boolean;
  plan: string;
  expiresJalali: string;
  daysLeft: number;
  compensationDays: number;
}

export interface RegisteredIp {
  registeredAt: string; // ISO
  registeredIp: string;
  currentIp: string;
  matchesCurrent: boolean;
  minutesSince: number;
}

export interface PaymentStatus {
  userCode: string;
  lastTxStatus: "success" | "failed" | "pending" | "none";
  amountToman: number;
  activatedInBot: boolean;
  callbackComplete: boolean;
}

export interface ServerStatus {
  pool: string;
  status: "up" | "degraded" | "down";
  probedAt: string;
}

export interface DnsForCategory {
  category: string;
  primary: string[];
  secondary: string[];
}

export interface UserProfile {
  telegramId: number;
  name: string;
  userCode?: string;
  vip: boolean;
  priorIssues: number;
}
