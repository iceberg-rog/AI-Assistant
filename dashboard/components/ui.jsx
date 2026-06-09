import { TIER } from "@/lib/data";

export function Card({ children, className = "" }) {
  return (
    <div className={`card-grad rounded-xl border border-black/[0.08] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, sub, kicker }) {
  return (
    <header className="mb-6">
      {kicker && <div className="text-xs font-semibold tracking-wide text-emerald-600 mb-1">{kicker}</div>}
      <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
      {sub && <p className="text-sm text-zinc-600 mt-1 leading-6">{sub}</p>}
    </header>
  );
}

export function TierBadge({ tier }) {
  const t = TIER[tier] || { label: tier, cls: "text-zinc-800 bg-zinc-500/20 ring-zinc-400/40" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.cls}`}>
      {t.label}
    </span>
  );
}

export function Stat({ label, value, hint, accent = "white" }) {
  const accents = {
    white: "text-zinc-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    sky: "text-sky-600",
  };
  return (
    <Card className="p-4">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accents[accent]}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </Card>
  );
}

export function Confidence({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 85 ? "bg-emerald-500" : pct >= 75 ? "bg-sky-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-zinc-600">{pct}%</span>
    </div>
  );
}
