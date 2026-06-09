import fs from "node:fs";
import path from "node:path";
import { Card, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

function readReport() {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "selftest_report.json"), "utf8")); }
  catch { return null; }
}
const pct = (x) => (x == null ? "—" : (100 * x).toFixed(1) + "%");
const fmt = (iso) => { try { return new Date(iso).toLocaleString("fa-IR"); } catch { return iso; } };

export default function SelfTestPage() {
  const r = readReport();
  return (
    <div>
      <PageHeader
        kicker="CORE — SELF-TEST"
        title="خودآزمایی کیفیت (روی داده‌ی واقعی)"
        sub="هزاران سوالِ واقعیِ مشتری‌ها از اکسپورتِ ۷ ماهه، از کلِ پایپلاین رد می‌شه و کیفیتِ جواب سنجیده می‌شه. اجرا: node core/selftest/run.ts (با --judge وقتی کلید کلود هست)."
      />

      {!r ? (
        <Card className="p-6">
          <div className="text-sm text-zinc-500 leading-7">
            هنوز گزارشی نیست. برای ساختنش این رو اجرا کن:
            <pre className="mt-2 rounded-lg bg-zinc-50 p-3 text-[12px] text-emerald-600/90 ltr">node core/selftest/run.ts</pre>
            و با کلیدِ کلود برای سنجشِ کیفیت:
            <pre className="mt-2 rounded-lg bg-zinc-50 p-3 text-[12px] text-emerald-600/90 ltr">CLAUDE_API_KEY=sk-... node core/selftest/run.ts --judge --limit 300</pre>
          </div>
        </Card>
      ) : (
        <>
          <Card className={`p-3 mb-4 ${r.claude ? "border-emerald-500/20" : "border-amber-500/20"}`}>
            <div className="flex items-center justify-between text-[12px]">
              <span className={r.claude ? "text-emerald-700" : "text-amber-700"}>
                {r.claude ? `Claude روشن (${r.model})` : "Claude خاموش — این خطِ پایه‌ی regex است (کلید بده تا دمِ <۷۰٪ با کلود حل بشه)"}
              </span>
              <span className="text-zinc-500 ltr">{fmt(r.generatedAt)}{r.floor != null ? ` · floor ${r.floor}` : ""}</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {r.judge ? (
              // real-Q&A runs have no fine-intent ground truth → show the meaningful judged quality, not a misleading 0%
              <Stat label="کیفیتِ جواب (داورِ کلود)" value={`${r.judge.avgScore} / ۵`} hint={`${r.judge.okRate}٪ قابل‌قبول (≥۴) · n=${r.judge.n}`} accent={r.judge.avgScore >= 4 ? "emerald" : "amber"} />
            ) : (
              <Stat label="دقتِ intent (لیبلِ دقیق)" value={r.accuracy?.fine ? pct(r.accuracy.fine) : "—"} accent="emerald" />
            )}
            <Stat label="other_unclear (گیج‌زدن)" value={pct(r.health?.otherUnclearRate)} accent={r.health?.otherUnclearRate > 0.1 ? "amber" : "emerald"} />
            <Stat label="جوابِ بن‌بست" value={pct(r.health?.deadEndRate)} accent={r.health?.deadEndRate > 0.02 ? "amber" : "emerald"} />
            <Stat label="ارجاع به انسان" value={pct(r.health?.escalateRate)} accent="sky" />
          </div>

          <div className="grid lg:grid-cols-2 gap-3 mb-4">
            <Card className="p-4">
              <div className="text-[11px] text-zinc-500 mb-2">سلامتِ پوشش</div>
              <Row k="رفتن به کلود (دمِ <floor)" v={pct(r.health?.claudeRate)} />
              {Object.keys(r.confidenceDist || {}).length > 0 && <Row k="توزیع اطمینان" v={Object.entries(r.confidenceDist).map(([a, b]) => `${a}:${b}`).join("  ")} />}
              {Object.keys(r.actionDist || {}).length > 0 && <Row k="توزیع اقدام" v={Object.entries(r.actionDist).map(([a, b]) => `${a}:${b}`).join("  ")} />}
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-zinc-500 mb-2">کیفیتِ جواب (داورِ کلود)</div>
              {r.judge ? (
                <>
                  <Row k="میانگین نمره (۱–۵)" v={String(r.judge.avgScore)} />
                  <Row k="قابل‌قبول (≥۴)" v={r.judge.okRate + "%"} />
                  <Row k="نمونه‌های داوری‌شده" v={String(r.judge.n)} />
                </>
              ) : (
                <div className="text-[12px] text-zinc-500 leading-6">برای نمره‌ی کیفیت، با کلیدِ کلود و <span className="ltr">--judge</span> اجرا کن.</div>
              )}
            </Card>
          </div>

          {r.judge?.worst?.length > 0 && (
            <Card className="p-4 mb-4 border-amber-500/15">
              <div className="text-[11px] text-amber-600/80 mb-2">ضعیف‌ترین جواب‌ها (نمره ≤۲)</div>
              <div className="space-y-1.5">
                {r.judge.worst.map((w, i) => (
                  <div key={i} className="text-[11px] text-zinc-500"><span className="text-amber-400">{w.score}</span> «{w.q}» → «{w.reply}» <span className="text-zinc-500">— {w.issue}</span></div>
                ))}
              </div>
            </Card>
          )}

          {r.sampleMisses?.length > 0 && (
            <Card className="p-4">
              <div className="text-[11px] text-zinc-500 mb-2">نمونه خطاهای intent (که کلود باید درست کنه)</div>
              <div className="space-y-1">
                {r.sampleMisses.map((m, i) => (
                  <div key={i} className="text-[11px] text-zinc-500">«{m.q.slice(0, 50)}» → <span className="text-amber-600">{m.got}</span> (می‌خواست {m.want}) <span className="text-zinc-500 ltr">c{m.conf?.toFixed?.(2)}</span></div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-black/[0.08] last:border-0">
      <span className="text-[12px] text-zinc-500 shrink-0">{k}</span>
      <span className="text-[12px] text-zinc-800 ltr text-left">{v}</span>
    </div>
  );
}
