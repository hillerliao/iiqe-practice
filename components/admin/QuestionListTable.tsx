"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Search, Plus, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin-fetch";
import type { QuestionData } from "@/lib/data";

type Paper = { id: string; code: string; name: string };

type ListResp = {
  items: QuestionData[];
  total: number;
  limit: number;
  offset: number;
};

export function QuestionListTable({
  papers,
  initialPaperCode,
  initialSource,
}: {
  papers: Paper[];
  initialPaperCode: string;
  initialSource: "exam" | "mock";
}) {
  const [paperCode, setPaperCode] = useState(initialPaperCode);
  const [source, setSource] = useState<"exam" | "mock">(initialSource);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(() => setSearch(searchInput.trim()));
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      paperCode,
      source,
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set("q", search);
    adminFetch<ListResp>(`/api/admin/questions?${params.toString()}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [paperCode, source, search, limit, offset]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  function gotoPage(p: number) {
    setOffset(Math.max(0, (p - 1) * limit));
  }

  function truncate(s: string, n: number) {
    return s.length > n ? s.slice(0, n) + "..." : s;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={paperCode}
            onChange={(e) => {
              setPaperCode(e.target.value);
              setOffset(0);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="選擇試卷"
          >
            {papers.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as "exam" | "mock");
              setOffset(0);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="選擇來源"
          >
            <option value="exam">真題</option>
            <option value="mock">模擬題</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索題面 / 選項 / ref"
              className="pl-7"
            />
          </div>
          <Button asChild size="sm">
            <Link
              href={`/admin/questions/new?paperCode=${paperCode}&source=${source}`}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              新增題目
            </Link>
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="text-xs text-muted-foreground">
          {loading ? "載入中..." : `共 ${total} 題,當前第 ${currentPage} / ${pageCount} 頁`}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 px-2 font-medium w-16">題號</th>
                <th className="py-2 px-2 font-medium w-24">ref</th>
                <th className="py-2 px-2 font-medium">題面</th>
                <th className="py-2 px-2 font-medium w-16">答案</th>
                <th className="py-2 px-2 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    沒有符合條件的題目
                  </td>
                </tr>
              )}
              {data?.items.map((q) => (
                <tr key={q.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 font-mono text-xs">#{q.number}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">
                    {q.ref || "—"}
                  </td>
                  <td className="py-2 px-2">
                    <div className="line-clamp-2 text-foreground">
                      {truncate(q.question, 80)}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <Badge
                      variant={q.answer ? "default" : "secondary"}
                      className={cn("uppercase")}
                    >
                      {q.answer || "—"}
                    </Badge>
                  </td>
                  <td className="py-2 px-2">
                    <Button asChild variant="ghost" size="xs">
                      <Link href={`/admin/questions/${q.id}`}>
                        <Pencil className="w-3 h-3 mr-1" />
                        編輯
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-end gap-1 pt-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={currentPage <= 1}
              onClick={() => gotoPage(currentPage - 1)}
            >
              <ChevronLeft className="w-3 h-3 mr-1" />
              上一頁
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {currentPage} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={currentPage >= pageCount}
              onClick={() => gotoPage(currentPage + 1)}
            >
              下一頁
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}