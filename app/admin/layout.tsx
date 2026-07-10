"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authedFetch } from "@/lib/session-client";

type AdminMeta = {
  backend: "sqlite" | "kv" | "memory";
  writable: boolean;
  writableReason: string | null;
  papers: { id: string; code: string; name: string }[];
};

type GateState =
  | { status: "loading" }
  | { status: "denied"; reason: "not_admin" | "not_writable"; meta: AdminMeta | null };

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<GateState>({ status: "loading" });
  const [meta, setMeta] = useState<AdminMeta | null>(null);

  useEffect(() => {
    // 通過服務端 whoami 接口判斷管理員身份(身份來自簽名 Cookie)
    authedFetch(`/api/admin/whoami`)
      .then((r) => r.json())
      .then(({ isAdmin }: { isAdmin: boolean }) => {
        if (!isAdmin) {
          setGate({ status: "denied", reason: "not_admin", meta: null });
          return null;
        }
        return fetch("/api/admin/meta").then((r) => r.json());
      })
      .then((m?: AdminMeta) => {
        if (!m) return; // 已被 not_admin 處理或 meta 不存在
        setMeta(m);
        if (!m.writable) {
          setGate({ status: "denied", reason: "not_writable", meta: m });
        } else {
          setGate({ status: "loading" }); // transient, will switch to render below
        }
      })
      .catch(() => {
        setGate({ status: "denied", reason: "not_writable", meta: null });
      });
  }, []);

  if (gate.status === "loading" && !meta) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground">載入中...</p>
      </div>
    );
  }

  if (gate.status === "denied") {
    const isAdminIssue = gate.reason === "not_admin";
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings/feedback">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回題目反饋
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-6 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              {isAdminIssue ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <Database className="w-5 h-5" />
              )}
              <span className="font-medium">
                {isAdminIssue ? "無權限訪問" : "當前部署不支持題目編輯"}
              </span>
            </div>
            <p className="text-muted-foreground">
              {isAdminIssue
                ? "此頁面僅供管理員使用,如需訪問請聯繫系統管理員。"
                : gate.meta?.writableReason ?? "請確認伺服器 DATABASE_URL 已配置。"}
            </p>
            {gate.meta && (
              <p className="text-xs text-muted-foreground">
                當前後端: <code className="bg-muted px-1 rounded">{gate.meta.backend}</code>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings/feedback">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回題目反饋
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          後端: <code className="bg-muted px-1 rounded">{meta?.backend}</code>{" "}
          · 管理員模式
        </span>
      </div>
      {children}
    </div>
  );
}