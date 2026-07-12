"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { adminFetch } from "@/lib/admin-fetch";
import type { QuestionData } from "@/lib/data";

type Meta = {
  papers: { id: string; code: string; name: string }[];
};

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch("/api/admin/meta").then((r) => r.json() as Promise<Meta>),
      adminFetch<{ question: QuestionData }>(`/api/admin/questions/${id}`),
    ])
      .then(([m, qResp]) => {
        setMeta(m);
        setQuestion(qResp.question);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">載入中...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!question || !meta) {
    return <p className="text-sm text-muted-foreground">無資料</p>;
  }

  return <QuestionEditor mode="edit" initial={question} papers={meta.papers} />;
}