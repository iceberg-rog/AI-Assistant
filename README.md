# Shelter Support AI

پشتیبانیِ نیمه‌خودکارِ انسان‌گونه برای سرویسِ DNS اختصاصیِ شلتر (احرازِ هویت با IP). پیام‌های تلگرام را می‌گیرد، با Claude (دو‌لایه: `haiku → sonnet`) جوابی **گرفته از KBِ واقعی** می‌سازد، و به‌صورتِ پیش‌فرض در حالتِ **Copilot** هر جواب را برای تأییدِ اپراتور نگه می‌دارد. هیچ فکتی از حافظهٔ مدل ساخته نمی‌شود — فقط از KB یا toolِ زنده.

## 🚀 نصبِ سرور (پروداکشن)
کلِ سیستم (کانکتور + داشبورد) داخلِ **یک کانتینرِ داکر**:
```bash
git clone https://github.com/iceberg-rog/AI-Assistant.git && cd AI-Assistant
cp .env.example .env && nano .env        # توکن + کلیدِ Claude + endpointها رو پر کن
docker compose up -d --build
```
بعد مرورگر → `http://آی‌پیِ‌سرور:3939`. راهنمای کامل (پیش‌نیازها، امنیت، بکاپ، رفعِ اشکال): **[DEPLOY.md](DEPLOY.md)**.

## 🧩 ساختار
- `core/` — موتورِ TypeScript: کلسیفایر + Policy-Gate + مغزِ Claude + adapterِ تلگرام (روی Node native TS، بدونِ build).
- `dashboard/` — کنسولِ Next.js 15 (RTL فارسی)، پورتِ 3939.
- `Dockerfile` · `docker-compose.yml` · `docker/` — نصبِ تک‌کانتینری.

## 💻 توسعهٔ لوکال (نه پروداکشن)
> برای نصبِ روی سرور **از داکرِ بالا استفاده کن**، نه این دستورها.
```bash
npm --prefix dashboard install
npm --prefix dashboard run dev     # داشبوردِ dev روی http://localhost:3939
node core/run-live.ts              # کانکتورِ واقعی (نیاز به .env)
npm --prefix core test             # تست‌ها
```

## ⚙️ پیکربندی
همهٔ کلیدها در `.env` (از روی `.env.example`): توکنِ بات، کلیدِ Claude، endpointهای DB/IP، و تنظیماتِ مدل/حالت. مدل و حالتِ ارسال از خودِ داشبورد (صفحهٔ «اتصال تلگرام») هم قابلِ تغییرند.

## داشبورد
نمای کلی · مکالماتِ زنده · صفِ تأیید · صفِ پشتیبانیِ انسانی · تاکسونومیِ intent · پاسخ‌های طلایی · توهماتِ گرفته‌شده · رجیستریِ DNS · خودآزمایی · اتصالِ تلگرام.
