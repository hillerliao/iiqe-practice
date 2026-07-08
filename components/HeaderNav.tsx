"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BarChart3,
  BookOpen,
  Star,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/stats", label: "統計", icon: BarChart3 },
  { href: "/wrongbook", label: "錯題本", icon: BookOpen },
  { href: "/favorites", label: "收藏", icon: Star },
  { href: "/studynotes/exam1-2024", label: "研習手冊", icon: BookOpen },
  { href: "/settings", label: "設定", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 whitespace-nowrap text-sm transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-muted hover:text-foreground text-muted-foreground"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}

export function HeaderNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3 sm:gap-4">
        {/* Brand */}
        <Link
          href="/"
          className="font-semibold text-lg flex items-center gap-2 shrink-0 whitespace-nowrap"
        >
          <BookOpen className="w-5 h-5" />
          IIQE 做题家
        </Link>

        {/* Nav - icon-only on mobile, icon+text on md+ */}
        <nav className="flex gap-1 text-sm items-center flex-1 min-w-0">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
            />
          ))}
        </nav>

        {/* Theme toggle */}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
