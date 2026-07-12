"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import type { QuestionData } from "@/lib/data";

type OptionKey = "a" | "b" | "c" | "d";
const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

type Paper = { id: string; code: string; name: string };

export type QuestionEditorProps = {
  mode: "create" | "edit";
  /** edit 模式必填 */
  initial?: QuestionData;
  /** create 模式必填,默認的 paperCode */
  defaultPaperCode?: string;
  /** create 模式必填,默認的 source */
  defaultSource?: "exam" | "mock";
  papers: Paper[];
};

export function QuestionEditor({
  mode,
  initial,
  defaultPaperCode,
  defaultSource,
  papers,
}: QuestionEditorProps) {
  const router = useRouter();

  // ---- 表單狀態 ----
  const [paperCode, setPaperCode] = useState(
    mode === "edit" ? initial!.id.split("-")[0] : defaultPaperCode ?? papers[0]?.code ?? "P1"
  );
  const [source, setSource] = useState<"exam" | "mock">(
    mode === "edit" ? (initial!.source as "exam" | "mock") : defaultSource ?? "exam"
  );
  const [numberInput, setNumberInput] = useState(
    mode === "edit" ? String(initial!.number) : ""
  );
  const [ref, setRef] = useState(initial?.ref ?? "");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [options, setOptions] = useState<Record<OptionKey, string>>({
    a: initial?.options.a ?? "",
    b: initial?.options.b ?? "",
    c: initial?.options.c ?? "",
    d: initial?.options.d ?? "",
  });
  const [answer, setAnswer] = useState<OptionKey | "">(
    (initial?.answer as OptionKey | undefined) ?? ""
  );
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [pageInput, setPageInput] = useState(
    initial?.page != null ? String(initial.page) : ""
  );
  const [sourceLabel, setSourceLabel] = useState(initial?.sourceLabel ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- 預覽 id ----
  const previewId =
    mode === "edit"
      ? initial!.id
      : numberInput && Number.isFinite(Number(numberInput)) && Number(numberInput) > 0
        ? `${paperCode}-${source}-${numberInput}`
        : `${paperCode}-${source}-?`;

  // ---- 校驗 ----
  const trimmedQuestion = question.trim();
  const trimmedOptions = {
    a: options.a.trim(),
    b: options.b.trim(),
    c: options.c.trim(),
    d: options.d.trim(),
  };
  const trimmedRef = ref.trim();
  const trimmedExplanation = explanation.trim();
  const trimmedSourceLabel = sourceLabel.trim();
  const pageNum = pageInput === "" ? null : Number(pageInput);
  const pageValid =
    pageInput === "" || (typeof pageNum === "number" && Number.isFinite(pageNum) && pageNum > 0);

  const valid =
    !!trimmedQuestion &&
    OPTION_KEYS.every((k) => trimmedOptions[k]) &&
    !!answer &&
    pageValid &&
    (mode === "edit" || (Number.isFinite(Number(numberInput)) && Number(numberInput) > 0));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;

    if (
      !window.confirm(
        mode === "create"
          ? `確認新增題目 ${previewId}?\n將寫入 SQLite 並回寫 data/questions-*.json。`
          : `確認儲存 ${initial!.id} 的修改?\n將寫入 SQLite 並回寫 JSON。`
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create") {
        const body = {
          paperCode,
          source,
          question: trimmedQuestion,
          options: trimmedOptions,
          answer,
          ref: trimmedRef,
          explanation: trimmedExplanation || null,
          page: pageNum,
          sourceLabel: trimmedSourceLabel || null,
        };
        const { question: created } = await adminFetch<{ question: QuestionData }>(
          "/api/admin/questions",
          { method: "POST", body: JSON.stringify(body) }
        );
        router.push(`/admin/questions/${created.id}`);
        router.refresh();
      } else {
        const body = {
          question: trimmedQuestion,
          options: trimmedOptions,
          answer,
          ref: trimmedRef,
          explanation: trimmedExplanation || null,
          page: pageNum,
          sourceLabel: trimmedSourceLabel || null,
        };
        await adminFetch(`/api/admin/questions/${initial!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        router.push("/admin/questions");
        router.refresh();
      }
    } catch (e) {
      if (e instanceof AdminApiError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "儲存失敗");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Cmd/Ctrl+Enter 提交
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && valid && !submitting) {
        e.preventDefault();
        handleSubmit({ preventDefault: () => undefined } as FormEvent);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, submitting, trimmedQuestion, trimmedOptions, answer, numberInput, paperCode, source, trimmedRef, trimmedExplanation, pageInput, trimmedSourceLabel]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {mode === "create" ? "新增題目" : `編輯題目 ${initial!.id}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* id + paperCode + source + number */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">paperCode</Label>
              {mode === "edit" ? (
                <Input value={paperCode} disabled className="font-mono text-xs" />
              ) : (
                <select
                  value={paperCode}
                  onChange={(e) => setPaperCode(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {papers.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">source</Label>
              {mode === "edit" ? (
                <Input value={source} disabled className="font-mono text-xs" />
              ) : (
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as "exam" | "mock")}
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="exam">真題 (exam)</option>
                  <option value="mock">模擬題 (mock)</option>
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">number</Label>
              {mode === "edit" ? (
                <Input value={numberInput} disabled className="font-mono text-xs" />
              ) : (
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  placeholder="新題號"
                  className="font-mono text-xs"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">預覽 id</Label>
              <Input
                value={previewId}
                disabled
                className="font-mono text-xs text-muted-foreground"
              />
            </div>
          </div>

          {/* ref + page + sourceLabel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ref</Label>
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="例如 1.1.2(a)"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">page</Label>
              <Input
                type="number"
                min="1"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                placeholder="可空"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">sourceLabel</Label>
              <Input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="例如 2021年版"
                className="text-xs"
              />
            </div>
          </div>

          {/* question */}
          <div className="space-y-1.5">
            <Label className="text-xs">題目內容</Label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              className="w-full p-2 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y whitespace-pre-wrap break-words"
              placeholder="題幹..."
            />
          </div>

          {/* options */}
          <div className="space-y-2">
            <Label className="text-xs">選項</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {OPTION_KEYS.map((k) => (
                <div key={k} className="flex items-start gap-2">
                  <span className="uppercase font-mono text-xs font-bold text-muted-foreground pt-1.5 w-5">
                    {k}.
                  </span>
                  <textarea
                    value={options[k]}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                    rows={2}
                    className="flex-1 p-2 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y whitespace-pre-wrap break-words"
                    placeholder={`選項 ${k.toUpperCase()}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* answer */}
          <div className="space-y-1.5">
            <Label className="text-xs">正確答案</Label>
            <RadioGroup
              value={answer}
              onValueChange={(v) => setAnswer(v as OptionKey)}
              className="flex gap-3"
            >
              {OPTION_KEYS.map((k) => (
                <label
                  key={k}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border px-3 py-1.5 cursor-pointer text-sm",
                    "hover:bg-muted/50 transition-colors",
                    "has-[[data-checked]]:border-primary has-[[data-checked]]:bg-muted/40"
                  )}
                >
                  <RadioGroupItem value={k} aria-label={`選項 ${k.toUpperCase()}`} />
                  <span className="uppercase font-mono">{k}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* explanation */}
          <div className="space-y-1.5">
            <Label className="text-xs">解析 (可空)</Label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              className="w-full p-2 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y whitespace-pre-wrap break-words"
              placeholder="可選,留空表示無解析"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              提示:Cmd / Ctrl + Enter 直接提交
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={!valid || submitting}>
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1" />
                )}
                {mode === "create" ? "新增" : "儲存"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}