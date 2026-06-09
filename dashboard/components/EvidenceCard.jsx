"use client";
import { useState } from "react";
import { TierBadge, Confidence } from "@/components/ui";

const STATUS = {
  auto_ready: { label: "آماده‌ی ارسال خودکار", cls: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/30" },
  pending: { label: "در انتظار تأیید", cls: "text-sky-600 bg-sky-500/10 ring-sky-500/30" },
  escalated: { label: "ارجاع به انسان", cls: "text-amber-600 bg-amber-500/10 ring-amber-500/30" },
};

const timeHM = (iso) => (iso ? iso.slice(11, 16) : "—");

export default function EvidenceCard({ item }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.draft || "");
  const [action, setAction] = useState(null); // sent | edited | rejected

  const st = STATUS[item.status] || STATUS.pending;
  const ev = item.evidence || {};

  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.035] overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-black/10 bg-black/[0.035]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-zinc-700/50 grid place-items-center text-sm text-zinc-600 shrink-0">
            {(item.user?.name || "?").slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-900 truncate">
              {item.user?.name} <span className="text-zinc-500 ltr">{item.user?.username}</span>
            </div>
            <div className="text-[11px] text-zinc-500 ltr">
              {item.user?.user_code} · id {item.user?.telegram_id} · {timeHM(item.received_at)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TierBadge tier={item.tier} />
          <span className={`rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${st.cls}`}>{st.label}</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-0">
        {/* left: conversation + draft */}
        <div className="p-4 space-y-3 border-l border-black/10">
          <div className="text-[11px] text-zinc-500">پیام کاربر</div>
          <div className="rounded-lg rounded-tr-sm bg-sky-500/10 ring-1 ring-sky-500/15 px-3 py-2 text-sm text-zinc-900 leading-6">
            {item.opener}
          </div>

          <div className="text-[11px] text-zinc-500 pt-1">پاسخ پیشنهادی ایجنت</div>
          {item.draft ? (
            editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full h-40 rounded-lg bg-zinc-50 ring-1 ring-black/10 px-3 py-2 text-sm text-zinc-900 leading-6 focus:outline-none focus:ring-emerald-500/40"
              />
            ) : (
              <div className="rounded-lg rounded-tl-sm bg-emerald-500/8 ring-1 ring-emerald-500/15 px-3 py-2 text-sm text-zinc-900 leading-7 whitespace-pre-wrap">
                {draft}
              </div>
            )
          ) : (
            <div className="rounded-lg bg-amber-500/8 ring-1 ring-amber-500/20 px-3 py-2 text-sm text-amber-700 leading-6">
              بدون دراف خودکار — این مورد طبق سیاست مستقیم به پشتیبان انسانی ارجاع می‌شود.
            </div>
          )}

          {/* actions */}
          {action ? (
            <div className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              action === "rejected" ? "bg-rose-500/10 ring-rose-500/30 text-rose-700" : "bg-emerald-500/10 ring-emerald-500/30 text-emerald-700"
            }`}>
              {action === "sent" && "✓ تأیید و ارسال شد (ثبت در audit log)."}
              {action === "edited" && "✓ با ویرایش ارسال شد — ثبت به‌عنوان سیگنال آموزشی (override)."}
              {action === "rejected" && "✕ رد و به صف پشتیبان انسانی ارجاع شد."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {item.draft && !editing && (
                <button onClick={() => setAction("sent")} className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black">
                  تأیید و ارسال
                </button>
              )}
              {item.draft && (
                <button
                  onClick={() => (editing ? setAction("edited") : setEditing(true))}
                  className="rounded-lg bg-black/[0.04] hover:bg-black/[0.07] px-3 py-1.5 text-sm text-zinc-800 ring-1 ring-black/10"
                >
                  {editing ? "ذخیره و ارسال" : "ویرایش"}
                </button>
              )}
              <button onClick={() => setAction("rejected")} className="rounded-lg bg-black/[0.04] hover:bg-rose-500/15 px-3 py-1.5 text-sm text-rose-600 ring-1 ring-rose-500/20">
                {item.draft ? "رد + ارجاع انسانی" : "ارجاع به پشتیبان انسانی"}
              </button>
            </div>
          )}
        </div>

        {/* right: evidence */}
        <div className="p-4 space-y-3 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-zinc-600">کارت شواهد (Evidence)</div>
            <Confidence value={ev.confidence} />
          </div>

          <div className="space-y-2">
            {(ev.tools || []).length === 0 && (
              <div className="text-[11px] text-zinc-500">— بدون فراخوانی tool (پاسخ از KB لحن) —</div>
            )}
            {(ev.tools || []).map((t, i) => (
              <div key={i} className="rounded-lg bg-black/[0.04] ring-1 ring-black/10 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-mono text-emerald-600 ltr">{t.name}</span>
                  <span className="text-[10px] text-zinc-500 ltr">{timeHM(t.checked_at)}</span>
                </div>
                <div className="text-[12px] text-zinc-800 mt-1 leading-5">{t.result}</div>
                <div className="text-[10px] text-zinc-500 mt-1 ltr">منبع: {t.source}</div>
              </div>
            ))}
          </div>

          {(ev.kb_cited || []).length > 0 && (
            <div>
              <div className="text-[11px] text-zinc-500 mb-1">KB سایت‌شده</div>
              <div className="flex flex-wrap gap-1">
                {ev.kb_cited.map((k, i) => (
                  <span key={i} className="rounded bg-black/[0.04] ring-1 ring-black/10 px-1.5 py-0.5 text-[10px] text-zinc-600 ltr">
                    {k.id}@{k.version}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(ev.gates || []).length > 0 && (
            <div>
              <div className="text-[11px] text-amber-400/80 mb-1">Gateهای فعال‌شده</div>
              <div className="space-y-1">
                {ev.gates.map((g, i) => (
                  <div key={i} className="rounded bg-amber-500/8 ring-1 ring-amber-500/20 px-2 py-1 text-[11px] text-amber-700">
                    ⚠ {g}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
