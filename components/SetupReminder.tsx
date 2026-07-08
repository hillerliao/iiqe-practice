"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Settings } from "lucide-react";
import {
  getSessionId,
  isCustomSessionId,
  SESSION_CHANGE_EVENT,
} from "@/lib/session";

// 未設定自訂識別碼時顯示的全局頂部黃色引導橫幅。
// 不可關閉,直到使用者在 /settings 設定 Email 格式 ID 為止。
export function SetupReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      const id = getSessionId();
      setShow(!isCustomSessionId(id));
    };
    check();
    window.addEventListener(SESSION_CHANGE_EVENT, check);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, check);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
    >
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
        <p className="text-xs sm:text-sm flex-1 min-w-0 leading-relaxed">
          你目前使用的是隨機識別碼，資料只存在這台瀏覽器。設定一個自訂識別碼後，可跨裝置同步你的作答、收藏、筆記，清快取也不怕遺失。
        </p>
        <Link
          href="/settings#device-id"
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-100/60 dark:bg-amber-900/40 px-2.5 py-1 text-xs sm:text-sm font-medium hover:bg-amber-200/80 dark:hover:bg-amber-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:focus-visible:ring-amber-600 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          前往設定
        </Link>
      </div>
    </div>
  );
}