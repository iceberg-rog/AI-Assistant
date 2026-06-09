"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "نمای کلی", icon: "▣" },
  { href: "/conversations", label: "مکالمات (زنده)", icon: "❒" },
  { href: "/users", label: "کاربران", icon: "👤" },
  { href: "/queue", label: "صف تأیید", icon: "✓", badge: "زنده" },
  { href: "/escalations", label: "صف پشتیبانی انسانی", icon: "🔔" },
  { href: "/incidents", label: "اطلاعیه / اختلال", icon: "📣" },
  { href: "/selftest", label: "خودآزمایی کیفیت", icon: "🧪" },
  { href: "/observability", label: "Tool-Calls و Action-Log", icon: "⟁" },
  { href: "/learning", label: "یادگیری از اپراتور", icon: "✎", badge: "new" },
  { href: "/taxonomy", label: "تاکسونومی Intent", icon: "⊞" },
  { href: "/golden", label: "پاسخ‌های طلایی", icon: "★" },
  { href: "/hallucinations", label: "توهمات گرفته‌شده", icon: "⚠" },
  { href: "/dns", label: "رجیستری DNS", icon: "◈" },
  { href: "/connect", label: "اتصال تلگرام", icon: "⚙", badge: "setup" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-64 shrink-0 border-l border-black/10 bg-white px-3 py-5 flex flex-col">
      <div className="px-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30 grid place-items-center text-emerald-600 font-bold">S</div>
          <div>
            <div className="text-sm font-bold text-zinc-900 leading-tight">Shelter Console</div>
            <div className="text-[10px] text-zinc-500">پشتیبانی هوشمند</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {NAV.map((n) => {
          const active = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/25"
                  : "text-zinc-500 hover:bg-black/[0.04] hover:text-zinc-800"
              }`}
            >
              <span className="text-base opacity-80">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.badge && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-600 ring-1 ring-emerald-500/30">
                  {n.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pt-4 mt-4 border-t border-black/10 text-[10px] leading-5 text-zinc-500">
        داده‌ی واقعی Phase-1 · ۴۰٬۱۸۹ چت
        <br /> هر عدد قابل‌چک به منبع
      </div>
    </aside>
  );
}
