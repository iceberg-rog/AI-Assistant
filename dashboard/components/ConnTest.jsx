"use client";
import { useState } from "react";
import { Card } from "@/components/ui";

const TESTS = [
  { key: "telegram", label: "تلگرام (بات)", hint: "getMe" },
  { key: "claude", label: "مغزِ Claude", hint: "تستِ رایگانِ /models — بدونِ مصرفِ اعتبار" },
  { key: "usersDb", label: "DBِ کاربران", hint: "SELECT (فقط‌خواندنی)" },
  { key: "ipWhitelist", label: "وایت‌لیستِ آیپی", hint: "getallips" },
];

export default function ConnTest() {
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState(null); // { telegram, claude, usersDb, ipWhitelist }
  const [err, setErr] = useState("");

  async function run() {
    setRunning(true); setErr(""); setRes(null);
    try {
      const r = await fetch("/api/conntest", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) setRes(d); else setErr(d.error || "خطا");
    } catch { setErr("اتصال برقرار نشد"); }
    setRunning(false);
  }

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-zinc-900">تستِ اتصالِ همه‌چیز</div>
          <p className="text-[12px] text-zinc-500 leading-6">هر چهار اتصال را زنده تست می‌کند. تستِ Claude رایگان است و اعتبار مصرف نمی‌کند.</p>
        </div>
        <button onClick={run} disabled={running} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] px-4 py-2 disabled:opacity-50 shrink-0">
          {running ? "در حال تست…" : "▶ تست اتصال"}
        </button>
      </div>

      {err && <div className="rounded-lg bg-rose-500/[0.07] ring-1 ring-rose-500/25 px-3 py-2 text-[12px] text-rose-800">⚠ {err}</div>}

      <div className="rounded-xl border border-black/10 overflow-hidden">
        {TESTS.map((t) => {
          const r = res?.[t.key];
          const state = !res ? "idle" : r?.ok ? "ok" : "fail";
          return (
            <div key={t.key} className="flex items-center gap-3 px-3 py-2.5 border-b border-black/[0.07] last:border-b-0">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${state === "ok" ? "bg-emerald-500" : state === "fail" ? "bg-rose-500" : "bg-zinc-300"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-zinc-900">{t.label}</div>
                <div className="text-[10px] text-zinc-500 ltr truncate">
                  {state === "idle" ? t.hint : r?.ok ? r.detail || "سالم" : "خطا: " + (r?.error || "—")}
                </div>
              </div>
              {state !== "idle" && r && (
                <span className={`text-[11px] tabular-nums shrink-0 ${r.ok ? "text-emerald-700" : "text-rose-700"}`}>
                  {r.ok ? "سالم ✓" : "خراب ✗"} <span className="text-zinc-400 ltr">{r.ms}ms</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {res?.at && <div className="text-[10px] text-zinc-400 ltr text-left mt-2">{res.at.slice(11, 19)}</div>}
    </Card>
  );
}
