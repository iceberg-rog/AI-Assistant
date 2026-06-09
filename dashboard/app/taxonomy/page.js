"use client";
import { useMemo, useState } from "react";
import taxonomy from "@/data/intents_taxonomy.json";
import { PageHeader, Card, Stat, TierBadge } from "@/components/ui";

const TABS = [
  { k: "all", label: "همه" },
  { k: "auto", label: "خودکار" },
  { k: "copilot", label: "نیمه‌خودکار" },
  { k: "human", label: "انسانی" },
];

const ALL = taxonomy.intents || [];
const countOf = (k) => ALL.filter((i) => i.automation_tier === k).length;

export default function TaxonomyPage() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const intents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ALL.filter((i) => {
      if (tab !== "all" && i.automation_tier !== tab) return false;
      if (!needle) return true;
      const hay = [
        i.id,
        i.fa_label,
        i.definition,
        ...(i.triggers || []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [tab, q]);

  return (
    <div>
      <PageHeader
        kicker="KNOWLEDGE BASE"
        title="تاکسونومی Intent"
        sub={`${ALL.length} موضوعی که بات می‌شناسه — کدوم خودکار جواب داده می‌شه و کدوم به انسان می‌ره.`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کلِ نیت‌ها" value={ALL.length} />
        <Stat label="خودکار" value={countOf("auto")} accent="emerald" />
        <Stat label="نیمه‌خودکار" value={countOf("copilot")} accent="sky" />
        <Stat label="انسانی" value={countOf("human")} accent="amber" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          dir="rtl"
          placeholder="🔍 جست‌وجو در نیت‌ها / آی‌دی / واژه‌های محرک…"
          className="search-input w-full md:w-96"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                tab === t.k
                  ? "bg-black/[0.07] text-zinc-900 ring-1 ring-black/10"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-black/[0.04]"
              }`}
            >
              {t.label}
              <span className="mr-1.5 text-[11px] text-zinc-500 tabular-nums">
                {t.k === "all" ? ALL.length : countOf(t.k)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {intents.map((i) => (
          <Card key={i.id} className="p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 leading-6">{i.fa_label}</div>
                <div className="text-[10px] text-zinc-500 ltr mt-0.5 font-mono">{i.id}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <TierBadge tier={i.automation_tier} />
                {i.est_share && (
                  <span className="text-[10px] text-zinc-500 tabular-nums ltr">{i.est_share}</span>
                )}
              </div>
            </div>

            <p className="text-[12px] text-zinc-600 leading-6 mb-3">{i.definition}</p>

            {i.triggers?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {i.triggers.slice(0, 6).map((t, n) => (
                  <span
                    key={n}
                    dir="auto"
                    className="rounded bg-black/[0.04] ring-1 ring-black/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-600"
                  >
                    {t}
                  </span>
                ))}
                {i.triggers.length > 6 && (
                  <span className="text-[10px] text-zinc-400 px-1 py-0.5">
                    +{i.triggers.length - 6}
                  </span>
                )}
              </div>
            )}

            <div className="mt-auto pt-2 border-t border-black/10 space-y-2">
              {(i.required_tools || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-zinc-500">ابزار:</span>
                  {i.required_tools.map((t, n) => (
                    <span
                      key={n}
                      className="rounded bg-emerald-500/15 ring-1 ring-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-700 ltr font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {i.escalate_when && (
                <div className="flex gap-1.5 rounded-md bg-amber-500/[0.08] ring-1 ring-amber-500/20 px-2 py-1.5 text-[10px] text-amber-700 leading-5">
                  <span className="shrink-0">⚠ ارجاع:</span>
                  <span className="min-w-0">{i.escalate_when}</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {intents.length === 0 && (
        <div className="text-sm text-zinc-500 py-12 text-center">
          {q.trim() ? "چیزی پیدا نشد." : "نیتی در این دسته نیست."}
        </div>
      )}
    </div>
  );
}
