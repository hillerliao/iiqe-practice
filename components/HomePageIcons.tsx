"use client";

import { ArrowRight, FileText, FileQuestion, NotebookPen } from "lucide-react";

interface IconProps {
  className?: string;
}

// 为 HomePage 提供的客户端图标包装,避免 lucide SVG 在 SSR 阶段渲染
// (DarkReader 会在 hydration 前修改 SVG 属性,导致 hydration mismatch)
export const HomeArrowRight = ({ className }: IconProps) => (
  <ArrowRight className={className} />
);

export const HomeFileText = ({ className }: IconProps) => (
  <FileText className={className} />
);

export const HomeFileQuestion = ({ className }: IconProps) => (
  <FileQuestion className={className} />
);

export const HomeNotebookPen = ({ className }: IconProps) => (
  <NotebookPen className={className} />
);