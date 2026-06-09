/**
 * Incident / announcement injection — the admin posts a temporary rule:
 *   "from now for 24h, anyone who mentions lag (or whose topic is speed_ping) →
 *    tell them: 'due to X we're fixing it, please wait until morning'."
 *
 * Two match channels (OR): keywords (matched on the normalized text) and intents
 * (the classified topic). scope:"all" applies to EVERYONE in the window (a global
 * announcement). mode:"replace" short-circuits diagnostics (just the wait-message);
 * mode:"prepend" leads with the notice then continues the normal answer.
 *
 * Stored in dashboard/data/incidents.json (shared by connector + dashboard).
 * mtime-cached so admin edits take effect within seconds without re-reading per message.
 */
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../data.ts";
import { norm } from "../agent/classify-message.ts";

export interface Incident {
  id: string;
  message: string;            // the canned wait-message (Persian)
  scope: "match" | "all";     // "all" = everyone during the window
  mode: "prepend" | "replace";
  keywords: string[];         // OR — matched against normalized inbound text
  intents: string[];          // OR — matched against the classified intentId
  createdAt: string;
  expiresAt: string;          // ISO; past = inactive
  enabled: boolean;
  note?: string;              // admin's own label/reason
  hits?: number;              // how many times it fired
}

const FILE = path.join(DATA_DIR, "incidents.json");

let _cache: Incident[] = [];
let _mtime = 0;

function readAll(): Incident[] {
  try {
    const st = fs.statSync(FILE);
    if (st.mtimeMs === _mtime) return _cache;
    _cache = (JSON.parse(fs.readFileSync(FILE, "utf8")).incidents || []) as Incident[];
    _mtime = st.mtimeMs;
  } catch {
    _cache = [];
    _mtime = 0;
  }
  return _cache;
}

function writeAll(list: Incident[]): void {
  fs.writeFileSync(FILE, JSON.stringify({ generatedAt: new Date().toISOString(), incidents: list }, null, 2), "utf8");
  _cache = list;
  try { _mtime = fs.statSync(FILE).mtimeMs; } catch { _mtime = 0; }
}

export function activeIncidents(nowMs = Date.now()): Incident[] {
  return readAll().filter((i) => i.enabled && new Date(i.expiresAt).getTime() > nowMs);
}

/** Pure matcher (testable without file I/O): first incident in `list` that matches. */
export function matchAgainst(list: Incident[], text: string, intentId: string): Incident | null {
  const n = norm(text);
  for (const inc of list) {
    if (inc.scope === "all") return inc;
    if (inc.keywords.some((k) => k && n.includes(norm(k)))) return inc;
    if (inc.intents.includes(intentId)) return inc;
  }
  return null;
}

/** First active incident that matches this message/topic, or null. */
export function matchIncident(text: string, intentId: string, nowMs = Date.now()): Incident | null {
  return matchAgainst(activeIncidents(nowMs), text, intentId);
}

/** Count a fire (best-effort; persisted so the dashboard shows reach). */
export function bumpHit(id: string): void {
  const list = readAll();
  const inc = list.find((i) => i.id === id);
  if (!inc) return;
  inc.hits = (inc.hits || 0) + 1;
  try { writeAll(list); } catch {}
}

export function addIncident(input: Partial<Incident>): Incident {
  const list = readAll();
  const hours = Number(input.hours) > 0 ? Number(input.hours) : 24;
  const inc: Incident = {
    id: "inc_" + Date.now().toString(36),
    message: (input.message || "").trim(),
    scope: input.scope === "all" ? "all" : "match",
    mode: input.mode === "replace" ? "replace" : "prepend",
    keywords: Array.isArray(input.keywords) ? input.keywords.map((s) => String(s).trim()).filter(Boolean) : [],
    intents: Array.isArray(input.intents) ? input.intents.map((s) => String(s).trim()).filter(Boolean) : [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + hours * 3600_000).toISOString(),
    enabled: true,
    note: input.note ? String(input.note).slice(0, 200) : undefined,
    hits: 0,
  };
  list.unshift(inc);
  writeAll(list);
  return inc;
}

export function removeIncident(id: string): boolean {
  const list = readAll();
  const next = list.filter((i) => i.id !== id);
  if (next.length === list.length) return false;
  writeAll(next);
  return true;
}

/** End an incident now without deleting it (keeps the audit row). */
export function expireIncident(id: string): boolean {
  const list = readAll();
  const inc = list.find((i) => i.id === id);
  if (!inc) return false;
  inc.enabled = false;
  inc.expiresAt = new Date().toISOString();
  writeAll(list);
  return true;
}

export { FILE as INCIDENTS_FILE };
