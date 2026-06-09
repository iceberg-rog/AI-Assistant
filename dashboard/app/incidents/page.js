"use client";
import { useEffect, useState } from "react";
import taxonomy from "@/data/intents_taxonomy.json";

const INTENTS = (taxonomy.intents || []).map((i) => ({ id: i.id, fa: i.fa_label }));
const fmt = (iso) => { try { return new Date(iso).toLocaleString("fa-IR"); } catch { return iso; } };

export default function IncidentsPage() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [keywords, setKeywords] = useState("");
  const [intents, setIntents] = useState([]);
  const [scope, setScope] = useState("match");
  const [mode, setMode] = useState("prepend");
  const [hours, setHours] = useState(24);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => fetch("/api/incidents").then((r) => r.json()).then((d) => setList(d.incidents || []));
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, []);

  const toggleIntent = (id) => setIntents((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function submit() {
    if (!msg.trim()) return;
    setBusy(true);
    await fetch("/api/incidents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: msg, keywords, intents, scope, mode, hours: Number(hours), note }),
    });
    setMsg(""); setKeywords(""); setIntents([]); setNote(""); setBusy(false); refresh();
  }
  async function end(id, hard) { await fetch(`/api/incidents?id=${id}&mode=${hard ? "delete" : "expire"}`, { method: "DELETE" }); refresh(); }

  const active = list.filter((i) => i.active);
  const past = list.filter((i) => !i.active);

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] tracking-widest text-emerald-600/70 mb-1">CORE — INCIDENT INJECTION</div>
        <h1 className="text-xl font-bold text-zinc-900">اطلاعیه / اعلام اختلال</h1>
        <p className="text-[12px] text-zinc-500 mt-1 leading-6">
          یک قانونِ موقت بذار: «از الان تا چند ساعت، هر کسی این کلمه‌ها رو گفت یا موضوع چتش این بود، این پیام رو بهش بگو».
          بات زنده ظرف چند ثانیه این قانون رو می‌گیره. <span className="text-amber-600">prepend</span> یعنی اول این پیام، بعد جواب عادی؛
          <span className="text-amber-600"> replace</span> یعنی فقط همین پیام (بدون عیب‌یابی).
        </p>
      </div>

      {/* create */}
      <div className="rounded-xl border border-black/10 bg-black/[0.035] p-4 mb-5 space-y-3">
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} dir="rtl"
          placeholder="متنِ اطلاعیه — مثلا: «به علتِ اختلال در سرورِ کنسول، تیم داره درستش می‌کنه؛ تا صبح حل می‌شه 🙏 ممنون از صبرت»"
          className="w-full rounded-lg bg-zinc-50 border border-black/10 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40" />

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500">کلیدواژه‌ها (با ، یا خط جدا)</label>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} dir="rtl"
              placeholder="لگ، قطعی، وصل نمیشه، ping"
              className="w-full mt-1 rounded-lg bg-zinc-50 border border-black/10 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500">دامنه</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full mt-1 rounded-lg bg-zinc-50 border border-black/10 px-2 py-2 text-[12px] text-zinc-900">
                <option value="match">فقط منطبق</option>
                <option value="all">همه (اعلان سراسری)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500">حالت</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full mt-1 rounded-lg bg-zinc-50 border border-black/10 px-2 py-2 text-[12px] text-zinc-900">
                <option value="prepend">اول بگو</option>
                <option value="replace">فقط همین</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500">مدت (ساعت)</label>
              <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} className="w-full mt-1 rounded-lg bg-zinc-50 border border-black/10 px-2 py-2 text-[12px] text-zinc-900" />
            </div>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-zinc-500">یا بر اساس موضوع (intent) — اختیاری</label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {INTENTS.map((i) => (
              <button key={i.id} onClick={() => toggleIntent(i.id)} type="button"
                className={`rounded-md px-2 py-1 text-[10px] ring-1 ring-inset transition ${intents.includes(i.id) ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40" : "bg-black/[0.035] text-zinc-500 ring-black/10 hover:text-zinc-800"}`}>
                {i.fa}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} dir="rtl" placeholder="یادداشتِ داخلی (اختیاری)"
            className="flex-1 rounded-lg bg-zinc-50 border border-black/10 px-3 py-2 text-[12px] text-zinc-600 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40" />
          <button onClick={submit} disabled={busy || !msg.trim()}
            className="rounded-lg bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-40 px-5 py-2 text-[13px] font-medium text-black transition">
            {busy ? "..." : "فعال‌سازی"}
          </button>
        </div>
      </div>

      {/* active */}
      <div className="text-[12px] text-zinc-500 mb-2">فعال ({active.length})</div>
      <div className="space-y-2 mb-6">
        {active.map((i) => (
          <div key={i.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] text-zinc-900 leading-6">{i.message}</div>
                <div className="text-[10px] text-zinc-500 mt-1 flex flex-wrap gap-2 items-center">
                  <span className={`rounded px-1.5 py-0.5 ring-1 ring-inset ${i.mode === "replace" ? "text-amber-600 ring-amber-500/30" : "text-sky-600 ring-sky-500/30"}`}>{i.mode}</span>
                  <span className="text-emerald-600/80">{i.scope === "all" ? "سراسری" : "منطبق"}</span>
                  {(i.keywords || []).length > 0 && <span className="ltr">🔑 {i.keywords.join("، ")}</span>}
                  {(i.intents || []).length > 0 && <span className="ltr">🏷 {i.intents.length} intent</span>}
                  <span>· فعال‌شده {i.hits || 0} بار</span>
                  <span>· تا {fmt(i.expiresAt)}</span>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => end(i.id, false)} className="rounded-md px-2 py-1 text-[10px] text-amber-600 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/10">پایان</button>
                <button onClick={() => end(i.id, true)} className="rounded-md px-2 py-1 text-[10px] text-zinc-500 ring-1 ring-inset ring-black/10 hover:bg-black/[0.04]">حذف</button>
              </div>
            </div>
          </div>
        ))}
        {active.length === 0 && <div className="text-[12px] text-zinc-500 py-6 text-center">اطلاعیه‌ی فعالی نیست.</div>}
      </div>

      {past.length > 0 && (
        <>
          <div className="text-[12px] text-zinc-500 mb-2">گذشته ({past.length})</div>
          <div className="space-y-1.5">
            {past.slice(0, 20).map((i) => (
              <div key={i.id} className="rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 flex items-center justify-between gap-3">
                <div className="text-[12px] text-zinc-500 truncate">{i.message}</div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-zinc-500">{i.hits || 0} بار · {fmt(i.expiresAt)}</span>
                  <button onClick={() => end(i.id, true)} className="text-[10px] text-zinc-500 hover:text-zinc-500">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
