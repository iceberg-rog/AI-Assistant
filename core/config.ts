/**
 * Master switch: are the tool adapters wired to REAL systems, or still stubs?
 * While false, the agent asserts NO tool-derived facts — it ASKS the diagnostic
 * question instead of claiming "I checked X". Set SHELTER_REAL_TOOLS=1 once the
 * billing / ip-registry / payment adapters are real (so facts are trustworthy).
 */
export const FACTS_ARE_REAL = process.env.SHELTER_REAL_TOOLS === "1";

/** The real IP-registry whitelist tool is available when its URL is configured. */
export const IP_TOOL_REAL = !!process.env.IP_REGISTRY_ALLIPS_URL;

/** The real users DB (subscription + registered IP by telegram_id) is available. */
export const USERS_DB_REAL = !!process.env.USERS_QUERY_BASE;

/** Claude (the LLM brain) is wired when an API key is present. Re-checks low-confidence
 *  regex results, grounded in the real KB + history + the user's DB record. */
export const CLAUDE_REAL = !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

// Tiered brain (cost + quality): a cheap FAST model handles the bulk; if it's not confident,
// the SMART model gives a second, higher-quality answer. Most calls stay cheap; hard cases keep quality.
export const CLAUDE_MODEL_FAST = process.env.CLAUDE_MODEL_FAST || "claude-haiku-4-5";
// SMART prefers its own dedicated var so the tiered brain is genuinely haiku → sonnet (not haiku → haiku)
export const CLAUDE_MODEL_SMART = process.env.CLAUDE_MODEL_SMART || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const FAST_TRUST_FLOOR = Number(process.env.SHELTER_FAST_TRUST) || 0.78; // FAST conf below this → ask SMART

/** Confidence floor (user requirement): below this we don't trust the answer —
 *  Claude re-checks; if it's still below, escalate to a human (never fake it). */
export const CONF_FLOOR = Number(process.env.SHELTER_CONF_FLOOR) || 0.7;

/** Silence longer than this starts a FRESH conversation session — a user returning after
 *  months isn't answered against stale months-old context (default 6h). Lifetime stats persist. */
export const SESSION_GAP_MS = (Number(process.env.SHELTER_SESSION_GAP_HOURS) || 6) * 3_600_000;

/** Optional chat id to ping when a message is routed to a human (e.g. the owner's chat with the bot). */
export const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
