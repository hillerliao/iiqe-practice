"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { QuestionListTable } from "@/components/admin/QuestionListTable";

type Meta = {
  backend: string;
  writable: boolean;
  papers: { id: string; code: string; name: string }[];
};

export default function AdminQuestionsPage() {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    fetch("/api/admin/meta")
      .then((r) => r.json())
      .then((m: Meta) => setMeta(m))
      .catch(() => setMeta(null));
  }, []);

  if (!meta) {
    return <p className="text-sm text-muted-foreground">載入中...</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">題目管理</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            從下方選擇試卷與來源,搜索題面 / 選項 / ref。點擊「編輯」修改題目,點擊「新增題目」追加新題。
          </p>
        </CardContent>
      </Card>

      <QuestionListTable
        papers={meta.papers}
        initialPaperCode={meta.papers[0]?.code ?? "P1"}
        initialSource="exam"
      />
    </div>
  );
}