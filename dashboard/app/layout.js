import "./globals.css";
import Sidebar from "@/components/Sidebar";
import NotificationBell from "@/components/NotificationBell";

export const metadata = {
  title: "Shelter Support AI Console",
  description: "کنسول پشتیبانی هوشمند شلتر — داده‌ی قابل‌کانفرم",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <NotificationBell />
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 bg-[#eef1f5]">
            <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
