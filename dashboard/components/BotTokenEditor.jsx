"use client";
import { useState } from "react";
import { Card } from "@/components/ui";

// Add/replace the support bot by its token. The token is write-only: typed here, validated by the
// connector against Telegram (getMe), saved to .env server-side — never displayed back.
export default function BotTokenEditor({ currentBot }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  async function submit(e) {
    e?.preventDefault?.();
    const t = token.trim();
    if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(t)) { setMsg({ ok: false, text: "قالبِ توکن درست نیست (مثل 123456:ABC...)." }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/settoken", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: t }) });
      const d = await r.json();
      if (d.ok) {
        setToken("");
        setMsg({ ok: true, text: `بات تأیید شد: ${d.bot} — کانکتور در حال ری‌استارت با باتِ جدید…` });
        setTimeout(() => { if (typeof window !== "undefined") window.location.reload(); }, 8000);
      } else {
        setMsg({ ok: false, text: d.error || "خطا" });
      }
    } catch {
      setMsg({ ok: false, text: "اتصال برقرار نشد" });
    }
    setBusy(false);
  }

  return (
    <Card className="p-5 mb-4 ring-1 ring-emerald-500/20">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-zinc-900">باتِ پشتیبانی</div>
          <p className="text-[12px] text-zinc-500 leading-6">
            باتِ فعلی: <b className="text-emerald-700 ltr">{currentBot || "—"}</b> — برای تعویضِ باتِ پشتیبانی، توکنِ باتِ جدید را وارد کن.
          </p>
        </div>
        {!open && (
          <button onClick={() => { setOpen(true); setMsg(null); }} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] px-4 py-2 shrink-0">تعویضِ بات با توکن</button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 pt-4 border-t border-black/10">
          <label className="text-[12px] text-zinc-600 block mb-1.5">توکنِ بات (از <span className="ltr">@BotFather</span>)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              dir="ltr"
              placeholder="123456789:ABCdef..."
              className="search-input w-full sm:w-96 ltr font-mono text-[12px]"
            />
            <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] px-4 py-2 disabled:opacity-50">
              {busy ? "در حال اعتبارسنجی…" : "اعتبارسنجی و تعویض"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setToken(""); setMsg(null); }} className="text-[12px] text-zinc-500 hover:text-zinc-800 px-2">انصراف</button>
          </div>
          <p className="text-[11px] text-zinc-400 leading-6 mt-2">
            🔒 توکن فقط یک‌بار به سرور فرستاده می‌شود، با Telegram چک می‌شود که واقعی باشد، و در <span className="ltr">Shelter/.env</span> ذخیره می‌شود — هیچ‌وقت برنمی‌گردد نمایش داده شود. فقط توکنِ باتِ <b>خودت</b> را وارد کن.
            <br />نکته: با تعویضِ بات، اتصال‌های Businessِ باتِ قبلی پاک می‌شوند؛ باتِ جدید باید روی اکانتِ پشتیبانی دوباره اضافه شود.
          </p>
          {msg && (
            <div className={`mt-2 text-[12px] rounded-lg px-3 py-2 ring-1 ${msg.ok ? "bg-emerald-500/10 text-emerald-800 ring-emerald-500/25" : "bg-rose-500/[0.07] text-rose-800 ring-rose-500/25"}`}>
              {msg.ok ? "✅ " : "⚠ "}{msg.text}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
