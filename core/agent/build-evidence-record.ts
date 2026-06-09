/** Assembles the Evidence Record from tool results + KB citations (ADR-6). */
import type { Classification, EvidenceRecord, KbCitation, ToolCallRecord } from "../logs/schemas.ts";
import type { ToolResult } from "../tools/types.ts";
import { FRESH_WINDOW_MIN } from "../policy/escalation-rules.ts";
import { goldenById } from "../data.ts";

export interface NamedToolResult {
  name: string;
  res: ToolResult<any>;
}

function isFresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= FRESH_WINDOW_MIN * 60000;
}

export function buildEvidenceRecord(
  conversationId: string,
  cls: Classification,
  named: NamedToolResult[],
  gates: string[]
): EvidenceRecord {
  const tools: ToolCallRecord[] = named.map((n) => ({
    name: n.name,
    ok: n.res.ok,
    result: n.res.summary,
    source: n.res.source,
    checkedAt: n.res.checkedAt,
    fresh: isFresh(n.res.checkedAt),
  }));
  const kbCited: KbCitation[] = goldenById.has(cls.intentId)
    ? [{ id: `golden:${cls.intentId}`, version: "v1" }]
    : [];
  return {
    conversationId,
    intentId: cls.intentId,
    tools,
    kbCited,
    confidence: cls.confidence,
    gatesTriggered: gates,
    builtAt: new Date().toISOString(),
  };
}
