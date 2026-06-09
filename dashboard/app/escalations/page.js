"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, Stat } from "@/components/ui";

const ROUTE = {
  billing: { label: "مالی / Billing", cls: "text-rose-600 bg-rose-500/10 ring-rose-500/30" },
  manager: { label: "مدیر", cls: "text-amber-600 bg-amber-500/10 ring-amber-500/30" },
  technical: { label: "فنی", cls: "text-sky-600 bg-sky-500/10 ring-sky-500/30" },
  human: { label: "پشتیبان انسانی", cls: "text-zinc-600 bg-zinc-500/10 ring-zinc-500/30" },
};
const KIND = { voice: "🎤", photo: "🖼" };
const timeHM = (iso) => (iso ? iso.slice(11, 16) : "—");
const fmt = (iso) => { try { return iso ? new Date(iso).toLocaleString("fa-IR") : "—"; } catch { return iso; } };
const byTime = (a, b) => (b.at || b.createdAt || "").localeCompare(a.at || a.createdAt || "");

export default function EscalationsPage() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(0);
  const [sel, setSel] = useState(null);   // selected escalation id (modal)
  const [busy, setBusy] = useState(null);  // action key, e.g. "id:claim"
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState(false);
  const selRef = useRef(null);

  const refresh = () =>
    fetch("/api/escalations", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setOpen(d.open || 0); })
      .catch(() => {});

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 8000);
    return () => clearInterval(t);
  }, []);

  function openModal(x) { setSel(x.id); selRef.current = x.id; setReply(""); setSentMsg(false); }
  function close() { setSel(null); selRef.current = null; setBusy(null); setReply(""); setSentMsg(false); }

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

  async function act(id, action, extra) {
    setBusy(id + ":" + action);
    try {
      await fetch("/api/escalations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, ...(extra || {}) }),
      });
      await refresh();
      close();
    } finally {
      setBusy(null);
    }
  }

  const byRoute = items.reduce((a, x) => ((a[x.routeTo] = (a[x.routeTo] || 0) + 1), a), {});
  const visible = q.trim()
    ? items.filter((x) => (`${x.user?.name || ""} ${x.user?.username || x.username || ""} tg${x.user?.telegramId || x.telegramId || ""} ${x.faLabel || ""} ${x.reason || ""} ${x.lastMessage || ""} ${x.routeTo || ""}`).toLowerCase().includes(q.trim().toLowerCase()))
    : items;
  const unresolved = visible.filter((x) => !x.resolved).sort(byTime);
  const resolved = visible.filter((x) => x.resolved).sort(byTime);
  const rows = [...unresolved, ...resolved];

  const selItem = sel != null ? items.find((x) => x.id === sel) : null;

  return (
    <div>
      <PageHeader
        kicker="HUMAN-IN-THE-LOOP"
        title="صف پشتیبانی انسانی"
        sub="پیام‌هایی که هوش‌مصنوعی به انسان سپرده (مالی/عودت/توهین/کم‌اطمینان). کلیک کن تا جزئیات و دکمه‌ها باز شه. هر ۸ ثانیه خودکار به‌روز می‌شود."
      />

      {/* prominent open banner */}
      <div
        className={`rounded-xl ring-1 ring-inset px-4 py-3 mb-5 flex items-center gap-3 ${
          open > 0 ? "bg-rose-500/10 ring-rose-500/40" : "bg-emerald-500/[0.06] ring-emerald-500/25"
        }`}
      >
        <span className="text-2xl">{open > 0 ? "🔔" : "✅"}</span>
        <div className={`text-sm font-semibold ${open > 0 ? "text-rose-700" : "text-emerald-700"}`}>
          {open > 0 ? (
            <>
              <span className="ltr tabular-nums">{open}</span> ارجاعِ باز در صفِ پشتیبانی
            </>
          ) : (
            "صفِ پشتیبانی خالیه"
          )}
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="باز" value={open} accent={open > 0 ? "rose" : "emerald"} />
        <Stat label="مالی / Billing" value={byRoute.billing || 0} accent="rose" />
        <Stat label="مدیر" value={byRoute.manager || 0} accent="amber" />
        <Stat label="فنی" value={byRoute.technical || 0} accent="sky" />
      </div>

      <div className="mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} dir="rtl" placeholder="🔍 جست‌وجوی کاربر / آی‌دی / دلیل…" className="search-input w-full md:w-96" />
      </div>

      {/* rows — one per escalation */}
      <div className="rounded-xl border border-black/10 overflow-hidden">
        <div className="hidden md:flex items-center gap-3 px-4 py-2 text-[10px] text-zinc-500 bg-black/[0.035] border-b border-black/10">
          <div className="w-[240px]">کاربر</div>
          <div className="w-[120px]">مقصد</div>
          <div className="flex-1">آخرین پیام / دلیل</div>
          <div className="w-[55px] text-center">زمان</div>
          <div className="w-[120px] text-center">وضعیت</div>
          <div className="w-[64px]" />
        </div>

        {rows.map((x) => {
          const r = ROUTE[x.routeTo] || ROUTE.human;
          const user = x.user || {};
          const username = user.username || x.username;
          const telegramId = user.telegramId || x.telegramId;
          const kindIcon = x.kind && x.kind !== "text" ? KIND[x.kind] : null;
          return (
            <button
              key={x.id}
              onClick={() => openModal(x)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-right border-b border-black/[0.08] hover:bg-black/[0.04] transition ${x.resolved ? "opacity-60" : ""}`}
            >
              <div className="w-[240px] flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-sky-500/15 ring-1 ring-sky-500/25 grid place-items-center text-[13px] text-sky-700 shrink-0">
                  {(user.name || "?").slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-zinc-900 truncate">
                    {user.name || "کاربر"} {username && <span className="text-zinc-500 ltr text-[10px]">{username}</span>}
                  </div>
                  <div className="text-[10px] text-zinc-500 ltr truncate">
                    tg{telegramId}{user.userCode ? " · " + user.userCode : ""}
                  </div>
                </div>
              </div>
              <div className="w-[120px] min-w-0">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${r.cls}`}>{r.label}</span>
              </div>
              <div className="flex-1 min-w-0 text-[12px] text-zinc-500 truncate">
                {kindIcon && <span className="ml-1">{kindIcon}</span>}
                {x.lastMessage || x.reason || x.faLabel || "—"}
              </div>
              <div className="w-[55px] text-center text-[10px] text-zinc-500 ltr">{timeHM(x.at || x.createdAt)}</div>
              <div className="w-[120px] text-center">
                {x.resolved ? (
                  <span className="rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/30 px-2.5 py-1 text-[11px]">حل‌شده</span>
                ) : x.claimedBy ? (
                  <span className="rounded-full bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-500/30 px-2.5 py-1 text-[11px]">در دستِ {x.claimedBy}</span>
                ) : (
                  <span className="rounded-full bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 px-2.5 py-1 text-[11px]">باز</span>
                )}
              </div>
              <div className="w-[64px] text-left">
                <span className="rounded-md bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/30 px-2 py-1 text-[11px]">بررسی</span>
              </div>
            </button>
          );
        })}

        {visible.length === 0 && (
          <div className="text-sm text-zinc-500 py-12 text-center">{q.trim() ? "چیزی پیدا نشد." : "هنوز ارجاعی ثبت نشده ✅"}</div>
        )}
      </div>

      {/* modal — one escalation */}
      {selItem && (() => {
        const r = ROUTE[selItem.routeTo] || ROUTE.human;
        const user = selItem.user || {};
        const username = user.username || selItem.username;
        const telegramId = user.telegramId || selItem.telegramId;
        const kindIcon = selItem.kind && selItem.kind !== "text" ? KIND[selItem.kind] : null;
        const claimBusy = busy === selItem.id + ":claim";
        const resolveBusy = busy === selItem.id + ":resolve";
        const reopenBusy = busy === selItem.id + ":reopen";
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={close}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* header */}
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/10 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-sky-500/15 ring-1 ring-sky-500/25 grid place-items-center text-sm text-sky-700 shrink-0">
                    {(user.name || "?").slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 flex items-center gap-2 flex-wrap">
                      <span>{user.name || "کاربر"}</span>
                      {username && <span className="text-zinc-500 ltr text-[11px]">{username}</span>}
                      {kindIcon && <span className="text-base" title={selItem.kind}>{kindIcon}</span>}
                      <span className={`rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${r.cls}`}>{r.label}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 ltr">
                      tg{telegramId}{user.userCode ? " · " + user.userCode : ""} · {fmt(selItem.createdAt)}
                    </div>
                  </div>
                </div>
                <button onClick={close} className="h-7 w-7 rounded-lg bg-black/[0.04] hover:bg-black/[0.07] text-zinc-500 grid place-items-center shrink-0">✕</button>
              </div>

              {/* body */}
              <div className="px-5 py-4 space-y-3">
                {selItem.faLabel && <div className="text-[12px] text-zinc-600">{selItem.faLabel}</div>}

                {selItem.lastMessage && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-sky-500/10 ring-1 ring-sky-500/15 px-3 py-2 text-[13px] text-zinc-900 leading-7 whitespace-pre-wrap">
                      {kindIcon && <span className="ml-1">{kindIcon} </span>}
                      {selItem.lastMessage}
                    </div>
                  </div>
                )}

                {selItem.reason && (
                  <div className="rounded-lg bg-amber-500/8 ring-1 ring-inset ring-amber-500/20 px-3 py-2 text-[12px] text-amber-700 leading-6">
                    ⚠ دلیل: {selItem.reason}
                  </div>
                )}

                {(selItem.claimedBy || selItem.claimedAt || selItem.resolvedAt) && (
                  <div className="text-[11px] text-zinc-500 space-y-0.5">
                    {selItem.claimedBy && <div>برداشته‌شده توسطِ <span className="text-zinc-600">{selItem.claimedBy}</span>{selItem.claimedAt && <span className="ltr"> · {fmt(selItem.claimedAt)}</span>}</div>}
                    {selItem.resolvedAt && <div className="ltr">حل‌شده: {fmt(selItem.resolvedAt)}</div>}
                  </div>
                )}

                {/* reply directly to this user */}
                <div className="pt-3 border-t border-black/10">
                  <div className="text-[11px] text-zinc-500 mb-1.5">✍️ ارسالِ پیام به این کاربر</div>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} dir="rtl" placeholder="پیامت رو بنویس و مستقیم برای کاربر بفرست…" className="w-full rounded-lg bg-zinc-50 ring-1 ring-black/10 px-3 py-2 text-[13px] text-zinc-900 leading-7 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => sendMessage(telegramId)} disabled={sending || !reply.trim()} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-4 py-1.5 text-[13px] font-medium text-white transition">{sending ? "در حال ارسال…" : "ارسال به کاربر"}</button>
                    {sentMsg && <span className="text-[12px] text-emerald-600">✓ ارسال شد</span>}
                  </div>
                </div>
              </div>

              {/* sticky action buttons */}
              <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-black/10 sticky bottom-0 bg-white z-10">
                {!selItem.resolved && (
                  selItem.claimedBy ? (
                    <span className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-[12px] text-amber-700 ring-1 ring-inset ring-amber-500/25">
                      در دستِ {selItem.claimedBy}
                    </span>
                  ) : (
                    <button
                      onClick={() => act(selItem.id, "claim", { by: "اپراتور" })}
                      disabled={claimBusy}
                      className="rounded-lg bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-40 px-4 py-1.5 text-sm font-medium text-black transition"
                    >
                      {claimBusy ? "…" : "برداشتن"}
                    </button>
                  )
                )}

                {!selItem.resolved && (
                  <button
                    onClick={() => act(selItem.id, "resolve")}
                    disabled={resolveBusy}
                    className="rounded-lg bg-black/[0.04] hover:bg-black/[0.07] disabled:opacity-40 px-3 py-1.5 text-sm text-zinc-800 ring-1 ring-inset ring-black/10 transition"
                  >
                    {resolveBusy ? "…" : "حل شد"}
                  </button>
                )}

                {selItem.resolved && (
                  <button
                    onClick={() => act(selItem.id, "reopen")}
                    disabled={reopenBusy}
                    className="rounded-lg bg-black/[0.04] hover:bg-black/[0.07] disabled:opacity-40 px-3 py-1.5 text-[13px] text-amber-600 ring-1 ring-inset ring-amber-500/30 transition"
                  >
                    {reopenBusy ? "…" : "بازکردن مجدد"}
                  </button>
                )}

                <button
                  onClick={close}
                  className="rounded-lg bg-black/[0.04] hover:bg-black/[0.07] px-3 py-1.5 text-sm text-zinc-500 ring-1 ring-inset ring-black/10 transition ms-auto"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
