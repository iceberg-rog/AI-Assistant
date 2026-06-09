import taxonomy from "@/data/intents_taxonomy.json";
import goldenRaw from "@/data/golden_answers.json";
import hallucinations from "@/data/hallucinations_caught.json";
import dnsRegistry from "@/data/dns_registry.json";
import voice from "@/data/voice_guide.json";
import escalation from "@/data/escalation_playbook.json";
import metrics from "@/data/dashboard_base_metrics.json";
import volume from "@/data/volume_timeseries.json";

// Real KB + historical-analysis data only. Live operational data (conversations, queue,
// escalations, tool-calls, action-log) is read per-request from the connector's JSON files
// by each page — no mock/sim data anywhere.
export const data = {
  taxonomy,
  golden: goldenRaw.answers || [],
  hallucinations: hallucinations.by_intent || [],
  dnsRegistry,
  voice,
  escalation,
  metrics,
  volume,
};

export const ACTION = {
  auto_send: { label: "ارسال خودکار", cls: "text-emerald-700 bg-emerald-500/15 ring-emerald-500/30" },
  draft_for_review: { label: "صف تأیید", cls: "text-sky-700 bg-sky-500/15 ring-sky-500/30" },
  escalate_human: { label: "ارجاع انسانی", cls: "text-amber-700 bg-amber-500/15 ring-amber-500/30" },
};

export const TIER = {
  auto: { label: "خودکار", cls: "text-emerald-700 bg-emerald-500/15 ring-emerald-500/30" },
  copilot: { label: "نیمه‌خودکار", cls: "text-sky-700 bg-sky-500/15 ring-sky-500/30" },
  human: { label: "انسانی", cls: "text-amber-700 bg-amber-500/15 ring-amber-500/30" },
};

// A "real" conversation id is `bc:<digits>` (a Telegram business-connection thread). Single source
// of truth so test/junk conversations (e.g. "bc:test") can never reach any dashboard surface.
export const isRealConv = (convId) => /^bc:\d+$/.test(String(convId ?? ""));
export const isRealChatId = (id) => String(id ?? "").trim() !== "" && Number.isFinite(Number(id));
