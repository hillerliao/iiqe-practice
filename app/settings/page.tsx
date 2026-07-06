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
import {
  getSessionId,
  isCustomSessionId,
  getCustomIdDisplay,
  setCustomSessionId,
  resetSessionId,
} from "@/lib/session";

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
      setCustomSessionId(inputId);
      const newId = getSessionId();
      setCurrentId(newId);

      // 把舊 sessionId 的資料遷移到新 ID
      if (oldId && oldId !== newId) {
        setMigrating(true);
        try {
          const res = await fetch("/api/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromSessionId: oldId, toSessionId: newId }),
          });
          const data = await res.json();
          if (data.ok) {
            const m = data.migrated;
            setMigrateMsg(
              `已遷移 ${m.attempts} 次作答記錄、${m.favorites} 個收藏${
                m.conflicts > 0 ? `(合併衝突 ${m.conflicts} 個)` : ""
              }`
            );
          }
        } catch {
          // 遷移失敗不阻塞,ID 已切換成功,下次再試
        } finally {
          setMigrating(false);
        }
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setMigrateMsg(null);
      }, 4000);
      // 觸發整頁刷新,讓所有元件重新拉取新 session 的資料
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    }
  }

  function handleReset() {
    resetSessionId();
    setCurrentId(getSessionId());
    setInputId("");
    setConfirmReset(false);
    setSaved(false);
    setError(null);
    router.refresh();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪貼簿失敗
    }
  }

  const isCustom = isCustomSessionId(currentId);

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

      <Card className="mb-4">
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
                {currentId}
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
              所有作答記錄、收藏、錯題本都綁定此識別碼。換瀏覽器時,在下方輸入同樣的自訂 ID 即可同步資料。
            </p>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="customId">自訂識別碼</Label>
            <Input
              id="customId"
              type="text"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="例如:bruce2026"
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">
              僅限 3~32 字元的英文、數字、底線或連字號。可直接貼上上方「當前識別碼」的完整值(含 <code className="text-xs">user:</code> 前綴)。設定後,在其他瀏覽器輸入同樣的 ID 即可共用同一份資料。
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
              <li>在第一個瀏覽器設定一個自訂 ID(例如 <code className="text-xs bg-muted px-1 rounded">bruce2026</code>)</li>
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
