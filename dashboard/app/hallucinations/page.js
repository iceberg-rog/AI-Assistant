"use client";
import { useEffect, useState } from "react";
import { PageHeader, Stat, Card } from "@/components/ui";
import hcaught from "@/data/hallucinations_caught.json";

// real fabrications the adversarial KB-build verification caught (and fixed) — not a hardcoded "0"
const CAUGHT = hcaught.by_intent || [];
const CAUGHT_TOTAL = CAUGHT.reduce((a, e) => a + (e.count || (e.items || []).length || 0), 0);

const timeHM = (iso) => {
  if (!iso) return "—";
  if (typeof iso === "string" && iso.length >= 16 && iso[10] === "T") return iso.slice(11, 16);
  try { return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
};
const dateFa = (iso) => { try { return new Date(iso).toLocaleDateString("fa-IR"); } catch { return ""; } };

// Static checklist of the guardrails the system enforces.
const GUARDRAILS = [
  "هرگز قیمت/تعداد کاربر/آیپیِ DNS رو از خودش نمی‌سازه — به ربات/سایت ارجاع می‌ده",
  "فقط حقایقِ DB/KB رو می‌گه — اشتراک/آیپی فقط از users.db",
  "اگه مطمئن نباشه، به‌جای حدس به انسان ارجاع می‌ده",
  "پیامِ <۷۰٪ اطمینان رو کلود دوباره می‌خونه؛ بازم پایین بود → انسان",
];

const ROUTE = {
  manager: { fa: "مدیر", desc: "تصمیمِ مالی/حساس → به مدیر می‌ره" },
  human: { fa: "پشتیبانِ انسانی", desc: "نیاز به بررسیِ انسانی" },
};
const routeFa = (r) => ROUTE[r]?.fa || r || "انسان";

// The displayed "فحاشی" label is sometimes a false-positive of the FAST classifier; Claude's
// `reason` is the source of truth. Flag when the label says profanity but the reason doesn't.
const reasonIsProfanity = (r) => /فحاش|توهین|profan|insult/i.test(r || "");
const labelMismatch = (e) => e?.intentId === "abuse_profanity" && e?.reason && !reasonIsProfanity(e.reason);

export default function HallucinationsPage() {
  const [escs, setEscs] = useState([]);
  const [threads, setThreads] = useState({}); // telegramId -> thread[]
  const [processed, setProcessed] = useState(0);
  const [sel, setSel] = useState(null); // selected escalation id (modal)

  const load = async () => {
    try {
      const [er, cr] = await Promise.all([
        fetch("/api/escalations", { cache: "no-store" }),
        fetch("/api/conversations", { cache: "no-store" }),
      ]);
      const ed = await er.json();
      const cd = await cr.json();
      setEscs(ed.items || []);
      const tmap = {}; let p = 0;
      for (const u of cd.users || []) {
        const tid = u.user?.telegramId ?? u.telegramId;
        tmap[String(tid)] = u.thread || [];
        p += (u.thread || []).length;
      }
      setThreads(tmap); setProcessed(p);
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 6000);
    return () => clearInterval(t);
  }, []);

  const cases = [...escs].sort((a, b) => ((a.at || a.createdAt) < (b.at || b.createdAt) ? 1 : -1));
  const openCount = cases.filter((c) => !c.resolved).length;
  const selEsc = sel ? cases.find((c) => c.id === sel) : null;
  const selThread = selEsc ? threads[String(selEsc.telegramId)] || [] : [];

  return (
    <div>
      <PageHeader
        kicker="ANTI-HALLUCINATION"
        title="گاردریل‌های ضدِ توهم"
        sub="سیستم طوری ساخته شده که فکتِ جعلی نگه. این صفحه نشون می‌ده گاردریل‌ها فعالن و کجا جلوی حدس‌زدن گرفته شده."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="گاردریل‌های فعال" value={GUARDRAILS.length} accent="emerald" />
        <Stat label="ارجاع‌به‌انسان" value={cases.length} accent="amber" hint={`${openCount} باز`} />
        <Stat label="پیام‌های پردازش‌شده" value={processed} accent="sky" />
        <Stat label="توهماتِ گرفته‌شده (ساختِ KB)" value={CAUGHT_TOTAL} hint="در بازبینیِ خصمانه گرفته و اصلاح شد" accent="emerald" />
      </div>

      {/* Guardrail rules — static checklist of what the system enforces */}
      <div className="text-[11px] font-semibold tracking-wide text-zinc-500 mb-2">گاردریل‌هایی که سیستم اجبار می‌کنه</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {GUARDRAILS.map((g, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 grid place-items-center text-emerald-700 text-[13px] shrink-0 mt-0.5">✓</span>
              <div className="min-w-0">
                <div className="text-[13px] text-zinc-700 leading-7">{g}</div>
                <div className="mt-1 text-[10px] text-emerald-700">گاردریل فعال</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Real fabrications caught + fixed during the adversarial KB build (from hallucinations_caught.json) */}
      {CAUGHT.length > 0 && (
        <>
          <div className="text-[11px] font-semibold tracking-wide text-zinc-500 mb-2">توهماتی که هنگامِ ساختِ KB گرفته و اصلاح شدند ({CAUGHT_TOTAL})</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {CAUGHT.map((c, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="text-[12px] text-zinc-800">{c.fa_label || c.intent}</div>
                  <span className="text-[11px] rounded-md bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/25 px-2 py-0.5 shrink-0">{c.count || (c.items || []).length} مورد</span>
                </div>
                {(c.items || []).slice(0, 2).map((it, n) => (
                  <div key={n} className="text-[11px] text-zinc-500 leading-6 mt-1">• {String(it).slice(0, 160)}</div>
                ))}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Real caught cases — system deferred to a human instead of fabricating */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[11px] font-semibold tracking-wide text-zinc-500">مواردی که به‌جای حدس‌زدن به انسان سپرده شد</div>
        <div className="text-[10px] text-zinc-400">برای دیدنِ جزئیات روی هر ردیف کلیک کن</div>
      </div>
      <div className="rounded-xl border border-black/10 overflow-hidden">
        <div className="hidden md:flex items-center gap-3 px-4 py-2 text-[10px] text-zinc-500 bg-black/[0.035] border-b border-black/10">
          <div className="w-[200px]">کاربر</div>
          <div className="flex-1">پیامِ کاربر</div>
          <div className="w-[150px]">ارجاع به</div>
          <div className="w-[55px] text-center">زمان</div>
          <div className="w-[20px]" />
        </div>
        {cases.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className="w-full text-right flex flex-wrap md:flex-nowrap items-center gap-3 px-4 py-3 border-b border-black/[0.08] last:border-b-0 hover:bg-black/[0.04] transition"
          >
            <div className="w-[200px] flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-amber-500/15 ring-1 ring-amber-500/25 grid place-items-center text-[12px] text-amber-700 shrink-0">{(c.user?.name || "?").trim().slice(0, 1)}</div>
              <div className="min-w-0">
                <div className="text-[13px] text-zinc-900 truncate">{c.user?.name || "کاربر"}</div>
                <div className="text-[10px] text-zinc-500 ltr truncate">tg{c.telegramId}{c.username ? " · " + c.username : ""}</div>
              </div>
            </div>
            <div className="flex-1 min-w-0 text-[12px] text-zinc-700 leading-6">
              <span className="line-clamp-1">{c.lastMessage || <span className="text-zinc-400">—</span>}</span>
              <span className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-zinc-500">{c.faLabel}</span>
                {labelMismatch(c) && <span className="text-[9px] text-rose-600 bg-rose-500/10 ring-1 ring-rose-500/20 rounded px-1">برچسب مشکوک</span>}
                {c.resolved && <span className="text-[9px] text-emerald-600">· حل‌شده ✓</span>}
              </span>
            </div>
            <div className="w-[150px]">
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] ring-1 ${c.routeTo === "manager" ? "bg-violet-500/15 text-violet-700 ring-violet-500/30" : "bg-amber-500/15 text-amber-700 ring-amber-500/30"}`}>↗ {routeFa(c.routeTo)}</span>
            </div>
            <div className="w-[55px] text-center text-[10px] text-zinc-500 ltr">{timeHM(c.at || c.createdAt)}</div>
            <div className="w-[20px] text-zinc-300 text-center">‹</div>
          </button>
        ))}
        {cases.length === 0 && (
          <div className="text-sm text-zinc-500 py-12 text-center leading-7">هنوز موردی نبوده — یعنی بات تا الان جوابِ مطمئن داده ✅</div>
        )}
      </div>

      {/* ── DETAIL MODAL ── */}
      {selEsc && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-3 md:p-6 bg-black/30 backdrop-blur-sm overflow-y-auto" onClick={() => setSel(null)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-black/10 shadow-2xl my-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
            {/* header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-amber-500/15 ring-1 ring-amber-500/25 grid place-items-center text-[15px] text-amber-700 shrink-0">{(selEsc.user?.name || "?").trim().slice(0, 1)}</div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-zinc-900 truncate">{selEsc.user?.name || "کاربر"}</div>
                  <div className="text-[11px] text-zinc-500 ltr truncate">tg{selEsc.telegramId}{selEsc.username ? " · " + selEsc.username : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] rounded-md px-2 py-1 ring-1 ${selEsc.resolved ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30" : "bg-rose-500/15 text-rose-700 ring-rose-500/30"}`}>{selEsc.resolved ? "حل‌شده ✓" : "باز"}</span>
                <button onClick={() => setSel(null)} className="h-8 w-8 grid place-items-center rounded-lg text-zinc-500 hover:bg-black/5 text-lg">×</button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* user message */}
              <div>
                <div className="text-[10px] font-medium text-zinc-500 mb-1.5">پیامِ کاربر</div>
                <div className="rounded-xl bg-black/[0.03] ring-1 ring-black/[0.06] px-4 py-3 text-[14px] text-zinc-900 leading-7">{selEsc.lastMessage || "—"}</div>
              </div>

              {/* classification + route */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl ring-1 ring-black/[0.06] px-4 py-3">
                  <div className="text-[10px] font-medium text-zinc-500 mb-1">طبقه‌بندیِ سیستم</div>
                  <div className="text-[13px] text-zinc-900">{selEsc.faLabel || "—"}</div>
                  <div className="text-[10px] text-zinc-400 ltr font-mono mt-0.5">{selEsc.intentId}</div>
                </div>
                <div className="rounded-xl ring-1 ring-black/[0.06] px-4 py-3">
                  <div className="text-[10px] font-medium text-zinc-500 mb-1">ارجاع به</div>
                  <div className={`text-[13px] ${selEsc.routeTo === "manager" ? "text-violet-700" : "text-amber-700"}`}>↗ {routeFa(selEsc.routeTo)}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{ROUTE[selEsc.routeTo]?.desc || ""}</div>
                </div>
              </div>

              {/* label-mismatch warning */}
              {labelMismatch(selEsc) && (
                <div className="rounded-xl bg-rose-500/[0.07] ring-1 ring-rose-500/25 px-4 py-3 text-[12px] text-rose-800 leading-6">
                  ⚠ <b>برچسب با دلیل نمی‌خونه.</b> طبقه‌بندیِ خودکار «فحاشی و توهین» زده، ولی دلیلِ واقعی (پایین) دربارهٔ موضوعِ دیگه‌ایه. این یعنی classifierِ سریع اشتباه برچسب زده و <b>دلیلِ کلود معتبرتره</b>.
                </div>
              )}

              {/* the REASON — why it was deferred to a human (the key field) */}
              <div>
                <div className="text-[10px] font-medium text-zinc-500 mb-1.5">چرا به‌جای حدس‌زدن به انسان سپرده شد</div>
                <div className="rounded-xl bg-amber-500/[0.08] ring-1 ring-amber-500/25 px-4 py-3 text-[13px] text-zinc-800 leading-7" dir="auto">{selEsc.reason || "—"}</div>
              </div>

              {/* full thread context */}
              {selThread.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1.5">مکالمه‌ی کامل ({selThread.length} پیام)</div>
                  <div className="rounded-xl ring-1 ring-black/[0.06] divide-y divide-black/[0.05] max-h-64 overflow-y-auto">
                    {selThread.map((m, i) => (
                      <div key={i} className="px-3 py-2">
                        <div className="flex items-center justify-between text-[9px] text-zinc-400 ltr mb-1">
                          <span>{m.faLabel || ""}</span>
                          <span>{timeHM(m.receivedAt)}</span>
                        </div>
                        <div className="text-[12px] text-zinc-800 leading-6">{m.kind && m.kind !== "text" ? (m.kind === "photo" ? "🖼 " : "🎤 ") : ""}{m.inbound || "—"}</div>
                        {m.reply && <div className="mt-1 text-[11px] text-sky-700 bg-sky-500/[0.06] ring-1 ring-sky-500/15 rounded-lg px-2.5 py-1.5 leading-6">درافِ بات: {m.reply}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* time footer */}
              <div className="text-[10px] text-zinc-400 ltr text-left pt-1">{dateFa(selEsc.at || selEsc.createdAt)} · {timeHM(selEsc.at || selEsc.createdAt)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
