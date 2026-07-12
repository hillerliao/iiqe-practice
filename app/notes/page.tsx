"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NotebookPen } from "lucide-react";
import { authedFetch } from "@/lib/session-client";
import { NoteItemCard } from "@/components/NoteItemCard";

type NoteItem = {
  questionId: string;
  content: string;
  updatedAt: string;
  paperCode: string;
  paperName: string;
  question: {
    id: string;
    number: number;
    ref: string;
    question: string;
    options: Record<string, string>;
    answer: string;
    explanation: string | null;
  };
};

export default function NotesPage() {
  const [items, setItems] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    authedFetch(`/api/notes`)
      .then((r) => {
        if (!r.ok) throw new Error("載入筆記失敗");
        return r.json();
      })
      .then((data) => {
        setItems(data.items);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">
        載入中...
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <NotebookPen className="w-6 h-6 text-amber-600" />
          筆記本
        </h1>
        {items.length > 0 && (
          <span className="text-sm text-muted-foreground">共 {items.length} 則</span>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>尚無筆記</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              在答題頁面點 <NotebookPen className="w-3.5 h-3.5 inline" /> 加筆記,即可在此處查看與管理。
            </p>
            <Button asChild variant="link" className="px-0 mt-2">
              <Link href="/">返回首頁開始刷題</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <NoteItemCard key={it.questionId} item={it} onDeleted={load} />
          ))}
        </div>
      )}
    </div>
  );
}
