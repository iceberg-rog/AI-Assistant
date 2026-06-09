"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

const MODELS = ["claude-sonnet-4-6", "claude-opus-4-8", "claude-opus-4-6", "claude-haiku-4-5"];
const SECRET_LABEL = {
  TELEGRAM_BOT_TOKEN: "توکنِ بات",
  CLAUDE_API_KEY: "کلیدِ Claude",
  USERS_QUERY_BASE: "آدرسِ DBِ کاربران",
  IP_REGISTRY_ALLIPS_URL: "آدرسِ وایت‌لیستِ آیپی",
};

export default function SettingsEditor() {
  const [s, setS] = useState(null); // {editable, secrets}
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) { setS(d); setForm(d.editable); } else setMsg(d.error || "خطا");
    } catch { setMsg("کانکتور در دسترس نیست"); }
  };
  useEffect(() => { load(); }, []);

  if (!s || !form) {
    return <Card className="p-5 mb-4"><div className="text-[13px] text-zinc-500">{msg || "در حال بارگذاریِ تنظیمات…"}</div></Card>;
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(s.editable);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setMsg("");
    const updates = {};
    for (const k of Object.keys(form)) if (String(form[k]) !== String(s.editable[k])) updates[k] = String(form[k]);
    try {
      const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ updates }) });
      const d = await r.json();
      if (d.ok) {
        if (d.restarting) {
          setMsg("ذخیره شد ✓ — کانکتور در حال ری‌استارت برای اعمالِ تغییرات…");
          setTimeout(load, 7000); // reload after connector revives
        } else setMsg("تغییری برای ذخیره نبود.");
      } else setMsg("خطا: " + (d.error || ""));
    } catch { setMsg("کانکتور در دسترس نیست"); }
    setBusy(false);
  }

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-zinc-900">تنظیماتِ قابلِ ویرایش</div>
        <span className="text-[10px] text-zinc-500 ltr">.env → ری‌استارتِ خودکار</span>
      </div>

      <div className="space-y-4">
        {/* Claude model */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13px] text-zinc-800">مدلِ Claude (مغزِ اصلی)</div>
            <div className="text-[10px] text-zinc-500">مدلِ SMART که جوابِ نهایی را می‌دهد.</div>
          </div>
          <select value={form.CLAUDE_MODEL} onChange={(e) => set("CLAUDE_MODEL", e.target.value)} className="search-input ltr text-[13px] w-56">
            {[...new Set([form.CLAUDE_MODEL, ...MODELS])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* send mode */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-black/[0.06] pt-4">
          <div>
            <div className="text-[13px] text-zinc-800">حالتِ ارسال</div>
            <div className="text-[10px] text-zinc-500">{form.SHELTER_AUTO_SEND === "true" ? "خودکار: جواب‌ها بی‌تأیید می‌روند." : "Copilot: هر جواب را تو تأیید می‌کنی (امن‌تر)."}</div>
          </div>
          <div className="flex rounded-lg ring-1 ring-black/10 overflow-hidden text-[12px]">
            <button onClick={() => set("SHELTER_AUTO_SEND", "false")} className={`px-3 py-1.5 ${form.SHELTER_AUTO_SEND !== "true" ? "bg-sky-600 text-white" : "text-zinc-600 hover:bg-black/5"}`}>تأیید قبل از ارسال</button>
            <button onClick={() => set("SHELTER_AUTO_SEND", "true")} className={`px-3 py-1.5 ${form.SHELTER_AUTO_SEND === "true" ? "bg-amber-600 text-white" : "text-zinc-600 hover:bg-black/5"}`}>ارسالِ خودکار</button>
          </div>
        </div>

        {/* confidence floor */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-black/[0.06] pt-4">
          <div>
            <div className="text-[13px] text-zinc-800">آستانه‌ی اطمینان</div>
            <div className="text-[10px] text-zinc-500">زیرِ این عدد → کلود دوباره می‌خواند؛ بازم پایین بود → انسان.</div>
          </div>
          <input type="number" min="0" max="1" step="0.05" value={form.SHELTER_CONF_FLOOR} onChange={(e) => set("SHELTER_CONF_FLOOR", e.target.value)} className="search-input ltr text-[13px] w-24 text-center" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-black/10">
        <button onClick={save} disabled={!dirty || busy} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] px-4 py-2 disabled:opacity-40">
          {busy ? "در حال ذخیره…" : "ذخیره و اعمال"}
        </button>
        {dirty && !busy && <button onClick={() => setForm(s.editable)} className="text-[12px] text-zinc-500 hover:text-zinc-800">برگرداندن</button>}
        {msg && <span className="text-[12px] text-zinc-600">{msg}</span>}
      </div>

      {/* secrets — read-only status; edited only in .env for safety */}
      <div className="mt-5 pt-4 border-t border-black/10">
        <div className="text-[11px] text-zinc-500 mb-2">اطلاعاتِ حساس (فقط در <span className="ltr">Shelter/.env</span> ویرایش می‌شوند — از روی داشبورد قابلِ تغییر نیستند)</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.secrets).map(([k, present]) => (
            <span key={k} className={`text-[11px] rounded-md px-2 py-1 ring-1 ring-inset ${present ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30" : "bg-rose-500/10 text-rose-700 ring-rose-500/25"}`}>
              {SECRET_LABEL[k] || k}: {present ? "تنظیم‌شده ✓" : "خالی ✗"}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
