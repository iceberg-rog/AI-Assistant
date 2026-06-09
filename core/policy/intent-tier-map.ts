/** intent -> automation tier, sourced from the real taxonomy (ADR-4). */
import type { Tier } from "../logs/schemas.ts";
import { intentById } from "../data.ts";

export function tierOf(intentId: string): Tier {
  const t = intentById.get(intentId)?.automation_tier;
  return t === "auto" || t === "human" ? t : "copilot";
}
