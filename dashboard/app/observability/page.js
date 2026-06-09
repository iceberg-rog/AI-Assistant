"use client";
import { useEffect, useState } from "react";
import { PageHeader, Stat, Card } from "@/components/ui";

// time HH:MM:SS from an ISO string (slice — no TZ math, matches stored local-ish stamps)
const hms = (iso) => (iso && typeof iso === "string" && iso.length >= 19 ? iso.slice(11, 19) : "—");

// Decision badge — defined inline (light theme: accent text-700 on bg-X-500/15 ring-X-500/30)
const ACTION = {
  auto_send: { label: "ارسال خودکار", cls: "text-emerald-700 bg-emerald-500/15 ring-emerald-500/30" },
  draft_for_review: { label: "صف تأیید", cls: "text-sky-700 bg-sky-500/15 ring-sky-500/30" },
  escalate_human: { label: "ارجاع انسانی", cls: "text-amber-700 bg-amber-500/15 ring-amber-500/30" },
};

// Delivery state → Persian label + tone
const DELIVERED = {
  auto_sent: { label: "ارسال شد", cls: "text-emerald-700" },
  held_copilot: { label: "در انتظارِ تأیید", cls: "text-sky-700" },
  queued_for_review: { label: "صفِ تأیید", cls: "text-sky-700" },
  routed_to_human: { label: "ارجاع انسانی", cls: "text-amber-700" },
};

export default function ObservabilityPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/conversations", { cache: "no-store" });
      const d = await r.json();
      // Flatten every thread item across all users into a single event list.
      const flat = [];
      for (const u of d.users || []) {
        const userName = u.user?.name || "—";
        for (const t of u.thread || []) {
          flat.push({
            receivedAt: t.receivedAt,
            userName,
            faLabel: t.faLabel || "—",
            inbound: t.inbound || "",
            action: t.action,
            confidence: t.confidence,
            delivered: t.delivered,
            claude: t.claude === true,
          });
        }
      }
      flat.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)); // newest first
      setRows(flat);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // stats computed over the full (unfiltered) event list
  const total = rows.length;
  const claudeCount = rows.reduce((a, r) => a + (r.claude ? 1 : 0), 0);
  const escalatedCount = rows.reduce((a, r) => a + (r.action === "escalate_human" ? 1 : 0), 0);
  const autoCount = rows.reduce((a, r) => a + (r.action === "auto_send" ? 1 : 0), 0);

  // search filters by user / intent / inbound text
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? rows.filter((r) => `${r.userName} ${r.faLabel} ${r.inbound}`.toLowerCase().includes(needle))
    : rows;

  return (
    <div dir="rtl">
      <PageHeader
        kicker="OBSERVABILITY"
        title="Action-Log (واقعی)"
        sub="هر تصمیمِ سیستم رو رویدادهای زنده — قابلِ حسابرسی. 🧠 یعنی کلود بازبینی کرده."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کلِ رویداد" value={total} />
        <Stat label="با بازبینیِ کلود" value={claudeCount} accent="sky" />
        <Stat label="ارجاع‌شده" value={escalatedCount} accent="amber" />
        <Stat label="خودکار" value={autoCount} accent="emerald" />
      </div>

      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          dir="rtl"
          placeholder="🔍 جست‌وجوی کاربر / موضوع / متنِ پیام…"
          className="search-input w-full md:w-96"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-zinc-500 text-right border-b border-black/10">
                <th className="font-medium px-3 py-2.5">زمان</th>
                <th className="font-medium px-3 py-2.5">کاربر</th>
                <th className="font-medium px-3 py-2.5">موضوع</th>
                <th className="font-medium px-3 py-2.5">تصمیم</th>
                <th className="font-medium px-3 py-2.5">اطمینان</th>
                <th className="font-medium px-3 py-2.5">تحویل</th>
                <th className="font-medium px-3 py-2.5 text-center">🧠</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-zinc-500">
                    {q.trim() ? "چیزی پیدا نشد." : "هنوز رویدادی ثبت نشده."}
                  </td>
                </tr>
              ) : (
                visible.map((r, i) => {
                  const a = ACTION[r.action] || { label: r.action || "—", cls: "text-zinc-700 bg-zinc-500/15 ring-zinc-500/30" };
                  const d = DELIVERED[r.delivered] || { label: r.delivered || "—", cls: "text-zinc-500" };
                  return (
                    <tr key={i} className="border-b border-black/[0.08] hover:bg-black/[0.035]">
                      <td className="px-3 py-2 text-zinc-500 ltr font-mono whitespace-nowrap">{hms(r.receivedAt)}</td>
                      <td className="px-3 py-2 text-zinc-900 whitespace-nowrap">{r.userName}</td>
                      <td className="px-3 py-2 text-zinc-700 whitespace-nowrap">{r.faLabel}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${a.cls}`}>{a.label}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-600 tabular-nums ltr">{Math.round((r.confidence || 0) * 100)}٪</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${d.cls}`}>{d.label}</td>
                      <td className="px-3 py-2 text-center">{r.claude ? <span title="کلود بازبینی کرده">🧠</span> : <span className="text-zinc-300">—</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
