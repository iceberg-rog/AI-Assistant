"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Polls the live pulse; alerts on a NEW incoming message (→ مکالمات زنده) and on a NEW escalation.
export default function NotificationBell() {
  const [open, setOpen] = useState(0);
  const [toast, setToast] = useState(null);
  const prevProcessed = useRef(null);
  const prevOpen = useRef(null);
  const acRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch {}
    }
    let stop = false;
    const beep = (freq = 880) => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        acRef.current = acRef.current || new AC();
        const ac = acRef.current;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = freq; g.gain.value = 0.07;
        o.connect(g); g.connect(ac.destination); o.start();
        o.frequency.setValueAtTime(freq * 0.75, ac.currentTime + 0.12);
        o.stop(ac.currentTime + 0.24);
      } catch {}
    };
    const notify = (title, body) => { try { if (Notification?.permission === "granted") new Notification(title, { body }); } catch {} };
    const showToast = (msg, kind) => { setToast({ msg, kind }); setTimeout(() => setToast(null), 6000); };

    const tick = async () => {
      try {
        const r = await fetch("/api/pulse", { cache: "no-store" });
        const d = await r.json();
        // new escalation
        if (prevOpen.current != null && (d.open || 0) > prevOpen.current) {
          beep(660); showToast(`🔔 ارجاع جدید به پشتیبانی انسانی (${d.open} باز)`, "esc"); notify("Shelter — ارجاع جدید", `${d.open} مورد در صف پشتیبانی`);
        }
        // new incoming message
        if (prevProcessed.current != null && (d.processed || 0) > prevProcessed.current) {
          const k = d.lastKind === "voice" ? "🎤 " : d.lastKind === "photo" ? "🖼 " : "";
          beep(920); showToast(`💬 پیامِ جدید از ${d.lastUser || "کاربر"}: ${k}${d.lastInbound || ""}`, "msg");
          notify("Shelter — پیام جدید", `${d.lastUser || "کاربر"}: ${d.lastInbound || ""}`);
          router.refresh(); // pull the new message into any open live page
        }
        prevOpen.current = d.open || 0;
        prevProcessed.current = d.processed || 0;
        setOpen(d.open || 0);
      } catch {}
      if (!stop) setTimeout(tick, 4000);
    };
    tick();
    return () => { stop = true; };
  }, [router]);

  return (
    <>
      <Link
        href="/escalations"
        className={`fixed top-4 left-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] ring-1 ring-inset shadow-sm transition ${
          open > 0 ? "bg-rose-500/15 text-rose-700 ring-rose-500/40 animate-pulse" : "bg-white text-zinc-500 ring-black/10 hover:text-zinc-800"
        }`}
        title="صف پشتیبانی انسانی"
      >
        <span>🔔</span>
        <span>{open > 0 ? `${open} ارجاع باز` : "صف خالی"}</span>
      </Link>
      {toast && (
        <Link href={toast.kind === "esc" ? "/escalations" : "/conversations"} onClick={() => setToast(null)}
          className={`fixed top-16 left-4 z-50 max-w-sm rounded-xl px-4 py-2.5 text-[13px] shadow-lg ring-1 ${
            toast.kind === "esc" ? "bg-rose-50 text-rose-800 ring-rose-300" : "bg-emerald-50 text-emerald-800 ring-emerald-300"
          }`}>
          {toast.msg}
        </Link>
      )}
    </>
  );
}
