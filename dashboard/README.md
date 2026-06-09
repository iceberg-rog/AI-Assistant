# Shelter Support AI — Console (MVP Dashboard)

داشبورد Phase-1 روی **داده‌ی واقعی** تحلیل‌شده. Next.js 15 + Tailwind v4، RTL فارسی، تم تیره.

## اجرا
```bash
cd dashboard
npm install        # یک‌بار
npm run dev        # http://localhost:3939
```

## ماژول‌ها
| مسیر | محتوا |
|---|---|
| `/` | نمای کلی: KPIها، نمودار حجم ساعتی، توزیع tier، حجم موضوعات |
| `/queue` | **صف تأیید + Evidence Card** — قلب «قابل‌کانفرم»: هر فکت با منبع+timestamp، دکمه‌های تأیید/ویرایش/رد |
| `/taxonomy` | ۲۷ intent با سطح auto/copilot/human + ابزارها |
| `/golden` | مرورگر ۱۳ پاسخ طلایی + پنل وارسی |
| `/hallucinations` | فکت‌های جعلیِ گرفته‌شده توسط وارسی تخاصمی |
| `/dns` | رجیستری DNS + اسکلت مانیتور یکپارچگی |

## داده
از `dashboard/data/*.json` خوانده می‌شود (کپیِ self-contained از `analysis/out/kb/`).
`mock_queue.json` تنها داده‌ی نمایشی است؛ بقیه **واقعی**اند.

## قدم بعد (اتصال backend)
لایه‌ی `data/*.json` با toolهای زنده (`get_subscription`, `get_registered_ip`, `get_server_status`, …) و یک Policy-Gate واقعی جایگزین می‌شود. تصمیم‌های معماری: `../analysis/ARCHITECTURE_DECISIONS.md`.
