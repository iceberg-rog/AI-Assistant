/**
 * Generates the reply from the verified golden answer.
 * - If FACTS_ARE_REAL: lead with the live tool finding (confident, data-driven).
 * - If tools are still STUB: assert NOTHING from tools — ASK the diagnostic question
 *   first (honest). No fabricated "I checked X" claims ever reach a customer.
 */
import type { Classification, GeneratedReply } from "../logs/schemas.ts";
import type { NamedToolResult } from "./build-evidence-record.ts";
import { goldenById } from "../data.ts";
import { FACTS_ARE_REAL } from "../config.ts";

const factDependent = (id: string): boolean =>
  id.startsWith("ip_registration") ||
  id.startsWith("conn_") ||
  id === "speed_ping_packetloss" ||
  id === "sub_status_expiry" ||
  id === "outage_compensation_request";

export function generateReply(cls: Classification, named: NamedToolResult[]): GeneratedReply {
  const g = goldenById.get(cls.intentId);
  const body: string = g?.final_answer_fa || "اجازه بده دقیق بررسی کنم و سریع برمی‌گردم 🙏";

  // ---- STUB mode: never claim a tool fact; ask first ----
  if (!FACTS_ARE_REAL && factDependent(cls.intentId)) {
    const qs = (g?.clarifying_questions || []).slice(0, 3);
    const qline = qs.length
      ? qs.map((q) => `• ${q}`).join("\n")
      : "• دستگاه و نتت چیه؟\n• آخرین بار کِی ثبت آیپی کردی؟";
    const text =
      `سلام عزیز 🙏❤️ کنارتم تا درستش کنیم.\n` +
      `برای اینکه بدون حدس دقیق راهنماییت کنم، اول اینا رو بگو:\n${qline}\n` +
      `بعدش سریع چک می‌کنم و راه‌حل دقیق می‌دم.`;
    return { text, usedGolden: g ? cls.intentId : null, injectedFacts: [] };
  }

  // ---- REAL mode: weave the live, verified tool facts in ----
  let text = body;
  const injected: string[] = [];
  if (FACTS_ARE_REAL) {
    const sub = named.find((x) => x.name === "get_subscription")?.res;
    const ip = named.find((x) => x.name === "get_registered_ip")?.res;
    if ((cls.intentId === "sub_status_expiry" || cls.intentId === "outage_compensation_request") && sub) {
      text = `اشتراکت ${sub.summary}.\n` + text;
      injected.push(`subscription → ${sub.summary}`);
    }
    if ((cls.intentId.startsWith("ip_registration") || cls.intentId.startsWith("conn_")) && ip && !ip.value.matchesCurrent) {
      text = `چک کردم آخرین ثبت‌آیپیت با نت فعلیت نمی‌خونه — بریم دوباره ثبتش کنیم 👇\n` + text;
      injected.push("registered_ip → mismatch (needs re-register)");
    }
  }
  return { text, usedGolden: g ? cls.intentId : null, injectedFacts: injected };
}
