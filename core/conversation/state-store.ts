/** Per-user conversation memory (file-backed). Survives connector restarts + long gaps.
 *  Separates the CURRENT working session (history fed to the model) from LIFETIME stats
 *  (counts from the user's first message ever). A long silence starts a fresh session so a
 *  user who returns after 3 months doesn't get answered against 3-month-old context. */
import fs from "node:fs";

export interface ConvState {
  telegramId: number;
  name?: string;
  username?: string;
  greeted: boolean;
  intent: string | null;
  slots: { device?: string; net?: string; lastIpReg?: string; ip?: string };
  stage: string; // new | collecting | ready | answered | resolved | human | needs_user | incident
  lastUserAt: string | null;
  lastBotAt: string | null;
  turnCount: number;            // turns in the CURRENT session
  realAnswered?: boolean;
  userRecord?: any;
  history: { role: "user" | "bot"; text: string; at: string }[]; // CURRENT session only

  // lifetime stats (never reset) — "from the first day they messaged to the last"
  firstSeenAt?: string;
  lastSeenAt?: string;
  msgIn?: number;               // user messages we processed (lifetime)
  msgOut?: number;              // bot replies produced (lifetime)
  escalations?: number;         // times routed to a human (lifetime)
  sessions?: number;            // distinct conversation sessions (gap-separated)
  lastKind?: string;            // text | voice | photo
}

export function defaultState(telegramId: number): ConvState {
  return {
    telegramId, greeted: false, intent: null, slots: {}, stage: "new",
    lastUserAt: null, lastBotAt: null, turnCount: 0, history: [],
    firstSeenAt: undefined, lastSeenAt: null as any, msgIn: 0, msgOut: 0, escalations: 0, sessions: 0,
  };
}

/** A long silence (default 6h) → the next message begins a fresh session: clear the working
 *  context but KEEP lifetime stats. Returns true if a reset happened. */
export function maybeResetSession(s: ConvState, atIso: string, gapMs: number): boolean {
  if (!s.lastUserAt) return false;
  const gap = new Date(atIso).getTime() - new Date(s.lastUserAt).getTime();
  if (!Number.isFinite(gap) || gap < gapMs) return false; // NaN (bad/test timestamps) → never reset
  s.greeted = false; s.intent = null; s.slots = {}; s.stage = "new";
  s.turnCount = 0; s.realAnswered = false; s.history = []; s.userRecord = undefined;
  return true;
}

export interface Store {
  get(id: number): ConvState;
  set(id: number, s: ConvState): void;
  persist(): void;
  all(): Record<string, ConvState>;
}

/** file=undefined -> in-memory only (for the demo, so it never pollutes live state). */
export function createStore(file?: string): Store {
  let map: Record<string, ConvState> = {};
  if (file) {
    try { map = JSON.parse(fs.readFileSync(file, "utf8")); } catch { map = {}; }
  }
  return {
    get(id) { return map[String(id)] || defaultState(id); },
    set(id, s) { if (s.history.length > 24) s.history = s.history.slice(-24); map[String(id)] = s; },
    persist() { if (file) { try { fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf8"); } catch {} } },
    all() { return map; },
  };
}
