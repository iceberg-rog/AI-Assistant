"use client";
import { useEffect, useState } from "react";
import { PageHeader, Card, Stat } from "@/components/ui";
import dnsRegistry from "@/data/dns_registry.json";

const dnsServers = dnsRegistry.dns_servers || []; // REAL Shelter DNS IPs — operator-entered, no guesses
const fmt = (n) => Number(n || 0).toLocaleString("fa-IR");
const isV4 = (s) => { const p = String(s || "").trim().split("."); return p.length === 4 && p.every((o) => /^\d{1,3}$/.test(o) && +o <= 255); };

function IpChip({ ip }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(ip); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} }}
      title="برای کپی کلیک کن"
      className={`ltr font-mono text-[12px] rounded-md px-2 py-1 ring-1 ring-inset transition ${copied ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30" : "bg-black/[0.04] text-zinc-700 ring-black/10 hover:bg-black/[0.07]"}`}
    >
      {copied ? "کپی شد ✓" : ip}
    </button>
  );
}

export default function DnsPage() {
  const [status, setStatus] = useState(null); // {total, systemIp, systemRegistered}
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // {ip, registered}

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/ipcheck", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) { setStatus(d); setErr(""); } else setErr(d.error || "خطا در خواندنِ وایت‌لیست");
    } catch { setErr("اتصال به سرویس برقرار نشد"); }
  };
  useEffect(() => { loadStatus(); const t = setInterval(() => { if (document.visibilityState === "visible") loadStatus(); }, 30000); return () => clearInterval(t); }, []);

  async function check(e) {
    e?.preventDefault?.();
    const ip = q.trim();
    if (!isV4(ip)) { setResult({ bad: true }); return; }
    setChecking(true); setResult(null);
    try {
      const r = await fetch(`/api/ipcheck?ip=${encodeURIComponent(ip)}`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok) setResult({ ip: d.ip, registered: d.registered }); else setResult({ error: d.error || "خطا" });
    } catch { setResult({ error: "اتصال برقرار نشد" }); }
    setChecking(false);
  }

  return (
    <div>
      <PageHeader
        kicker="DNS REGISTRY"
        title="رجیستری DNS"
        sub="فقط دادهٔ واقعی: وایت‌لیستِ زندهٔ آی‌پیِ ثبت‌شده (از getallips، فقط‌خواندنی) + لیستِ واقعیِ DNS که اپراتور وارد می‌کند. هیچ آی‌پیِ حدسی‌ای اینجا نیست."
      />

      {err && (
        <div className="rounded-xl bg-rose-500/[0.07] ring-1 ring-rose-500/25 px-4 py-3 mb-4 text-[13px] text-rose-800">⚠ {err}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کلِ آی‌پیِ ثبت‌شده" value={status ? fmt(status.total) : "…"} hint="زنده از getallips" accent="emerald" />
        <Stat label="آی‌پیِ این سیستم" value={status?.systemIp || "…"} accent="sky" />
        <Stat
          label="وضعیتِ ثبتِ سیستم"
          value={status == null ? "…" : status.systemRegistered == null ? "نامشخص" : status.systemRegistered ? "ثبت‌شده ✅" : "ثبت‌نشده ❌"}
          accent={status?.systemRegistered ? "emerald" : "amber"}
        />
        <Stat label="DNSهای واقعیِ واردشده" value={fmt(dnsServers.length)} hint={dnsServers.length ? "" : "هنوز خالی"} />
      </div>

      {/* IP checker — the real, useful tool (#1 support question) */}
      <Card className="p-5 mb-4">
        <div className="text-sm font-semibold text-zinc-900 mb-1">آیا یک آی‌پی ثبت‌شده؟</div>
        <p className="text-[12px] text-zinc-500 leading-6 mb-3">آی‌پیِ عمومیِ کاربر را وارد کن تا زنده در وایت‌لیست چک شود (همان سؤالِ همیشگیِ «چرا وصل نمی‌شم؟»).</p>
        <form onSubmit={check} className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} dir="ltr" placeholder="مثلاً 37.251.86.112" className="search-input w-full sm:w-72 ltr font-mono" />
          <button type="submit" disabled={checking} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] px-4 py-2 disabled:opacity-50">{checking ? "در حال چک…" : "چک کن"}</button>
        </form>
        {result && (
          <div className="mt-3 text-[13px]">
            {result.bad ? (
              <span className="text-amber-700">قالبِ آی‌پی درست نیست (مثلاً 1.2.3.4).</span>
            ) : result.error ? (
              <span className="text-rose-700">⚠ {result.error}</span>
            ) : (
              <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 ${result.registered ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30" : "bg-rose-500/10 text-rose-700 ring-rose-500/25"}`}>
                <span className="ltr font-mono">{result.ip}</span>
                <span>{result.registered ? "ثبت‌شده ✅" : "ثبت‌نشده ❌ — باید از ربات «ثبت آیپی» کنه"}</span>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* system IP status (the operator asked: is THIS system registered?) */}
      <Card className="p-5 mb-4">
        <div className="text-sm font-semibold text-zinc-900 mb-2">وضعیتِ آی‌پیِ این سیستم</div>
        {status?.systemIp ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="ltr font-mono bg-black/[0.04] ring-1 ring-black/10 rounded-md px-2 py-1">{status.systemIp}</span>
            <span className={status.systemRegistered ? "text-emerald-700" : "text-amber-700"}>
              {status.systemRegistered ? "در وایت‌لیست ثبت‌شده ✅" : "در وایت‌لیست نیست ❌"}
            </span>
            {!status.systemRegistered && (
              <span className="text-[11px] text-zinc-500 leading-6">— ثبتِ آی‌پی یک عملِ «نوشتن» روی وایت‌لیستِ احراز است و از طریقِ ربات انجام می‌شود؛ سیستم اینجا فقط می‌تواند وضعیت را «بخواند»، نه ثبت کند.</span>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-zinc-500">آی‌پیِ عمومیِ سیستم در دسترس نیست.</div>
        )}
      </Card>

      {/* REAL DNS server list — operator-entered; empty until provided (no fabrication) */}
      <div className="text-[11px] font-semibold tracking-wide text-zinc-500 mb-2">آی‌پی‌های واقعیِ DNS شلتر</div>
      <Card className="p-5">
        {dnsServers.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-[13px] text-zinc-700 leading-7 max-w-md mx-auto">
              هنوز لیستِ واقعیِ DNS وارد نشده. آی‌پی‌های واقعیِ DNSِ شلتر (آن‌هایی که به کاربر می‌دهید) را بده تا دقیقاً همان‌ها — بدونِ هیچ حدسی — اینجا نشان داده شوند.
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dnsServers.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <IpChip ip={typeof d === "string" ? d : d.ip} />
                {typeof d !== "string" && d.label && <span className="text-[11px] text-zinc-500">{d.label}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
