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
 * P3「長期保險」章節對照表(2022 年版)
 * 鍵格式為 ref 前兩段(例 "1.1"),不含後續的細項編號
 * 來源:scripts/build_handbook_p3.py 從 PDF 抽取的章節樹(31 個 H2)
 */
const P3_CHAPTERS: Record<string, { main: string; sub: string }> = {
  // 第一章 人壽保險簡介
  "1.1": { main: "人壽保險簡介", sub: "壽險定義" },
  "1.2": { main: "人壽保險簡介", sub: "壽險原則" },
  "1.3": { main: "人壽保險簡介", sub: "壽險保費的計算" },

  // 第二章 人壽保險及年金的種類
  "2.1": { main: "人壽保險及年金的種類", sub: "傳統的人壽保險類別" },
  "2.2": { main: "人壽保險及年金的種類", sub: "非傳統的人壽保險類別" },
  "2.3": { main: "人壽保險及年金的種類", sub: "年金及退休金" },
  "2.4": { main: "人壽保險及年金的種類", sub: "團體及個人保險計劃" },

  // 第三章 保險利益附約及其他產品
  "3.1": { main: "保險利益附約及其他產品", sub: "殘疾保險利益" },
  "3.2": { main: "保險利益附約及其他產品", sub: "意外保險利益" },
  "3.3": { main: "保險利益附約及其他產品", sub: "提前支付死亡保險利益" },
  "3.4": { main: "保險利益附約及其他產品", sub: "醫療保險利益" },
  "3.5": { main: "保險利益附約及其他產品", sub: "可保權利益" },
  "3.6": { main: "保險利益附約及其他產品", sub: "通貨膨脹調整" },

  // 第四章 闡釋人壽保險單
  "4.1": { main: "闡釋人壽保險單", sub: "完整合約條款" },
  "4.2": { main: "闡釋人壽保險單", sub: "不可異議條款" },
  "4.3": { main: "闡釋人壽保險單", sub: "寬限期" },
  "4.4": { main: "闡釋人壽保險單", sub: "受益人的指定" },
  "4.5": { main: "闡釋人壽保險單", sub: "不能作廢條款" },
  "4.6": { main: "闡釋人壽保險單", sub: "保單抵押貸款" },
  "4.7": { main: "闡釋人壽保險單", sub: "復效" },
  "4.8": { main: "闡釋人壽保險單", sub: "誤報年齡或性別" },
  "4.9": { main: "闡釋人壽保險單", sub: "轉讓" },
  "4.10": { main: "闡釋人壽保險單", sub: "紅利選擇" },
  "4.11": { main: "闡釋人壽保險單", sub: "賠付選擇" },
  "4.12": { main: "闡釋人壽保險單", sub: "自殺除外責任" },

  // 第五章 人壽保險程序
  "5.1": { main: "人壽保險程序", sub: "公司運作" },
  "5.2": { main: "人壽保險程序", sub: "投保" },
  "5.3": { main: "人壽保險程序", sub: "核保" },
  "5.4": { main: "人壽保險程序", sub: "簽發保單" },
  "5.5": { main: "人壽保險程序", sub: "售後服務" },
  "5.6": { main: "人壽保險程序", sub: "理賠" },
};

/** 依 paperCode 取得對照表(目前只有 P1) */
function getChaptersByPaper(paperCode: string): Record<string, { main: string; sub: string }> {
  if (paperCode === "P1") return P1_CHAPTERS;
  if (paperCode === "P3") return P3_CHAPTERS;
  return {};
}

/**
 * 從題目 ref 取得可安全識別的二級章節鍵。
 * 只接受字串開頭的 X.Y，避免替 "2(b)"、".1.2" 等殘缺資料猜測章節。
 */
export function getChapterKey(ref: string): string | null {
  const match = (ref || "").trim().match(/^(\d+)\s*\.\s*(\d+)/);
  if (!match) return null;
  return `${Number(match[1])}.${Number(match[2])}`;
}

/**
 * 取得章節資訊
 * @param paperCode 卷別代碼(例 "P1" / "P3")
 * @param ref 題目 ref(例 "1.1"、"1.1.2a"),函式內部會自動取二級章節鍵
 * @returns 找到時回傳 { main, sub, path };找不到回傳 null
 */
export function getChapterInfo(paperCode: string, ref: string): ChapterInfo | null {
  const prefix = getChapterKey(ref);
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
