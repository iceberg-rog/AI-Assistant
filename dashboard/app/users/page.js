"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, Stat } from "@/components/ui";

const fmt = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fa-IR");
  } catch {
    return "—";
  }
};
const timeHM = (iso) => {
  if (!iso) return "";
  if (typeof iso === "string" && iso.length >= 16 && iso[10] === "T") return iso.slice(11, 16);
  try {
    return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};
const KIND = { voice: "🎤", photo: "🖼" };
const atUser = (u) => (u ? (u.startsWith("@") ? u : `@${u}`) : "");

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [totals, setTotals] = useState({ users: 0, msgIn: 0, msgOut: 0, escalations: 0 });
  const [sel, setSel] = useState(null); // selected telegramId (modal)
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState(false);
  const selRef = useRef(null);

  const load = async () => {
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      const d = await r.json();
      setUsers(d.users || []);
      setTotals(d.totals || { users: 0, msgIn: 0, msgOut: 0, escalations: 0 });
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 6000);
    return () => clearInterval(t);
  }, []);

  function open(u) {
    setSel(u.telegramId);
    selRef.current = u.telegramId;
    setReply(""); setSentMsg(false);
  }
  function close() {
    setSel(null);
    selRef.current = null;
    setReply(""); setSentMsg(false);
  }

  async function sendMessage(telegramId) {
    if (!reply.trim() || !telegramId) return;
    setSending(true);
    try {
      const r = await fetch("/api/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId: telegramId, text: reply.trim() }) });
      const d = await r.json();
      if (d.ok) { setSentMsg(true); setReply(""); setTimeout(() => setSentMsg(false), 2500); }
      else alert("خطای ارسال: " + (d.error || ""));
    } catch (e) { alert("خطا: " + e.message); } finally { setSending(false); }
  }

  const selUser = sel != null ? users.find((u) => String(u.telegramId) === String(sel)) : null;
  const visible = q.trim()
    ? users.filter((u) => (`${u.name} ${u.username || ""} tg${u.telegramId} ${u.intent || ""}`).toLowerCase().includes(q.trim().toLowerCase()))
    : users;

  return (
    <div>
      <PageHeader
        kicker="PER-USER"
        title="کاربران (تاریخچه‌ی کامل)"
        sub="هر کاربر یک ردیف؛ از اولین پیامش تا آخرین، با شمارشِ پیام‌ها. کلیک کن تا کلِ تاریخچه و آمارش باز شه."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="کاربران" value={totals.users} accent="emerald" />
        <Stat label="پیامِ کاربر" value={totals.msgIn} accent="sky" />
        <Stat label="جوابِ سیستم" value={totals.msgOut} accent="emerald" />
        <Stat label="ارجاع‌ها" value={totals.escalations} accent="amber" />
      </div>

      <div className="mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} dir="rtl" placeholder="🔍 جست‌وجوی کاربر / آی‌دی…" className="search-input w-full md:w-96" />
      </div>

      {/* rows — one per user */}
      <div className="rounded-xl border border-black/10 overflow-hidden">
        <div className="hidden md:flex items-center gap-3 px-4 py-2 text-[10px] text-zinc-500 bg-black/[0.035] border-b border-black/10">
          <div className="w-[240px]">کاربر</div>
          <div className="w-[260px] text-center">شمارش</div>
          <div className="flex-1">بازه‌ی زمانی</div>
          <div className="w-[70px]" />
        </div>
        {visible.map((u) => (
          <button
            key={String(u.telegramId)}
            onClick={() => open(u)}
            className="w-full flex flex-wrap md:flex-nowrap items-center gap-3 px-4 py-3 text-right border-b border-black/[0.08] hover:bg-black/[0.04] transition"
          >
            <div className="w-[240px] flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-sky-500/15 ring-1 ring-sky-500/25 grid place-items-center text-[13px] text-sky-700 shrink-0">
                {(u.name || "?").trim().slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] text-zinc-900 truncate">
                  {u.name}
                  {u.username && <span className="text-zinc-500 ltr text-[10px] mr-1">{atUser(u.username)}</span>}
                </div>
                <div className="text-[10px] text-zinc-500 ltr">tg{u.telegramId}</div>
              </div>
            </div>
            <div className="w-[260px] flex items-center justify-center gap-3 text-[10px] text-zinc-500">
              <span>
                پیامِ کاربر <span className="text-sky-600 ltr tabular-nums">{u.msgIn}</span>
              </span>
              <span>
                جوابِ سیستم <span className="text-emerald-600 ltr tabular-nums">{u.msgOut}</span>
              </span>
              <span>
                نشست <span className="text-zinc-600 ltr tabular-nums">{u.sessions}</span>
              </span>
              <span>
                ارجاع{" "}
                <span className={`ltr tabular-nums ${u.escalations > 0 ? "text-amber-600" : "text-zinc-600"}`}>
                  {u.escalations}
                </span>
              </span>
            </div>
            <div className="flex-1 min-w-0 text-[11px] text-zinc-500">
              {u.lastKind !== "text" && <span className="ml-1">{KIND[u.lastKind]}</span>}
              از <span className="text-zinc-800 ltr">{fmt(u.firstSeenAt)}</span>
              <span className="mx-1 text-zinc-500">→</span>
              تا <span className="text-zinc-800 ltr">{fmt(u.lastSeenAt)}</span>
            </div>
            <div className="w-[70px] text-left">
              <span className="rounded-md bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 px-2 py-1 text-[11px]">
                بررسی
              </span>
            </div>
          </button>
        ))}
        {visible.length === 0 && (
          <div className="text-sm text-zinc-500 py-12 text-center">{q.trim() ? "چیزی پیدا نشد." : "هنوز کاربری پیام نداده."}</div>
        )}
      </div>

      {/* modal — full lifetime history for one user */}
      {selUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={close}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/10 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-sky-500/15 ring-1 ring-sky-500/25 grid place-items-center text-sm text-sky-700 shrink-0">
                  {(selUser.name || "?").trim().slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">
                    {selUser.name}
                    {selUser.username && (
                      <span className="text-zinc-500 ltr text-[11px] mr-1">{atUser(selUser.username)}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 ltr">tg{selUser.telegramId}</div>
                </div>
              </div>
              <button
                onClick={close}
                className="h-7 w-7 rounded-lg bg-black/[0.04] hover:bg-black/[0.07] text-zinc-500 grid place-items-center shrink-0"
              >
                ✕
              </button>
            </div>

            {/* stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-5 pt-4">
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">اولین پیام</div>
                <div className="text-[12px] text-zinc-800 ltr mt-0.5">{fmt(selUser.firstSeenAt)}</div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">آخرین پیام</div>
                <div className="text-[12px] text-zinc-800 ltr mt-0.5">{fmt(selUser.lastSeenAt)}</div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">پیامِ کاربر</div>
                <div className="text-[15px] font-bold text-sky-600 ltr tabular-nums mt-0.5">{selUser.msgIn}</div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">جوابِ سیستم</div>
                <div className="text-[15px] font-bold text-emerald-600 ltr tabular-nums mt-0.5">{selUser.msgOut}</div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">نشست‌ها</div>
                <div className="text-[15px] font-bold text-zinc-800 ltr tabular-nums mt-0.5">{selUser.sessions}</div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">ارجاع‌ها</div>
                <div
                  className={`text-[15px] font-bold ltr tabular-nums mt-0.5 ${
                    selUser.escalations > 0 ? "text-amber-600" : "text-zinc-800"
                  }`}
                >
                  {selUser.escalations}
                </div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">موضوعِ فعلی</div>
                <div className="text-[12px] text-zinc-800 ltr mt-0.5">{selUser.intent || "—"}</div>
              </div>
              <div className="rounded-lg bg-black/[0.035] ring-1 ring-black/10 px-3 py-2">
                <div className="text-[10px] text-zinc-500">مرحله</div>
                <div className="text-[12px] text-zinc-800 ltr mt-0.5">{selUser.stage || "—"}</div>
              </div>
            </div>

            {/* full conversation history as chat bubbles (read-only) */}
            <div className="px-5 py-4 space-y-2">
              {(selUser.history || []).length === 0 ? (
                <div className="text-[12px] text-zinc-500 py-6 text-center">تاریخچه‌ای ثبت نشده.</div>
              ) : (
                selUser.history.map((h, i) =>
                  h.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-sky-500/10 ring-1 ring-sky-500/15 px-3 py-2 text-[13px] text-zinc-900 leading-7 whitespace-pre-wrap">
                        {h.text}
                        {h.at && (
                          <span className="block text-[9px] text-sky-600/50 mt-1 ltr tabular-nums">{timeHM(h.at)}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-black/[0.04] ring-1 ring-black/10 px-3 py-2 text-[13px] text-zinc-600 leading-7 whitespace-pre-wrap">
                        {h.text}
                        {h.at && (
                          <span className="block text-[9px] text-zinc-500 mt-1 ltr tabular-nums">{timeHM(h.at)}</span>
                        )}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            {/* send a message to this user */}
            <div className="sticky bottom-0 bg-white border-t border-black/10 px-5 py-3">
              <div className="text-[11px] text-zinc-500 mb-1.5">✍️ ارسالِ پیام به این کاربر</div>
              <div className="flex gap-2 items-end">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} dir="rtl" placeholder="پیامت رو بنویس و مستقیم بفرست…" className="flex-1 rounded-lg bg-zinc-50 ring-1 ring-black/10 px-3 py-2 text-[13px] text-zinc-900 leading-7 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <button onClick={() => sendMessage(selUser.telegramId)} disabled={sending || !reply.trim()} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-4 py-2 text-[13px] font-medium text-white whitespace-nowrap transition">{sending ? "…" : "ارسال"}</button>
              </div>
              {sentMsg && <div className="text-[12px] text-emerald-600 mt-1">✓ ارسال شد</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
