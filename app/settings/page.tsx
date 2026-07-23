"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, RotateCcw, Copy, Check, AlertTriangle } from "lucide-react";
import { ThemeSettings } from "@/components/ThemeSettings";
import { AutoAdvanceSettings } from "@/components/AutoAdvanceSettings";
import {
  getSessionId,
  isCustomSessionId,
  getCustomIdDisplay,
  setCustomSessionId,
  resetSessionId,
  restoreSessionId,
  emitSessionChange,
  validateCustomId,
} from "@/lib/session";
import { authedFetch, reestablishSession } from "@/lib/session-client";

export default function SettingsPage() {
  const router = useRouter();
  const [currentId, setCurrentId] = useState("");
  const [inputId, setInputId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const id = getSessionId();
    setCurrentId(id);
    if (isCustomSessionId(id)) {
      setInputId(getCustomIdDisplay(id));
    }
  }, []);

  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setMigrateMsg(null);
    const oldId = currentId;
    try {
      // 先驗證 ID 格式,但不寫入 localStorage
      const newId = validateCustomId(inputId);
      if (oldId === newId) {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
        return;
      }

      // 先遷移資料（from 由服務端依已驗證 Cookie 決定，客戶端僅傳目標），
      // 成功後才切換 ID
      if (oldId) {
        setMigrating(true);
        const res = await authedFetch("/api/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toSessionId: newId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "遷移請求失敗");
        }
        const data = await res.json();
        if (data.ok && data.migrated) {
          const m = data.migrated;
          if (m.attempts > 0 || m.favorites > 0 || m.notes > 0) {
            setMigrateMsg(
              `已遷移 ${m.attempts} 次作答記錄、${m.favorites} 個收藏`
            );
          }
        }
      }

      // 遷移成功後先更新 localStorage，再重建簽名 Cookie；只有兩者一致時才通知全局元件。
      const switchedId = setCustomSessionId(inputId);
      try {
        await reestablishSession();
      } catch (error) {
        if (oldId) restoreSessionId(oldId);
        throw error;
      }
      emitSessionChange(switchedId);
      setCurrentId(switchedId);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setMigrateMsg(null);
      }, 4000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setMigrating(false);
    }
  }

  async function handleReset() {
    const oldId = currentId;
    const newId = resetSessionId();
    try {
      await reestablishSession();
    } catch (error) {
      if (oldId) restoreSessionId(oldId);
      setError(error instanceof Error ? error.message : "重置失敗");
      return;
    }
    emitSessionChange(newId);
    setCurrentId(newId);
    setInputId("");
    setConfirmReset(false);
    setSaved(false);
    setError(null);
    router.refresh();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪貼簿失敗
    }
  }

  const isCustom = isCustomSessionId(currentId);
  const displayId = isCustom ? getCustomIdDisplay(currentId) : currentId;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回首頁
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-6">設定</h1>

      <ThemeSettings />
      <AutoAdvanceSettings />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">題目反饋</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            練習時遇到題目、答案或排版的錯誤?前往反饋頁提交,管理員會在後台處理。
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/feedback">查看反饋記錄</Link>
          </Button>
        </CardContent>
      </Card>

      <Card id="device-id" className="mb-4 scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            裝置識別碼
            {isCustom ? (
              <Badge variant="secondary" className="text-xs">自訂</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">隨機</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>當前識別碼</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all">
                {displayId}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              換瀏覽器時,在下方設定同樣的自訂 ID 即可同步資料。
            </p>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="customId">自訂識別碼</Label>
            <Input
              id="customId"
              type="text"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="例如：you@example.com"
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              須為有效 Email 或 3-32 位英數帳號（可含 _ 或 -）。設定後，在其他瀏覽器輸入同樣的 ID 即可共用同一份資料。
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleSave}
                disabled={
                  migrating ||
                  !inputId.trim() ||
                  inputId.trim() === getCustomIdDisplay(currentId)
                }
                size="sm"
              >
                <Save className="w-4 h-4 mr-1" />
                {migrating ? "遷移中..." : saved ? "已儲存" : "儲存"}
              </Button>
              {error && (
                <span className="text-sm text-red-600">{error}</span>
              )}
              {migrateMsg && (
                <span className="text-sm text-green-600">{migrateMsg}</span>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>重置為隨機識別碼</Label>
            <p className="text-xs text-muted-foreground">
              放棄自訂 ID,重新生成隨機識別碼。注意:這會切換到一份空白的資料,原自訂 ID 的資料仍保留在資料庫,可隨時再輸入回來。
            </p>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReset}
                >
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  確認重置
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmReset(false)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmReset(true)}
                disabled={!isCustom}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                重置
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">跨瀏覽器同步說明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">步驟:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>在第一個瀏覽器設定一個自訂 ID（例如 <code className="text-xs bg-muted px-1 rounded">you@example.com</code>）</li>
              <li>作答、收藏等資料會綁定到這個 ID</li>
              <li>在另一個瀏覽器打開本頁,輸入同樣的自訂 ID</li>
              <li>儲存後即會切換到同一份資料,繼續之前的進度</li>
            </ol>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs">
            <p className="font-medium mb-1">注意事項</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>自訂 ID 未加密,請勿使用敏感個資</li>
              <li>若兩人使用相同 ID,資料會混在一起</li>
              <li>隨機 ID 換瀏覽器無法自動同步,必須用自訂 ID</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
