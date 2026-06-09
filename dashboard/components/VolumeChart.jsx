import { Card } from "@/components/ui";

// pure-CSS hourly volume bars (customer vs support) — no chart lib
export default function VolumeChart({ byHour }) {
  const hours = Array.from({ length: 24 }, (_, h) => {
    const [c = 0, s = 0] = byHour[String(h)] || [0, 0];
    return { h, c, s };
  });
  const max = Math.max(...hours.map((x) => x.c + x.s), 1);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-zinc-900">حجم پیام بر حسب ساعت شبانه‌روز</div>
          <div className="text-[11px] text-zinc-500">مجموع ۷.۵ ماه · پایه‌ی baseline تشخیص بحران</div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-zinc-500"><i className="h-2 w-2 rounded-sm bg-sky-500 inline-block" /> کاربر</span>
          <span className="flex items-center gap-1 text-zinc-500"><i className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" /> پشتیبان</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-40" dir="ltr">
        {hours.map((x) => (
          <div key={x.h} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="w-full flex flex-col justify-end h-36">
              <div className="w-full bg-emerald-500/80 rounded-t-sm" style={{ height: `${(x.s / max) * 100}%` }} />
              <div className="w-full bg-sky-500/80" style={{ height: `${(x.c / max) * 100}%` }} />
            </div>
            <span className="text-[8px] text-zinc-500 tabular-nums">{x.h}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
