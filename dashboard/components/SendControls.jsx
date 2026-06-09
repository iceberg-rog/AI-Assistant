"use client";
import { useState } from "react";

export default function SendControls({ chatId, businessConnectionId, draft, intent, conversationId, draftId }) {
  const [text, setText] = useState(draft || "");
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState("idle"); // idle | sending | sent | error | rejected
  const [err, setErr] = useState("");

  function logFeedback(action, sentText) {
    // fire-and-forget learning signal + marks this draft handled (so it won't reappear as pending)
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, conversationId, intent, botDraft: draft, sentText: sentText || "", draftId }),
    }).catch(() => {});
  }

  async function send() {
    setState("sending");
    setErr("");
    const edited = (text || "").trim() !== (draft || "").trim();
    try {
      const r = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, businessConnectionId, text, draftId }),
      });
      const d = await r.json();
      if (d.ok) {
        setState("sent");
        logFeedback(edited ? "edited" : "approved", text);
      } else {
        setState("error");
        setErr(d.error || "خطای ارسال");
      }
    } catch (e) {
      setState("error");
      setErr(e.message);
    }
  }

  function reject() {
    setState("rejected");
    logFeedback("rejected", "");
  }

  if (state === "sent")
    return <div className="mt-2 rounded-lg bg-emerald-500/12 ring-1 ring-emerald-500/30 px-3 py-2 text-[12px] text-emerald-700">✓ تأیید شد و به کاربر ارسال شد. (ثبت در صف یادگیری)</div>;
  if (state === "rejected")
    return <div className="mt-2 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/25 px-3 py-2 text-[12px] text-rose-700">✕ رد شد — ارسال نشد. (ثبت به‌عنوان «دراف غلط» برای یادگیری)</div>;

  return (
    <div className="mt-2">
      {editing && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-36 mb-2 rounded-lg bg-zinc-50 ring-1 ring-black/10 px-3 py-2 text-sm text-zinc-900 leading-7 focus:outline-none focus:ring-emerald-500/40"
        />
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={send} disabled={state === "sending"} className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-black">
          {state === "sending" ? "در حال ارسال…" : editing ? "ارسال متن ویرایش‌شده" : "تأیید و ارسال به کاربر"}
        </button>
        <button onClick={() => setEditing((v) => !v)} className="rounded-lg bg-black/[0.04] hover:bg-black/[0.07] px-3 py-1.5 text-sm text-zinc-800 ring-1 ring-black/10">
          {editing ? "بستن ویرایش" : "ویرایش"}
        </button>
        <button onClick={reject} className="rounded-lg bg-black/[0.04] hover:bg-rose-500/15 px-3 py-1.5 text-sm text-rose-600 ring-1 ring-rose-500/20">رد</button>
        {state === "error" && <span className="text-[11px] text-rose-600">⛔ {err}</span>}
      </div>
    </div>
  );
}
