import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Home, BarChart3, BookOpen, Star, Settings } from "lucide-react";

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
    default: "IIQE 刷題",
    template: "%s · IIQE 刷題",
  },
  description: "香港保險業監管局 IIQE 考試刷題應用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-HK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b bg-white sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4 sm:gap-6">
            <Link
              href="/"
              className="font-semibold text-lg flex items-center gap-2 shrink-0 whitespace-nowrap"
            >
              <BookOpen className="w-5 h-5" />
              IIQE 刷題
            </Link>
            <nav className="flex gap-1 text-sm overflow-x-auto items-center flex-1 min-w-0">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-md hover:bg-zinc-100 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Home className="w-4 h-4" />
                首頁
              </Link>
              <Link
                href="/stats"
                className="px-3 py-1.5 rounded-md hover:bg-zinc-100 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <BarChart3 className="w-4 h-4" />
                統計
              </Link>
              <Link
                href="/wrongbook"
                className="px-3 py-1.5 rounded-md hover:bg-zinc-100 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                錯題本
              </Link>
              <Link
                href="/favorites"
                className="px-3 py-1.5 rounded-md hover:bg-zinc-100 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Star className="w-4 h-4" />
                收藏
              </Link>
              <Link
                href="/settings"
                className="px-3 py-1.5 rounded-md hover:bg-zinc-100 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Settings className="w-4 h-4" />
                設定
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t bg-white py-3 text-center text-xs text-zinc-500">
          IIQE 刷題 · 個人複習用
        </footer>
      </body>
    </html>
  );
}
