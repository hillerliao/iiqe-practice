"""
compare_toc.py — 比對 PDF 開頭目錄 (p.3-8) 與 build_handbook.py 抽出的章節
"""
import json
import os
import re
import sys

import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(os.path.dirname(ROOT), "保險原理及實務 研習手冊 2024.pdf")
JSON_PATH = os.path.join(ROOT, "public", "handbook", "exam1-2024.json")

# 從 PDF 目錄頁(p.3-8)抽取所有章節編號
TOC_RE_H1 = re.compile(r"^([1-7])\s+([^.\d].+?)\s+\d+/\d+$")
TOC_RE_H2 = re.compile(r"^(\d+)\.(\d+)\s+(.+?)\s+\d+/\d+$")
TOC_RE_H3 = re.compile(r"^(\d+)\.(\d+)\.(\d+)\s+(.+)$")


def extract_toc():
    """從 PDF 開頭目錄頁抽取出所有預期章節編號。"""
    expected: dict[str, str] = {}
    with pdfplumber.open(PDF_PATH) as pdf:
        for p in range(3, 9):
            text = pdf.pages[p - 1].extract_text(layout=False) or ""
            for line in text.splitlines():
                line = line.strip()
                m1 = TOC_RE_H1.match(line)
                if m1:
                    chap = int(m1.group(1))
                    title = m1.group(2).strip()
                    expected[f"ch-{chap}"] = title
                    continue
                m2 = TOC_RE_H2.match(line)
                if m2:
                    a, b = int(m2.group(1)), int(m2.group(2))
                    title = m2.group(3).strip()
                    expected[f"ch-{a}-{b}"] = title
                    continue
                m3 = TOC_RE_H3.match(line)
                if m3:
                    a, b, c = int(m3.group(1)), int(m3.group(2)), int(m3.group(3))
                    title = m3.group(4).strip()
                    expected[f"ch-{a}-{b}-{c}"] = title
    return expected


def main():
    expected = extract_toc()
    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)
    actual_ids = {ch["id"] for ch in data["chapters"]}

    print(f"PDF 目錄列出 {len(expected)} 個章節")
    print(f"build_handbook 抓到 {len(actual_ids)} 個章節")
    print()

    # 找缺漏(expected - actual)
    missing = sorted(set(expected.keys()) - actual_ids)
    print(f"=== 缺漏 ({len(missing)}) ===")
    for k in missing:
        print(f"  {k:20s}  {expected[k]}")
    print()

    # 找多餘(actual - expected)
    extra = sorted(actual_ids - set(expected.keys()))
    print(f"=== 多餘 ({len(extra)}) ===")
    for k in extra:
        ch = next(c for c in data["chapters"] if c["id"] == k)
        print(f"  {k:20s}  {ch['number']}  {ch['title']}  (p.{ch['page']})")
    print()

    # 一致清單(略)


if __name__ == "__main__":
    main()
