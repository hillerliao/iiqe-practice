import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SetupReminder } from "@/components/SetupReminder";
import { Analytics } from "@/components/Analytics";
import { GlobalHeader } from "@/components/GlobalHeader";
import { listHandbookEntries } from "@/lib/handbook";

// 本地字型檔 (.woff2): 用於建置環境無法訪問 fonts.gstatic.com 時的後備方案。
// - Geist Sans / Geist Mono 變數字型,權重範圍 100-900。
// - 與原 next/font/google(subsets:["latin"]) 行為等價: latin 變數子集。
// - 若之後恢復 Google Fonts 可訪問,只需把 localFont 換回 Geist / Geist_Mono。
const geistSans = localFont({
  src: "./fonts/geist-sans-latin.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "100 900",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
  preload: true,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "IIQE 做題家",
    template: "%s · IIQE 做題家",
  },
  description: "香港保險業監管局 IIQE 考試練習應用",
};

// 首次載入時,在第一次繪製前就把主題套用好,避免淺/深色閃爍 (FOUC)。
// 這個腳本會在 <head> 內同步執行,讀取 localStorage 並依系統偏好套用 .dark 類別。
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('iiqe:theme');
    var mode = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = (mode === 'system') ? (systemDark ? 'dark' : 'light') : mode;
    var root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 載入研習手冊列表,server-side 取出 title + version 以便下拉菜單顯示。
  // 菜單項的 href 指向 Next 從 public/handbook/ 直接 serve 的靜態 HTML。
  const handbookEntries = await listHandbookEntries();
  // 預設指向「卷一」(P1),這是最常用的基礎手冊
  const defaultSlug =
    handbookEntries.find((h) => h.slug === "exam1-2024")?.slug ??
    handbookEntries[0]?.slug ??
    "";

  return (
    <html
      lang="zh-HK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          // 內聯腳本需用 dangerouslySetInnerHTML 注入,確保在 HTML 解析時同步執行
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <GlobalHeader
            defaultSlug={defaultSlug}
            handbookEntries={handbookEntries}
          />
          <SetupReminder />
          <Analytics />
          <main className="flex-1">{children}</main>
          <footer className="border-t py-3 text-center text-xs text-muted-foreground">
            IIQE 做題家 · 讓練習更簡單
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
