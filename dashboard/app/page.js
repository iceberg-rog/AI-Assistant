import fs from "node:fs";
import path from "node:path";
import { data } from "@/lib/data";
import { Card, PageHeader, Stat, TierBadge } from "@/components/ui";
import VolumeChart from "@/components/VolumeChart";

export const dynamic = "force-dynamic"; // live numbers each request

const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const readJson = (name, fb) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8")); } catch { return fb; } };

const INTENT_FA = {
  greeting: "سلام/احوال‌پرسی", dns_config: "تنظیم DNS", connection_problem: "مشکل اتصال",
  buy_prepurchase: "پیش‌خرید", gratitude: "تشکر", complaint_angry: "شکایت/عصبانیت",
  subscription_status: "وضعیت اشتراک", speed_ping: "سرعت/پینگ", platform_setup: "تنظیم پلتفرم",
  profanity: "فحاشی", payment_gateway: "درگاه پرداخت", refund: "بازگشت وجه",
};

export default function Overview() {
  const m = data.metrics;
  const intents = data.taxonomy.intents || [];
  const tierCount = intents.reduce((a, i) => ((a[i.automation_tier] = (a[i.automation_tier] || 0) + 1), a), {});
  const coarse = Object.entries(m.intent_volume_coarse).sort((a, b) => b[1] - a[1]);
  const maxCoarse = coarse[0]?.[1] || 1;

  // ── LIVE operational state ──
  const status = readJson("connection_status.json", {});
  // botOnline is written once at startup and never flips off when the process dies — so trust the
  // 5s heartbeat: if it hasn't refreshed in >15s the connector is down (no messages can arrive).
  const hbAgeMs = status.heartbeatAt ? Date.now() - Date.parse(status.heartbeatAt) : Infinity;
  status.botOnline = !!status.botOnline && hbAgeMs < 15000;
  const events = (readJson("live_conversations.json", { events: [] }).events) || [];
  const escItems = (readJson("escalations_live.json", { items: [] }).items) || [];
  const users = readJson("conversation_state.json", {});
  const userArr = Object.values(users);

  const pending = events.filter((e) => (e.delivered === "held_copilot" || e.delivered === "queued_for_review") && e.reply).length;
  const escOpen = escItems.filter((x) => !x.resolved).length;
  const claudeUsed = events.filter((e) => (e.evidence?.tools || []).some((t) => t.name === "claude_review")).length;
  const kinds = events.reduce((a, e) => ((a[e.kind || "text"] = (a[e.kind || "text"] || 0) + 1), a), {});
  const totalIn = userArr.reduce((s, u) => s + (u.msgIn || 0), 0);
  const timeHM = (iso) => (iso ? iso.slice(11, 16) : "—");

  return (
    <div>
      <PageHeader
        kicker="SHELTER SUPPORT AI"
        title="نمای کلی"
        sub="وضعیتِ زنده‌ی سیستم بالا، تحلیلِ تاریخیِ داده‌ی آموزش پایین. هر عددِ زنده از فایل‌های واقعیِ کانکتور می‌آید."
      />

      {/* ── LIVE OPS ── */}
      <Card className={`p-4 mb-3 ${status.botOnline ? "glow-emerald" : "border-amber-500/20"}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${status.botOnline ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-zinc-900 font-semibold">{status.botOnline ? `زنده · ${status.bot}` : "connector خاموش"}</span>
            <span className="text-zinc-500 text-[12px]">· {status.autoReply ? "ارسالِ خودکار" : "تأیید قبل از ارسال"}</span>
          </div>
          <div className="text-[11px] text-zinc-500 ltr">
            {status.claude ? `🧠 ${status.claudeModel}` : "🧠 off"} · {timeHM(status.lastActivity)}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="کاربران" value={fmt(userArr.length)} hint={`${fmt(totalIn)} پیام تا حالا`} accent="emerald" />
          <Stat label="در انتظارِ تأیید" value={fmt(pending)} hint="درافِ معلق" accent="sky" />
          <Stat label="صفِ پشتیبانی انسانی" value={fmt(escOpen)} hint="باز" accent={escOpen > 0 ? "rose" : "emerald"} />
          <Stat label="بازبینیِ کلود" value={fmt(claudeUsed)} hint="پیامِ <۷۰٪ که کلود بازبینی کرد" accent="amber" />
        </div>
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-black/10 text-[11px] text-zinc-500">
          <span>پردازش‌شده (اخیر): <b className="text-zinc-800 ltr">{fmt(events.length)}</b></span>
          <span>💬 متن: <b className="text-zinc-800 ltr">{fmt(kinds.text || 0)}</b></span>
          <span>🎤 صوتی: <b className="text-zinc-800 ltr">{fmt(kinds.voice || 0)}</b></span>
          <span>🖼 عکس: <b className="text-zinc-800 ltr">{fmt(kinds.photo || 0)}</b></span>
          <span>DBِ کاربران: <b className={status.usersDB ? "text-emerald-600" : "text-zinc-500"}>{status.usersDB ? "متصل" : "—"}</b></span>
          <span>وایت‌لیستِ آیپی: <b className={status.ipWhitelist ? "text-emerald-600" : "text-zinc-500"}>{status.ipWhitelist ? "متصل" : "—"}</b></span>
        </div>
      </Card>

      {/* ── HISTORICAL (training-data analysis) ── */}
      <div className="text-[11px] tracking-widest text-zinc-500 mt-6 mb-2">تحلیلِ تاریخیِ داده‌ی آموزش — {fmt(m.dataset.total_messages)} پیامِ واقعی (نه زنده)</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="چت خصوصی (کاربر)" value={fmt(m.dataset.chats)} hint={m.dataset.window} />
        <Stat label="پیام کاربر / پشتیبان" value={`${fmt(m.dataset.customer_msgs)} / ${fmt(m.dataset.support_msgs)}`} />
        <Stat label="میانه پاسخ انسانی" value={`${m.sla.human_first_reply_median_min}′`} hint={`p90: ${m.sla.p90_min}′ · p99: ${m.sla.p99_min}′`} accent="amber" />
        <Stat label="نرخ پایان مثبت / منفی" value={`${Math.round(m.satisfaction_proxy.positive_rate * 100)}٪ / ${Math.round(m.satisfaction_proxy.negative_rate * 100)}٪`} accent="emerald" hint="proxy از تشکر/عصبانیت پایان چت" />
      </div>

      <Card className="p-4 mb-3">
        <div className="flex items-start gap-3">
          <span className="text-emerald-600 text-lg">◆</span>
          <p className="text-sm text-zinc-600 leading-7">
            <b className="text-zinc-900">مهم‌ترین فرصت اتومات‌سازی:</b> محصول DNS اختصاصیِ IP-authenticated است؛ کاربر باید قبل هر استفاده «ثبت آیپی» کند.
            شایع‌ترین تیکت «وصل نمیشه» است و جوابش تقریباً همیشه «دوباره آیپی‌تو ثبت کن».
          </p>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <VolumeChart byHour={data.volume.by_hour} />
        </div>
        <Card className="p-5">
          <div className="text-sm font-semibold text-zinc-900 mb-1">توزیع سطح اتومات‌سازی</div>
          <div className="text-[11px] text-zinc-500 mb-4">سهمِ حجمِ پیام (محاسبه‌ی واقعی) + تعدادِ intent از ۲۷ تاکسونومی</div>
          <div className="space-y-3">
            {["auto", "copilot", "human"].map((k) => {
              const pct = Math.round((m.automation_tier_volume?.[k]?.share || 0) * 100);
              const c = k === "auto" ? "bg-emerald-500" : k === "copilot" ? "bg-sky-500" : "bg-amber-500";
              return (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <TierBadge tier={k} />
                    <span className="text-[11px] text-zinc-500 tabular-nums">{tierCount[k] || 0} intent · {pct}٪ حجم</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
                    <div className={`h-full ${c}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-500 leading-5 mt-4 pt-3 border-t border-black/10">
            مالی، فحاشی، refund و فعال‌سازی دستی همیشه به انسان می‌رود — صرف‌نظر از tier.
          </p>
        </Card>
      </div>

      <Card className="p-5 mt-3">
        <div className="text-sm font-semibold text-zinc-900 mb-4">حجم موضوعات (تاریخی — regex روی پیام کاربر)</div>
        <div className="space-y-2">
          {coarse.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-28 text-[12px] text-zinc-600 shrink-0">{INTENT_FA[k] || k}</div>
              <div className="flex-1 h-5 rounded bg-black/[0.04] overflow-hidden" dir="ltr">
                <div className="h-full bg-gradient-to-l from-emerald-500/70 to-sky-500/40 rounded" style={{ width: `${(v / maxCoarse) * 100}%` }} />
              </div>
              <div className="w-16 text-left text-[11px] text-zinc-500 tabular-nums">{fmt(v)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
