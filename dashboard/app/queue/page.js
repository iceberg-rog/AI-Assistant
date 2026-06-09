"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, Stat, TierBadge, Confidence } from "@/components/ui";

const timeHM = (iso) => (iso ? iso.slice(11, 16) : "—");
const KIND = { voice: "🎤", photo: "🖼" };
const ACTION_FA = { auto_send: "خودکار", draft_for_review: "نیمه‌خودکار", escalate_human: "انسانی" };

export default function QueuePage() {
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);        // selected telegramId (modal)
  const [edits, setEdits] = useState({});      // draftId -> edited text
  const [busyId, setBusyId] = useState(null);
  const [localDone, setLocalDone] = useState({}); // draftId -> "sent"|"rejected"
  const [q, setQ] = useState("");
  const selRef = useRef(null);

  const load = async () => {
    try {
      const r = await fetch("/api/queue", { cache: "no-store" });
      const d = await r.json();
      setUsers(d.users || []);
      if (selRef.current && !(d.users || []).some((u) => String(u.telegramId) === String(selRef.current))) {
        // all of this user's drafts are handled → close after a beat
        setTimeout(() => { if (selRef.current && !users.some((u) => String(u.telegramId) === String(selRef.current))) close(); }, 50);
      }
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    return () => clearInterval(t);
  }, []);

  function open(u) { setSel(u.telegramId); selRef.current = u.telegramId; setEdits({}); setLocalDone({}); }
  function close() { setSel(null); selRef.current = null; setEdits({}); setBusyId(null); setLocalDone({}); }

  const selUser = sel != null ? users.find((u) => String(u.telegramId) === String(sel)) : null;

  async function approve(it) {
    setBusyId(it.id);
    const text = edits[it.id] ?? it.reply ?? "";
    const edited = (text || "").trim() !== (it.reply || "").trim();
    try {
      const r = await fetch("/api/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId: it.chatId, businessConnectionId: it.businessConnectionId, text, draftId: it.id }) });
      const d = await r.json();
      if (d.ok) {
        fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: edited ? "edited" : "approved", conversationId: it.conversationId, intent: it.intentId, botDraft: it.reply, sentText: text, draftId: it.id }) }).catch(() => {});
        setLocalDone((m) => ({ ...m, [it.id]: "sent" })); setBusyId(null); load();
      } else { setBusyId(null); alert("خطای ارسال: " + (d.error || "")); }
    } catch (e) { setBusyId(null); alert("خطا: " + e.message); }
  }
  function reject(it) {
    setBusyId(it.id);
    fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rejected", conversationId: it.conversationId, intent: it.intentId, botDraft: it.reply, draftId: it.id }) }).catch(() => {});
    setLocalDone((m) => ({ ...m, [it.id]: "rejected" })); setBusyId(null); load();
  }

  const tierOf = (k) => users.reduce((a, u) => a + (u.latestTier === k ? 1 : 0), 0);
  const totalPending = users.reduce((a, u) => a + u.pendingCount, 0);
  const visible = q.trim()
    ? users.filter((u) => (`${u.user.name} ${u.user.username || ""} tg${u.user.telegramId} ${u.user.userCode || ""} ${u.latestInbound || ""} ${u.latestFaLabel || ""}`).toLowerCase().includes(q.trim().toLowerCase()))
    : users;

  return (
    <div>
      <PageHeader
        kicker="LIVE OPS"
        title="صف تأیید"
        sub="یک ردیف برای هر کاربر. کلیک کن تا پاپ‌آپِ کلِ مکالمه (با عکس) و همه‌ی دکمه‌ها باز شه. هر ۴ ثانیه خودکار به‌روز می‌شود."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کاربرانِ منتظر" value={users.length} accent="emerald" hint={`${totalPending} درافِ معلق`} />
        <Stat label="نیمه‌خودکار" value={tierOf("copilot")} accent="sky" />
        <Stat label="خودکار (گِیت‌خورده)" value={tierOf("auto")} accent="emerald" />
        <Stat label="انسانی" value={tierOf("human")} accent="amber" />
      </div>

      <div className="mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} dir="rtl" placeholder="🔍 جست‌وجوی کاربر / آی‌دی / پیام…" className="search-input w-full md:w-96" />
      </div>

      {/* rows — one per user */}
      <div className="rounded-xl border border-black/10 overflow-hidden">
        <div className="hidden md:flex items-center gap-3 px-4 py-2 text-[10px] text-zinc-500 bg-black/[0.035] border-b border-black/10">
          <div className="w-[240px]">کاربر</div>
          <div className="w-[90px] text-center">معلق</div>
          <div className="w-[160px]">آخرین موضوع</div>
          <div className="flex-1">آخرین پیام</div>
          <div className="w-[55px] text-center">زمان</div>
          <div className="w-[70px]" />
        </div>
        {visible.map((u) => (
          <button key={u.telegramId} onClick={() => open(u)} className="w-full flex items-center gap-3 px-4 py-3 text-right border-b border-black/[0.08] hover:bg-black/[0.04] transition">
            <div className="w-[240px] flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-sky-500/15 ring-1 ring-sky-500/25 grid place-items-center text-[13px] text-sky-700 shrink-0">{(u.user.name || "?").slice(0, 1)}</div>
              <div className="min-w-0">
                <div className="text-[13px] text-zinc-900 truncate">{u.user.name} {u.user.username && <span className="text-zinc-500 ltr text-[10px]">{u.user.username}</span>}</div>
                <div className="text-[10px] text-zinc-500 ltr">tg{u.user.telegramId}{u.user.userCode ? " · " + u.user.userCode : ""} · {u.total} پیام</div>
              </div>
            </div>
            <div className="w-[90px] text-center"><span className="rounded-full bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/30 px-2.5 py-1 text-[12px] tabular-nums">{u.pendingCount}</span></div>
            <div className="w-[160px] min-w-0"><div className="text-[11px] text-zinc-600 truncate">{u.latestFaLabel}</div><div className="mt-0.5"><Confidence value={u.latestConfidence} /></div></div>
            <div className="flex-1 min-w-0 text-[12px] text-zinc-500 truncate">{u.latestKind !== "text" && <span className="ml-1">{KIND[u.latestKind]}</span>}{u.latestInbound}</div>
            <div className="w-[55px] text-center text-[10px] text-zinc-500 ltr">{timeHM(u.lastAt)}</div>
            <div className="w-[70px] text-left"><span className="rounded-md bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 px-2 py-1 text-[11px]">بررسی</span></div>
          </button>
        ))}
        {visible.length === 0 && <div className="text-sm text-zinc-500 py-12 text-center">{q.trim() ? "چیزی پیدا نشد." : "صفِ تأیید خالیه ✅ — درافِ معلقی نیست."}</div>}
      </div>

      {/* modal — full thread for one user */}
      {selUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={close}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/10 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-sky-500/15 ring-1 ring-sky-500/25 grid place-items-center text-sm text-sky-700 shrink-0">{(selUser.user.name || "?").slice(0, 1)}</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">{selUser.user.name} {selUser.user.username && <span className="text-zinc-500 ltr text-[11px]">{selUser.user.username}</span>}</div>
                  <div className="text-[11px] text-zinc-500 ltr">tg{selUser.user.telegramId}{selUser.user.userCode ? " · " + selUser.user.userCode : ""} · {selUser.total} پیام · {selUser.pendingCount} معلق</div>
                </div>
              </div>
              <button onClick={close} className="h-7 w-7 rounded-lg bg-black/[0.04] hover:bg-black/[0.07] text-zinc-500 grid place-items-center shrink-0">✕</button>
            </div>

            {/* real DB record */}
            {selUser.userRecord && (
              <div className="mx-5 mt-3 rounded-lg bg-emerald-500/[0.06] ring-1 ring-emerald-500/20 px-3 py-2 text-[12px] text-emerald-700/90">
                <span className="font-mono text-emerald-600/80 ltr">users.db</span> → {selUser.userRecord}
              </div>
            )}

            {/* full thread */}
            <div className="px-5 py-4 space-y-3">
              {selUser.thread.map((it) => {
                const ld = localDone[it.id];
                const showActions = it.pending && !ld;
                return (
                  <div key={it.id} className="space-y-1.5">
                    {/* inbound */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-sky-500/10 ring-1 ring-sky-500/15 px-3 py-2 text-[13px] text-zinc-900 leading-7 whitespace-pre-wrap">
                        {it.imageUrl && (
                          <a href={it.imageUrl} target="_blank" rel="noreferrer" className="block mb-2">
                            <img src={it.imageUrl} alt="عکسِ کاربر" className="max-w-[240px] max-h-[240px] rounded-lg ring-1 ring-black/10" />
                          </a>
                        )}
                        {it.kind !== "text" && !it.imageUrl && <span>{KIND[it.kind]} </span>}
                        {it.inbound}
                      </div>
                    </div>
                    {/* reply / escalation */}
                    {it.reply ? (
                      <div className="space-y-1.5">
                        {showActions ? (
                          <div className="rounded-lg bg-emerald-500/[0.06] ring-1 ring-dashed ring-emerald-500/30 p-2.5">
                            <div className="text-[9px] text-emerald-600/60 mb-1">درافِ سیستم — قابلِ ویرایش</div>
                            <textarea value={edits[it.id] ?? it.reply} onChange={(e) => setEdits((m) => ({ ...m, [it.id]: e.target.value }))} rows={4} dir="rtl"
                              className="w-full rounded-lg bg-zinc-50 ring-1 ring-black/10 px-3 py-2 text-[13px] text-zinc-900 leading-7 focus:outline-none focus:ring-emerald-500/40" />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => approve(it)} disabled={busyId === it.id} className="rounded-lg bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-50 px-4 py-1.5 text-[12px] font-medium text-black">
                                {busyId === it.id ? "…" : (edits[it.id] ?? it.reply).trim() !== (it.reply || "").trim() ? "ارسالِ ویرایش‌شده" : "تأیید و ارسال"}
                              </button>
                              <button onClick={() => reject(it)} disabled={busyId === it.id} className="rounded-lg bg-black/[0.04] hover:bg-rose-500/15 px-3 py-1.5 text-[12px] text-rose-600 ring-1 ring-rose-500/20">رد</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-black/[0.04] ring-1 ring-black/10 px-3 py-2 text-[13px] text-zinc-600 leading-7 whitespace-pre-wrap">
                              {it.reply}
                              <span className={`block text-[9px] mt-1 ${ld === "rejected" || it.handled?.action === "rejected" ? "text-rose-400/70" : "text-emerald-600/70"}`}>
                                {ld === "rejected" || it.handled?.action === "rejected" ? "✕ رد شد" : ld || it.handled || it.delivered === "auto_sent" ? "✓ ارسال شد" : ""}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : it.escalatedTo ? (
                      <div className="flex justify-start"><div className="max-w-[85%] rounded-lg bg-amber-500/8 ring-1 ring-amber-500/20 px-3 py-2 text-[12px] text-amber-700">↗ ارجاع به {it.escalatedTo}</div></div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
