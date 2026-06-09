"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Soft-refreshes the current server component on an interval so live pages update in real time
// (new messages, new drafts, new escalations) without a manual reload or losing scroll/state.
export default function AutoRefresh({ interval = 4000 }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") router.refresh();
    }, interval);
    return () => clearInterval(t);
  }, [router, interval]);
  return null;
}
