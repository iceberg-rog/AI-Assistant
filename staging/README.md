# Step 4.1 — Telegram Business Connection Staging Probe

هدف: **قبل از ساخت اسکلت کامل**، تنها ریسکِ تأییدنشده‌ی معماری را واقعی بسنجیم — رفتار کانال Business Connection. هیچ‌چیز مخرب نیست؛ همه‌ی پاسخ‌ها واضحاً پیام تست‌اند.

## چه چیزی را تست می‌کند (چک‌لیست تو)
| # | آیتم | چطور |
|---|---|---|
| ۱ | دریافت `business_message` | هندلر هر پیام را لاگ می‌کند |
| ۲ | تشخیص کاربر | id/نام/یوزرنیم از `from` |
| ۳ | reply ساده on-behalf | `sendMessage` با `business_connection_id` |
| ۴ | پنجره‌ی ۲۴ ساعته | خطاهای ارسال ثبت می‌شوند + دستور `/replyto` برای تستِ دستی |
| ۵ | inline keyboard | پیام تست با `inline_keyboard` → موفق/رد لاگ می‌شود |
| ۶ | takeover دستی | `/pause` پاسخ خودکار را خاموش می‌کند |
| ۷ | pause/resume | `/pause` و `/resume` |
| ۸ | event log | `events.jsonl` + لاگ زنده `http://localhost:4040` |

## راه‌اندازی (این بخش با توست — نیاز به تلگرامِ تو)
1. **بات بساز:** `@BotFather` → `/newbot` → توکن را کپی کن.
2. **اتصال به اکانت پشتیبانی** `@ShelterAdm` (نیاز به **Telegram Premium**):
   `Settings → Telegram Business → Chatbots` → یوزرنیم بات را اضافه کن →
   مجوز **«Reply to messages»** را بده → دامنه‌ی چت‌ها را انتخاب کن (برای تست، یک scope محدود).
3. **توکن را بگذار:** فایل `staging/.token` (یک خط) یا `setx TELEGRAM_BOT_TOKEN "<token>"`.
4. **اجرا:**
   ```powershell
   node staging/telegram-probe.mjs
   ```
5. از یک **اکانت تلگرامِ دوم**، به `@ShelterAdm` پیام بده. لاگ زنده: `http://localhost:4040`.
6. **کنترل اپراتور:** بات را مستقیم DM کن:
   `/status` · `/pause` · `/resume` · `/conn` · `/help` · `/replyto <bcid> <chat_id> <text>`

## چه چیزی را موقع تست ببین (نتیجه‌ی این ریسک‌تست)
- آیا `reply.inline.ok` می‌آید یا `reply.inline.err`؟ → آیا inline keyboard روی on-behalf مجاز است؟
- آیا reply به چتِ قدیمی‌تر از ۲۴h با خطای پنجره رد می‌شود؟ (`/replyto`) → تأیید قیدِ ۲۴h.
- مجوزهای واقعی در رویداد `business_connection` (`rights` / `can_reply`).
- آیا `/pause` واقعاً پاسخ خودکار را قطع می‌کند تا اپراتور دستی جواب دهد؟

## نتیجه → ورودیِ قدم ۴.۲
هر چیزی که اینجا قرمز شد (مثلاً اگر inline رد شد) → طراحیِ fallback: quick-command داخلی اپراتور، یا دکمه در داشبورد به‌جای داخل تلگرام، یا deep-link. بعد اسکلت کامل (`tools/*` + Policy-Gate + webhook) ساخته می‌شود.

> `node` تنها — بدون وابستگی. Node ۱۸+ (روی این سیستم ۲۵). long-polling است، پس نیازی به URL عمومی/webhook نیست.
