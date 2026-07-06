import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Home, BarChart3, BookOpen, Star, Settings } from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SetupReminder } from "@/components/SetupReminder";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "IIQE 做题家",
    template: "%s · IIQE 做题家",
  },
  description: "香港保險業監管局 IIQE 考試刷題應用",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4 sm:gap-6">
              <Link
                href="/"
                className="font-semibold text-lg flex items-center gap-2 shrink-0 whitespace-nowrap"
              >
                <BookOpen className="w-5 h-5" />
IIQE 做题家
              </Link>
              <nav className="flex gap-1 text-sm items-center shrink min-w-0">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Home className="w-4 h-4" />
                  <span className="hidden md:inline">首頁</span>
                </Link>
                <Link
                  href="/stats"
                  className="px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden md:inline">統計</span>
                </Link>
                <Link
                  href="/wrongbook"
                  className="px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden md:inline">錯題本</span>
                </Link>
                <Link
                  href="/favorites"
                  className="px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Star className="w-4 h-4" />
                  <span className="hidden md:inline">收藏</span>
                </Link>
                <Link
                  href="/settings"
                  className="px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden md:inline">設定</span>
                </Link>
              </nav>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <SetupReminder />
          <main className="flex-1">{children}</main>
          <footer className="border-t py-3 text-center text-xs text-muted-foreground">
            IIQE 做題家· 讓刷題更簡單
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
