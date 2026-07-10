"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QuestionEditor } from "@/components/admin/QuestionEditor";

type Meta = {
  papers: { id: string; code: string; name: string }[];
};

function NewQuestionForm() {
  const searchParams = useSearchParams();
  const initialPaper = searchParams.get("paperCode") ?? "P1";
  const initialSource =
    (searchParams.get("source") as "exam" | "mock" | null) ?? "exam";
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    fetch("/api/admin/meta")
      .then((r) => r.json() as Promise<Meta>)
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  if (!meta) {
    return <p className="text-sm text-muted-foreground">載入中...</p>;
  }

  return (
    <QuestionEditor
      mode="create"
      papers={meta.papers}
      defaultPaperCode={initialPaper}
      defaultSource={initialSource}
    />
  );
}

export default function NewQuestionPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">載入中...</p>}>
      <NewQuestionForm />
    </Suspense>
  );
}