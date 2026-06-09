import fs from "node:fs";
import path from "node:path";
import { Card, PageHeader, Stat } from "@/components/ui";
import { isRealConv } from "@/lib/data";
import taxonomy from "@/data/intents_taxonomy.json";

export const dynamic = "force-dynamic";

// map the system intent id -> its Persian label, so the UI never shows raw English ids
const FA = Object.fromEntries((taxonomy.intents || []).map((i) => [i.id, i.fa_label]));
const faLabel = (id) => FA[id] || id || "—";

function read() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "learning_queue.json"), "utf8")).items || [];
  } catch {
    return [];
  }
}

const ACT = {
  approved: { label: "تأیید بدون تغییر", dot: "bg-emerald-500", cls: "text-emerald-700 bg-emerald-500/15 ring-emerald-500/30" },
  edited: { label: "ویرایش‌شده", dot: "bg-amber-500", cls: "text-amber-700 bg-amber-500/15 ring-amber-500/30" },
  rejected: { label: "رد", dot: "bg-rose-500", cls: "text-rose-700 bg-rose-500/15 ring-rose-500/30" },
};
const hm = (iso) => (iso ? iso.slice(11, 16) : "—");
const ymd = (iso) => (iso ? iso.slice(0, 10) : "—");

export default function LearningPage() {
  const items = read().filter((it) => isRealConv(it.conversationId)); // exclude test/junk convs from every stat + chart
  const total = items.length;
  const count = (a) => items.filter((x) => x.action === a).length;
  const approved = count("approved");
  const edited = count("edited");
  const rejected = count("rejected");
  const pct = (n) => (total ? Math.round((100 * n) / total) : 0);

  // per-intent weakness = (edited + rejected) / total for that intent
  const byIntent = {};
  for (const it of items) {
    const k = (it.intent || "").trim();
    if (!k) continue; // no phantom "—" weakness row from a missing intent
    byIntent[k] = byIntent[k] || { approved: 0, edited: 0, rejected: 0, total: 0 };
    byIntent[k][it.action] = (byIntent[k][it.action] || 0) + 1;
    byIntent[k].total++;
  }
  const weak = Object.entries(byIntent)
    .map(([k, v]) => ({ intent: k, ...v, weakRate: v.total ? Math.round((100 * (v.edited + v.rejected)) / v.total) : 0 }))
    .sort((a, b) => b.weakRate - a.weakRate || b.total - a.total);

  return (
    <div>
      <PageHeader
        kicker="CONTROLLED LEARNING"
        title="یادگیری از اپراتور"
        sub="هر تأیید/ویرایش/ردِ تو ثبت می‌شه. «ویرایش» یعنی تو بات رو اصلاح کردی = بهترین داده برای بهتر کردنِ KB."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کلِ اقدام‌ها" value={total} />
        <Stat label="تأیید بدون تغییر" value={approved} accent="emerald" hint={total ? `${pct(approved)}٪ — بات درست بود` : ""} />
        <Stat label="ویرایش‌شده" value={edited} accent="amber" hint="بهترین داده‌ی آموزشی" />
        <Stat label="رد" value={rejected} accent="rose" hint={total ? `${pct(rejected)}٪ — دراف غلط بود` : ""} />
      </div>

      {/* gold-signal callout — edits are the most valuable training data */}
      {edited > 0 && (
        <Card className="p-4 mb-4 ring-1 ring-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 text-[15px]">✎</div>
            <div className="text-[13px] leading-6 text-zinc-700">
              <span className="font-semibold text-zinc-900">{edited} مورد</span> رو اپراتور دستی اصلاح کرده. این‌ها طلاترین داده‌ی آموزشی‌اند —
              مقایسه‌ی «درافِ بات» با «آنچه اپراتور فرستاد» دقیقاً نشون می‌ده KB باید کجا اصلاح بشه.
            </div>
          </div>
        </Card>
      )}

      {total === 0 && (
        <Card className="p-8 text-center">
          <div className="text-3xl mb-3">🌱</div>
          <div className="text-sm text-zinc-700 leading-7 max-w-md mx-auto">
            هنوز اقدامی ثبت نشده. در «صف تأیید» وقتی دراف رو تأیید/ویرایش/رد کنی، اینجا انباشته می‌شه.
          </div>
        </Card>
      )}

      {/* weakness by intent */}
      {weak.length > 0 && (
        <Card className="p-5 mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-sm font-semibold text-zinc-900">ضعفِ بات بر حسب موضوع</div>
            <div className="text-[11px] text-zinc-500">نرخِ ویرایش+رد — بیشترین اول</div>
          </div>
          <p className="text-[12px] text-zinc-500 leading-6 mb-4">
            هر موضوعی که نوارش بلندتره، یعنی بات اونجا بیشتر اشتباه کرده و KB همون‌جا باید بهتر بشه.
          </p>
          <div className="space-y-2.5">
            {weak.map((w) => {
              const ok = w.weakRate === 0;
              return (
                <div key={w.intent} className="flex items-center gap-3">
                  <div className="w-52 text-[12px] text-zinc-800 shrink-0 truncate" dir="rtl" title={w.intent}>{faLabel(w.intent)}</div>
                  <div className="flex-1 h-5 rounded-md bg-black/[0.04] ring-1 ring-black/[0.04] overflow-hidden" dir="ltr">
                    <div
                      className={`h-full rounded-md ${ok ? "bg-emerald-500/40" : "bg-gradient-to-r from-amber-500/55 to-rose-500/70"}`}
                      style={{ width: `${ok ? 4 : Math.max(w.weakRate, 6)}%` }}
                    />
                  </div>
                  <div className="w-32 text-left shrink-0">
                    <span className={`text-[12px] font-semibold tabular-nums ${ok ? "text-emerald-700" : w.weakRate >= 50 ? "text-rose-700" : "text-amber-700"}`}>{w.weakRate}٪</span>
                    <span className="text-[11px] text-zinc-500 tabular-nums"> از {w.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* item list */}
      {total > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-zinc-900 px-1">تاریخچه‌ی اقدام‌ها</div>
          {items.map((it, i) => {
            const a = ACT[it.action] || { label: it.action, dot: "bg-zinc-400", cls: "text-zinc-700 bg-zinc-500/15 ring-zinc-500/30" };
            const showDate = i === 0 || ymd(items[i - 1].at) !== ymd(it.at);
            return (
              <div key={i}>
                {showDate && (
                  <div className="text-[11px] text-zinc-500 ltr text-left px-1 pt-1 pb-1 tabular-nums">{ymd(it.at)}</div>
                )}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[12px] text-zinc-600 truncate" dir="rtl" title={it.intent}>{faLabel(it.intent)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-zinc-500 ltr tabular-nums">{hm(it.at)}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${a.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
                        {a.label}
                      </span>
                    </div>
                  </div>

                  {it.action === "edited" ? (
                    <div className="grid md:grid-cols-2 gap-2">
                      <div className="rounded-lg bg-rose-500/[0.07] ring-1 ring-rose-500/20 px-3 py-2.5">
                        <div className="text-[10px] font-medium text-rose-700/80 mb-1.5">درافِ بات</div>
                        <div className="text-[13px] text-zinc-600 leading-7 whitespace-pre-wrap line-through decoration-rose-400/40 decoration-1">{it.botDraft}</div>
                      </div>
                      <div className="rounded-lg bg-emerald-500/[0.08] ring-1 ring-emerald-500/25 px-3 py-2.5">
                        <div className="text-[10px] font-medium text-emerald-700/90 mb-1.5">آنچه اپراتور فرستاد ✓</div>
                        <div className="text-[13px] text-zinc-900 leading-7 whitespace-pre-wrap">{it.sentText}</div>
                      </div>
                    </div>
                  ) : it.action === "rejected" ? (
                    <div className="rounded-lg bg-rose-500/[0.07] ring-1 ring-rose-500/20 px-3 py-2.5">
                      <div className="text-[10px] font-medium text-rose-700/80 mb-1.5">درافِ ردشده</div>
                      <div className="text-[13px] text-zinc-600 leading-7 whitespace-pre-wrap">{it.botDraft || "—"}</div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-black/[0.025] ring-1 ring-black/[0.06] px-3 py-2.5">
                      <div className="text-[10px] font-medium text-emerald-700/70 mb-1.5">ارسال‌شده ✓</div>
                      <div className="text-[13px] text-zinc-600 leading-7 whitespace-pre-wrap">{it.sentText || it.botDraft || "—"}</div>
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
