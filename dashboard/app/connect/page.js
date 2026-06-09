import fs from "node:fs";
import path from "node:path";
import { Card, PageHeader, Stat } from "@/components/ui";
import ConnTest from "@/components/ConnTest";
import SettingsEditor from "@/components/SettingsEditor";
import BotTokenEditor from "@/components/BotTokenEditor";

export const dynamic = "force-dynamic"; // read live status each request

const read = (name, fb) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8")); }
  catch { return fb; }
};

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="h-6 w-6 shrink-0 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 grid place-items-center text-[12px] text-emerald-600">{n}</div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="text-sm text-zinc-900 mb-1">{title}</div>
        <div className="text-[12px] text-zinc-500 leading-6">{children}</div>
      </div>
    </div>
  );
}

const Code = ({ children }) => (
  <code className="ltr inline-block rounded bg-zinc-50 ring-1 ring-black/10 px-1.5 py-0.5 text-[11px] text-emerald-600 font-mono">{children}</code>
);

function BaseRow({ k, v, ok, mono }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-black/[0.08]">
      <span className="text-[12px] text-zinc-500">{k}</span>
      <span className={`text-[12px] ${ok ? "text-emerald-600" : "text-zinc-500"} ${mono ? "ltr font-mono" : ""}`}>{v}</span>
    </div>
  );
}

const ownerName = (bc) => [bc?.user?.first_name, bc?.user?.last_name].filter(Boolean).join(" ") || "اکانت پشتیبانی";
const dateFa = (unix) => { try { return new Date((unix || 0) * 1000).toLocaleDateString("fa-IR"); } catch { return ""; } };

export default function ConnectPage() {
  const s = read("connection_status.json", { botOnline: false, businessConnections: 0, error: "not_started" });
  // heartbeat-based liveness (process death flips this off)
  const hbAge = s.heartbeatAt ? Date.now() - Date.parse(s.heartbeatAt) : Infinity;
  const online = !!s.botOnline && hbAge < 15000;
  const accounts = (read("business_connections.json", { items: [] }).items || []).filter((b) => b && b.is_enabled !== false);
  const bot = s.bot || "@بات";

  const connected = online && accounts.length > 0;
  const state = connected
    ? { label: `متصل ✅ (${accounts.length} اکانت)`, cls: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/30" }
    : online
    ? { label: "بات آنلاین — منتظر اتصال اکانت", cls: "text-sky-600 bg-sky-500/10 ring-sky-500/30" }
    : { label: "بات آفلاین", cls: "text-zinc-500 bg-zinc-500/10 ring-zinc-500/30" };

  return (
    <div>
      <PageHeader
        kicker="اتصال تلگرام"
        title="اتصال به اکانت‌های پشتیبانی"
        sub={`این بات (${bot}) رو می‌تونی به هر تعداد اکانتِ پشتیبانی که خواستی وصل کنی. هر اکانت خودش بات رو از Business → Chatbots اضافه می‌کنه و این‌جا زنده ظاهر می‌شه.`}
      />

      {/* live status */}
      <Card className={`p-4 mb-4 ${connected ? "glow-emerald" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-900">وضعیت زنده</div>
          <span className={`rounded-md px-2.5 py-1 text-[12px] ring-1 ring-inset ${state.cls}`}>{state.label}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="بات" value={bot} accent={online ? "emerald" : "white"} />
          <Stat label="اکانت‌های متصل" value={accounts.length} accent={accounts.length ? "emerald" : "amber"} hint="هر تعداد مجاز است" />
          <Stat label="حالت" value={s.autoReply ? "ارسالِ خودکار" : "تأیید قبل از ارسال"} hint={s.autoReply ? "جواب‌ها خودکار می‌روند" : "هر جواب را تو تأیید می‌کنی"} accent="sky" />
          <Stat label="پردازش‌شده" value={s.processed || 0} hint={s.lastActivity ? "آخرین: " + s.lastActivity.slice(11, 16) : "—"} />
        </div>
        {!online && (
          <p className="text-[11px] text-zinc-500 mt-3 pt-3 border-t border-black/10">
            connector اجرا نیست (heartbeat قدیمی). بعد از اجرای <Code>node core/run-live.ts</Code> این صفحه وضعیت واقعی را نشان می‌دهد.
          </p>
        )}
      </Card>

      {/* add / replace the support bot by its token */}
      <BotTokenEditor currentBot={bot} />

      {/* connected accounts — DYNAMIC list, one row per support account */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-900">اکانت‌های پشتیبانیِ متصل</div>
          <span className="text-[10px] text-zinc-500 ltr">live · business_connections</span>
        </div>
        {accounts.length === 0 ? (
          <div className="text-center py-7">
            <div className="text-2xl mb-2">🔌</div>
            <div className="text-[13px] text-zinc-600 leading-7 max-w-md mx-auto">
              هنوز هیچ اکانتی وصل نشده. روی هر اکانتِ پشتیبانی‌ای که می‌خوای، مرحلهٔ ۲ پایین رو انجام بده — بات <b className="text-zinc-800 ltr">{bot}</b> رو اضافه کن، خودش این‌جا ظاهر می‌شه.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-black/10 overflow-hidden">
            {accounts.map((bc) => (
              <div key={bc.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-black/[0.07] last:border-b-0">
                <div className="h-9 w-9 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/25 grid place-items-center text-[13px] text-emerald-700 shrink-0">{ownerName(bc).trim().slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-900 truncate">
                    {ownerName(bc)}
                    {bc.user?.username && <span className="text-zinc-500 ltr text-[11px] mr-1"> @{bc.user.username}</span>}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {bc.partial
                      ? <>اتصالِ فعال · <span className="ltr">{String(bc.id).slice(0, 12)}…</span> · جزئیاتِ مالک بعد از ویرایشِ اتصال می‌آید</>
                      : <span className="ltr">id {bc.user?.id ?? bc.user_chat_id ?? "—"}{bc.date ? " · از " + dateFa(bc.date) : ""}</span>}
                  </div>
                </div>
                <span className="text-[11px] rounded-md px-2 py-0.5 ring-1 ring-inset bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 shrink-0">فعال</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* live connection test — tests every integration (Claude test is FREE) */}
      <ConnTest />

      {/* editable non-secret settings + secret-presence status */}
      <SettingsEditor />

      {/* steps — now GENERIC: works for any account */}
      <Card className="p-5 mb-4">
        <div className="text-sm font-semibold text-zinc-900 mb-4">افزودنِ بات به یک اکانتِ پشتیبانی (برای هر اکانت تکرار کن)</div>
        <Step n="۱" title="بات آماده است">
          بات <Code>{bot}</Code> ساخته و آنلاین است. لازم نیست بات جدید بسازی — همین یک بات به هر تعداد اکانت وصل می‌شود.
        </Step>
        <Step n="۲" title="روی اکانتِ پشتیبانی، بات را اضافه کن (اکانت باید Premium باشد)">
          داخلِ همان اکانتِ تلگرام: <Code>Settings → Telegram Business → Chatbots</Code> → یوزرنیمِ <Code>{bot}</Code> را وارد کن → مجوزِ <b>«Reply to messages»</b> را بده.
          برای رول‌اوتِ امن، scope را اول روی <Code>new chats</Code> بگذار. به محضِ افزودن، اکانت در لیستِ بالا ظاهر می‌شود.
        </Step>
        <Step n="۳" title="(اختیاری) برای جداکردنِ هر اکانت">
          همهٔ اکانت‌ها از همین یک connector مدیریت می‌شوند؛ پیام‌های هر اکانت با <Code>business_connection_id</Code> خودش از هم جدا می‌مانند. کافی‌ست مرحلهٔ ۲ را روی اکانتِ بعدی هم انجام دهی.
        </Step>
      </Card>

      {/* recommendation */}
      <Card className="p-4 border-amber-500/20">
        <p className="text-[12px] text-amber-700/90 leading-6">
          ⚠ پیشنهاد: قبل از اضافه‌کردن روی اکانتِ اصلی، یک اکانتِ تستی را وصل کن و یک پیام بفرست تا رفتارِ پنجرهٔ ۲۴ ساعته و inline keyboard را ببینی. اگر inline محدود بود، live-adapter خودکار به متنِ ساده fallback می‌کند.
        </p>
      </Card>
    </div>
  );
}
