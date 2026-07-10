"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Trash2, ChevronDown, ChevronUp, Database, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { authedFetch } from "@/lib/session-client";
import type { QuestionData } from "@/lib/data";

type FeedbackItem = {
  id: string;
  sessionId: string;
  questionId: string;
  paperCode: string;
  source: string;
  sourceLabel: string | null;
  number: number;
  ref: string | null;
  category: "question_error" | "answer_error" | "explanation_unclear" | "typo";
  description: string;
  userAnswer: string | null;
  userAgent: string;
  createdAt: string;
  question: QuestionData | null;
};

const CATEGORY_LABELS: Record<FeedbackItem["category"], string> = {
  question_error: "題目有錯",
  answer_error: "答案有錯",
  explanation_unclear: "解析不清",
  typo: "排版錯誤",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-Hant", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SessionBadge({ sessionId }: { sessionId: string }) {
  const display = sessionId.startsWith("user:") ? sessionId.slice(5) : sessionId;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }
  const isCustom = sessionId.startsWith("user:");
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "已複製" : `複製 sessionId (${sessionId})`}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
        "bg-muted hover:bg-muted/70 text-muted-foreground",
        copied && "text-green-600"
      )}
    >
      {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
      {isCustom ? `user:${display}` : display.slice(0, 12)}
    </button>
  );
}

function FeedbackCard({
  item,
  isAdmin,
  onDeleted,
}: {
  item: FeedbackItem;
  isAdmin: boolean;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const q = item.question;

  async function handleDelete() {
    if (!window.confirm("確定刪除這條反饋?此操作無法復原。")) return;
    setDeleting(true);
    try {
      const res = await authedFetch(`/api/feedback/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onDeleted(item.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setDeleting(false);
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(item, null, 2));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2 text-sm">
        <div className="flex items-center justify-between flex-wrap gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{item.paperCode}</Badge>
            <Badge variant="outline">{item.source === "exam" ? "真題" : "模擬題"}</Badge>
            <span className="font-medium">#{item.number}</span>
            {item.ref && (
              <Badge variant="outline" className="text-xs">
                {item.ref}
              </Badge>
            )}
            <Badge
              variant={item.category === "answer_error" ? "destructive" : "secondary"}
              className="text-xs"
            >
              {CATEGORY_LABELS[item.category]}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isAdmin && <SessionBadge sessionId={item.sessionId} />}
            <span>{formatTime(item.createdAt)}</span>
          </div>
        </div>

        <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {item.description}
        </p>

        {item.userAnswer && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">用戶原答:</span> {item.userAnswer}
          </div>
        )}

        {q && (
          <details
            open={expanded}
            onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
            className="text-xs"
          >
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none flex items-center gap-1">
              {expanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              題幹 / 答案
            </summary>
            <div className="mt-2 p-2 bg-muted/30 rounded space-y-1.5">
              <p className="font-medium text-foreground">{q.question}</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {Object.entries(q.options).map(([k, v]) => (
                  <li
                    key={k}
                    className={cn(
                      "flex gap-1.5",
                      k === q.answer && "text-green-700 dark:text-green-400 font-medium"
                    )}
                  >
                    <span className="uppercase">{k}.</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
              {q.explanation && (
                <p className="text-muted-foreground italic pt-1 border-t border-border/50">
                  解析: {q.explanation}
                </p>
              )}
            </div>
          </details>
        )}

        {isAdmin && (
          <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/50">
            <Button asChild variant="ghost" size="xs">
              <Link href={`/admin/questions/${item.questionId}`}>
                <Pencil className="w-3 h-3" />
                去編輯此題
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={copyJson}
              title="複製 JSON"
            >
              {copiedAll ? (
                <Check className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              JSON
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? "刪除中..." : "刪除"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState<boolean>(false);
  const [adminToken, setAdminToken] = useState<string>("");
  const [loginErr, setLoginErr] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/feedback?limit=500`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAdmin = useCallback(() => {
    authedFetch(`/api/admin/whoami`)
      .then((r) => r.json())
      .then(({ isAdmin }: { isAdmin: boolean }) => setAdmin(!!isAdmin))
      .catch(() => setAdmin(false));
  }, []);

  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function adminLogin() {
    setLoginErr(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: adminToken }),
      });
      if (!res.ok) {
        setLoginErr("令牌無效");
        return;
      }
      setAdminToken("");
      setAdmin(true);
      fetchData();
    } catch {
      setLoginErr("登入失敗");
    }
  }

  async function copyAllJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(items, null, 2));
    } catch {
      /* ignore */
    }
  }

  function csvEscape(v: string): string {
    if (/[",\n\r]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }

  async function copyAllCsv() {
    const header = [
      "id",
      "createdAt",
      "sessionId",
      "paperCode",
      "source",
      "number",
      "ref",
      "category",
      "description",
      "userAnswer",
      "userAgent",
    ];
    const rows = items.map((it) =>
      [
        it.id,
        it.createdAt,
        it.sessionId,
        it.paperCode,
        it.source,
        String(it.number),
        it.ref ?? "",
        it.category,
        it.description,
        it.userAnswer ?? "",
        it.userAgent,
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    try {
      await navigator.clipboard.writeText(csv);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回設定
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {admin ? (
              <>
                <span>題目反饋</span>
                <Badge variant="destructive" className="text-xs">管理員視圖</Badge>
              </>
            ) : (
              <span>我的反饋</span>
            )}
          </CardTitle>
          {!admin && (
            <div className="pt-2 flex items-center gap-2 flex-wrap">
              <Input
                type="password"
                placeholder="管理員令牌"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                className="max-w-[200px] text-xs"
              />
              <Button size="sm" onClick={adminLogin}>管理員登入</Button>
              {loginErr && <span className="text-xs text-red-600">{loginErr}</span>}
            </div>
          )}
          {admin && (
            <div className="pt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/questions">
                  <Database className="w-3.5 h-3.5 mr-1" />
                  進入題目管理
                </Link>
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {admin && (
            <div className="flex items-center justify-end gap-1 text-xs">
              <Button variant="ghost" size="xs" onClick={copyAllJson} title="複製全部 JSON">
                <Copy className="w-3 h-3 mr-1" />JSON
              </Button>
              <Button variant="ghost" size="xs" onClick={copyAllCsv} title="複製全部 CSV">
                <Copy className="w-3 h-3 mr-1" />CSV
              </Button>
            </div>
          )}

          {!admin && items.length > 0 && (
            <div className="flex justify-end">
              <Button variant="ghost" size="xs" onClick={copyAllJson} title="複製我的反饋 JSON">
                <Copy className="w-3 h-3 mr-1" />
                複製為 JSON
              </Button>
            </div>
          )}

          {loading && (
            <p className="text-sm text-muted-foreground">載入中...</p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-muted-foreground">目前還沒有反饋記錄</p>
          )}

          <div className="space-y-2">
            {items.map((it) => (
              <FeedbackCard
                key={it.id}
                item={it}
                isAdmin={admin}
                onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
