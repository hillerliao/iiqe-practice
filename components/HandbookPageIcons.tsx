"use client";

import { ArrowLeft, BookOpen } from "lucide-react";

interface IconProps {
  className?: string;
}

// 为 HandbookPage(/studynotes/[slug]) 提供的客户端图标包装
// 避免 lucide SVG 在 SSR 阶段被 DarkReader 修改导致 hydration mismatch
export const HandbookArrowLeft = ({ className }: IconProps) => (
  <ArrowLeft className={className} />
);

export const HandbookBookOpen = ({ className }: IconProps) => (
  <BookOpen className={className} />
);