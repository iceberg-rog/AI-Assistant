"use client";
import { useEffect, useState } from "react";
import { PageHeader, Stat, TierBadge } from "@/components/ui";

const oneLine = (s) => (s || "").replace(/\s+/g, " ").trim();

export default function GoldenPage() {
  const [answers, setAnswers] = useState([]);
  const [sel, setSel] = useState(null);     // intent of open modal
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);   // editable draft for the open answer
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/golden", { cache: "no-store" });
      const d = await r.json();
      setAnswers(d.answers || []);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  function open(a) {
    setSel(a.intent);
    setSaved(false);
    setForm({
      final_answer_fa: a.final_answer_fa || "",
      summary: a.summary || "",
      do_not_say: (a.do_not_say || []).join("\n"),
      clarifying_questions: (a.clarifying_questions || []).join("\n"),
    });
  }
  function close() { setSel(null); setForm(null); setBusy(false); setSaved(false); }

  const selAnswer = sel != null ? answers.find((a) => a.intent === sel) : null;

  async function save() {
    if (!selAnswer || !form) return;
    setBusy(true);
    setSaved(false);
    const splitLines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    try {
      const r = await fetch("/api/golden", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: selAnswer.intent,
          final_answer_fa: form.final_answer_fa,
          summary: form.summary,
          do_not_say: splitLines(form.do_not_say),
          clarifying_questions: splitLines(form.clarifying_questions),
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setSaved(true);
        setAnswers((list) => list.map((a) => (a.intent === d.answer.intent ? d.answer : a)));
      } else {
        alert("خطای ذخیره: " + (d.error || ""));
      }
    } catch (e) {
      alert("خطا: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  const tierOf = (k) => answers.reduce((a, x) => a + (x.tier === k ? 1 : 0), 0);
  const visible = q.trim()
    ? answers.filter((a) =>
        `${a.intent} ${a.fa_label || ""} ${a.final_answer_fa || ""}`.toLowerCase().includes(q.trim().toLowerCase())
      )
    : answers;

  const field =
    "w-full rounded-lg bg-zinc-50 ring-1 ring-black/10 px-3 py-2 text-[13px] text-zinc-900 leading-7 focus:outline-none focus:ring-emerald-500/40";

  return (
    <div>
      <PageHeader
        kicker="KNOWLEDGE BASE"
        title="پاسخ‌های طلایی (قابلِ ویرایش)"
        sub="دانشِ پایه‌ی بات. این‌جا می‌تونی جوابِ هر موضوع رو مستقیم اصلاح کنی تا بات درست‌تر جواب بده."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کلِ پاسخ‌ها" value={answers.length} accent="emerald" />
        <Stat label="خودکار" value={tierOf("auto")} accent="emerald" />
        <Stat label="نیمه‌خودکار" value={tierOf("copilot")} accent="sky" />
        <Stat label="انسانی" value={tierOf("human")} accent="amber" />
      </div>

      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          dir="rtl"
          placeholder="🔍 جست‌وجو در موضوع / آی‌دی / متنِ جواب…"
          className="search-input w-full md:w-96"
        />
      </div>

      {/* rows — one per answer */}
      <div className="rounded-xl border border-black/10 overflow-hidden">
        {visible.map((a) => (
          <button
            key={a.intent}
            onClick={() => open(a)}
            className="w-full flex items-center gap-3 px-4 py-3 text-right border-b border-black/[0.08] hover:bg-black/[0.04] transition"
          >
            <div className="w-[150px] shrink-0 flex flex-col items-start gap-1">
              <TierBadge tier={a.tier} />
              <span className="text-[10px] text-zinc-500 ltr truncate max-w-full">{a.intent}</span>
            </div>
            <div className="w-[170px] shrink-0 min-w-0">
              <div className="text-[13px] text-zinc-900 truncate">{a.fa_label || a.intent}</div>
            </div>
            <div className="flex-1 min-w-0 text-[12px] text-zinc-500 truncate">{oneLine(a.final_answer_fa) || "—"}</div>
            <div className="shrink-0 flex items-center gap-2">
              {a.editedAt && (
                <span className="rounded-md bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30 px-2 py-1 text-[11px]">ویرایش‌شده</span>
              )}
              <span className="rounded-md bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 px-2 py-1 text-[11px]">ویرایش</span>
            </div>
          </button>
        ))}
        {visible.length === 0 && (
          <div className="text-sm text-zinc-500 py-12 text-center">{q.trim() ? "چیزی پیدا نشد." : "هنوز پاسخی نیست."}</div>
        )}
      </div>

      {/* modal — editable answer */}
      {selAnswer && form && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={close}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/10 sticky top-0 bg-white z-10">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900 truncate">{selAnswer.fa_label || selAnswer.intent}</h2>
                  <TierBadge tier={selAnswer.tier} />
                </div>
                <div className="text-[11px] text-zinc-500 ltr mt-0.5">{selAnswer.intent}</div>
              </div>
              <button
                onClick={close}
                className="h-7 w-7 rounded-lg bg-black/[0.04] hover:bg-black/[0.07] text-zinc-500 grid place-items-center shrink-0"
              >
                ✕
              </button>
            </div>

            {/* body */}
            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-[11px] font-medium text-emerald-700 mb-1.5">جوابِ طلایی</div>
                <textarea
                  value={form.final_answer_fa}
                  onChange={(e) => setForm((f) => ({ ...f, final_answer_fa: e.target.value }))}
                  rows={8}
                  dir="rtl"
                  className={field}
                />
              </div>

              <div>
                <div className="text-[11px] font-medium text-zinc-600 mb-1.5">خلاصه</div>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  rows={2}
                  dir="rtl"
                  className={field}
                />
              </div>

              <div>
                <div className="text-[11px] font-medium text-rose-600/80 mb-1.5">هرگز نگو <span className="text-zinc-500 font-normal">(هر مورد در یک خط)</span></div>
                <textarea
                  value={form.do_not_say}
                  onChange={(e) => setForm((f) => ({ ...f, do_not_say: e.target.value }))}
                  rows={3}
                  dir="rtl"
                  className={field}
                />
              </div>

              <div>
                <div className="text-[11px] font-medium text-zinc-600 mb-1.5">سوال‌های شفاف‌کننده <span className="text-zinc-500 font-normal">(هر مورد در یک خط)</span></div>
                <textarea
                  value={form.clarifying_questions}
                  onChange={(e) => setForm((f) => ({ ...f, clarifying_questions: e.target.value }))}
                  rows={3}
                  dir="rtl"
                  className={field}
                />
              </div>

              {/* read-only reference */}
              {(selAnswer.required_tools?.length > 0 || selAnswer.escalate_when?.length > 0) && (
                <div className="rounded-lg bg-black/[0.04] ring-1 ring-black/10 px-3 py-3 space-y-3">
                  {selAnswer.required_tools?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1">ابزارهای لازم (فقط‌خواندنی)</div>
                      <div className="text-[12px] text-zinc-600 leading-6">{selAnswer.required_tools.join("، ")}</div>
                    </div>
                  )}
                  {selAnswer.escalate_when?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1">چه زمانی ارجاع به انسان (فقط‌خواندنی)</div>
                      <ul className="space-y-1">
                        {selAnswer.escalate_when.map((x, i) => (
                          <li key={i} className="text-[12px] text-zinc-600 leading-6 flex gap-2">
                            <span className="text-zinc-500 shrink-0">•</span>
                            <span>{x}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* actions */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={busy}
                  className="rounded-lg bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-50 px-4 py-1.5 text-[12px] font-medium text-black"
                >
                  {busy ? "…" : "ذخیره"}
                </button>
                <button
                  onClick={close}
                  className="rounded-lg bg-black/[0.04] hover:bg-black/[0.07] px-3 py-1.5 text-[12px] text-zinc-600 ring-1 ring-black/10"
                >
                  بستن
                </button>
                {saved && (
                  <span className="text-[12px] text-emerald-700">
                    ✓ ذخیره شد <span className="text-zinc-500">— بعد از ری‌استارتِ کانکتور رو باتِ زنده اعمال می‌شه</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
