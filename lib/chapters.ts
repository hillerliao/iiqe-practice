// IIQE 章節名稱對照表
// 用於統計頁「各章節表現」將 ref(例 "1.1")補上對應章節名稱
// 結構:ref 前兩段(X.Y) → { main: 主章節名, sub: 子章節名 }

export type ChapterInfo = {
  /** 主章節名稱(不含編號),例:"風險及保險" */
  main: string;
  /** 子章節名稱(不含編號),例:"風險的概念" */
  sub: string;
  /** 完整路徑(主 + 子),例:"風險及保險 / 風險的概念" */
  path: string;
};

/**
 * P1「原則及實務」章節對照表
 * 資料來源:用戶提供的 P1 目錄(7 大章,涵蓋至 X.Y.Z 三層子節)
 * 鍵格式為 ref 前兩段(例 "1.1"),不含後續的細項編號
 */
const P1_CHAPTERS: Record<string, { main: string; sub: string }> = {
  // 第一章 風險及保險
  "1.1": { main: "風險及保險", sub: "風險的概念" },
  "1.2": { main: "風險及保險", sub: "保險的功能及好處" },

  // 第二章 法律原則
  "2.1": { main: "法律原則", sub: "合約法" },
  "2.2": { main: "法律原則", sub: "代理法" },

  // 第三章 保險原則
  "3.1": { main: "保險原則", sub: "可保權益" },
  "3.2": { main: "保險原則", sub: "最高誠信" },
  "3.3": { main: "保險原則", sub: "近因" },
  "3.4": { main: "保險原則", sub: "彌償" },
  "3.5": { main: "保險原則", sub: "分擔" },
  "3.6": { main: "保險原則", sub: "代位" },

  // 第四章 保險公司的主要功能
  "4.1": { main: "保險公司的主要功能", sub: "產品的開發" },
  "4.2": { main: "保險公司的主要功能", sub: "客戶服務" },
  "4.3": { main: "保險公司的主要功能", sub: "市場行銷及促銷" },
  "4.4": { main: "保險公司的主要功能", sub: "保險的銷售" },
  "4.5": { main: "保險公司的主要功能", sub: "核保" },
  "4.6": { main: "保險公司的主要功能", sub: "保單的處理" },
  "4.7": { main: "保險公司的主要功能", sub: "理賠" },
  "4.8": { main: "保險公司的主要功能", sub: "再保險" },
  "4.9": { main: "保險公司的主要功能", sub: "精算支援" },
  "4.10": { main: "保險公司的主要功能", sub: "會計及投資" },
  "4.11": { main: "保險公司的主要功能", sub: "培訓及發展" },
  "4.12": { main: "保險公司的主要功能", sub: "管控要員" },

  // 第五章 香港保險業的結構
  "5.1": { main: "香港保險業的結構", sub: "保險業務的種類" },
  "5.2": { main: "香港保險業的結構", sub: "行業規模" },
  "5.3": { main: "香港保險業的結構", sub: "保險公司" },
  "5.4": { main: "香港保險業的結構", sub: "保險中介人" },
  "5.5": { main: "香港保險業的結構", sub: "業界協會/組織" },

  // 第六章 保險業的規管架構
  "6.1": { main: "保險業的規管架構", sub: "香港保險公司的規管" },
  "6.2": { main: "保險業的規管架構", sub: "香港保險中介人的規管" },

  // 第七章 職業道德及其他有關問題
  "7.1": { main: "職業道德及其他有關問題", sub: "保險中介人對保單持有人的責任" },
  "7.2": { main: "職業道德及其他有關問題", sub: "保護個人資料" },
  "7.3": { main: "職業道德及其他有關問題", sub: "平等機會事宜" },
  "7.4": { main: "職業道德及其他有關問題", sub: "防止洗錢及恐怖分子籌資活動" },
  "7.5": { main: "職業道德及其他有關問題", sub: "防止貪污" },
  "7.6": { main: "職業道德及其他有關問題", sub: "防止保險詐騙" },
};

/**
 * P3「投資相連長期保險」章節對照表
 * 預留結構,待補 TOC(目前統計頁遇到 P3 會 fallback 只顯示 ref)
 */
const P3_CHAPTERS: Record<string, { main: string; sub: string }> = {};

/** 依 paperCode 取得對照表(目前只有 P1) */
function getChaptersByPaper(paperCode: string): Record<string, { main: string; sub: string }> {
  if (paperCode === "P1") return P1_CHAPTERS;
  if (paperCode === "P3") return P3_CHAPTERS;
  return {};
}

/**
 * 取得章節資訊
 * @param paperCode 卷別代碼(例 "P1" / "P3")
 * @param ref 題目 ref(例 "1.1"、"1.1.2a"),函式內部會自動取前兩段
 * @returns 找到時回傳 { main, sub, path };找不到回傳 null
 */
export function getChapterInfo(paperCode: string, ref: string): ChapterInfo | null {
  const prefix = (ref || "").split(".").slice(0, 2).join(".");
  if (!prefix) return null;
  const table = getChaptersByPaper(paperCode);
  const entry = table[prefix];
  if (!entry) return null;
  return {
    main: entry.main,
    sub: entry.sub,
    path: `${entry.main} / ${entry.sub}`,
  };
}
