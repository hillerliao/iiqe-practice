import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Home, BarChart3, BookOpen, Star, Settings } from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SetupReminder } from "@/components/SetupReminder";
import { Analytics } from "@/components/Analytics";
import { HandbookNavLink } from "@/components/HandbookNavLink";
import { getHandbook, listHandbookSlugs } from "@/lib/handbook";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 載入研習手冊列表,server-side 取出 title + version 以便下拉菜單顯示。
  // 菜單項的 href 指向 Next 從 public/handbook/ 直接 serve 的靜態 HTML。
  const handbookSlugs = await listHandbookSlugs();
  const handbookEntries = (
    await Promise.all(
      handbookSlugs.map(async (slug) => {
        const h = await getHandbook(slug);
        return h ? { slug, title: h.title, version: h.version } : null;
      }),
    )
  ).filter((x): x is { slug: string; title: string; version: string } => x !== null);
  // 預設指向「卷一」(P1),這是最常用的基礎手冊
  const defaultSlug = handbookEntries.find((h) => h.slug === "exam1-2024")?.slug
    ?? handbookEntries[0]?.slug
    ?? "";

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
            <div className="max-w-6xl mx-auto px-2 sm:px-4 h-14 flex items-center gap-2 sm:gap-6 min-w-0">
              <Link
                href="/"
                className="font-semibold text-base sm:text-lg flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap"
              >
                <BookOpen className="w-5 h-5 shrink-0" />
                <span className="hidden min-[380px]:inline">IIQE 做题家</span>
                <span className="min-[380px]:hidden">IIQE</span>
              </Link>
              <nav className="flex gap-0.5 sm:gap-1 text-sm items-center flex-1 min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Link
                  href="/"
                  className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Home className="w-4 h-4" />
                  <span className="hidden md:inline">首頁</span>
                </Link>
                <Link
                  href="/stats"
                  className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden md:inline">統計</span>
                </Link>
                <Link
                  href="/wrongbook"
                  className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden md:inline">錯題本</span>
                </Link>
                <Link
                  href="/favorites"
                  className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Star className="w-4 h-4" />
                  <span className="hidden md:inline">收藏</span>
                </Link>
                {defaultSlug && handbookEntries.length > 0 && (
                  <HandbookNavLink defaultSlug={defaultSlug} handbooks={handbookEntries} />
                )}
                <Link
                  href="/settings"
                  className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden md:inline">設定</span>
                </Link>
              </nav>
              <div className="shrink-0">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <SetupReminder />
          <Analytics />
          <main className="flex-1">{children}</main>
          <footer className="border-t py-3 text-center text-xs text-muted-foreground">
            IIQE 做題家· 讓刷題更簡單
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
