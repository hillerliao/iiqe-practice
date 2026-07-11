#!/usr/bin/env python3
"""
READ-ONLY PDF 探索工具：只讀、不寫入任何資料檔。
用於掃描卷三 PDF 找出 Q46/Q47/Q48/Q78/Q79 在哪頁,並抽出該頁文字。

不會自動 mutate 任何 JSON 檔。如需 mutate,改跑 fix_cross_q_pollution.py。

用法:
  python scripts/_pdf_extract.py probe 46       # 找出 Q46 在哪頁 + 印該頁
  python scripts/_pdf_extract.py page 12        # 印第 12 頁
  python scripts/_pdf_extract.py dump 10-15     # 印頁 10..15
  python scripts/_pdf_extract.py find Q78       # 全文 grep 找包含 Q78 文字的頁
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
import pdfplumber

PDF = Path(r"D:\Downloads\IIQE\卷三 - 长期保险 - 2022 年版.pdf")


def get_pages() -> list[str]:
    with pdfplumber.open(PDF) as pdf:
        return [(p.extract_text() or "") for p in pdf.pages]


def show_range(start: int, end: int) -> None:
    pages = get_pages()
    for i in range(start - 1, min(end, len(pages))):
        print(f"\n========== PAGE {i+1} ==========")
        print(pages[i])


def find(query: str) -> None:
    """Find a query string across all pages and print matching pages."""
    pages = get_pages()
    found = 0
    for i, text in enumerate(pages):
        if query in text:
            found += 1
            print(f"\n--- PAGE {i+1} ---")
            print(text)
            if found >= 5:
                print(f"\n(... 已顯示 {found} 頁,如需更多請加 --all)")
                return


def probe(question_num: int) -> None:
    """Find page that contains question number 46/47/48/78/79."""
    pages = get_pages()
    # 真題的編號行格式: "46  ref  ANSWER  題幹" 或 "46 2.1.2  C  題幹"
    pattern = re.compile(rf"^\s*{question_num}\s+[\d.]+[a-z]?(?:\([a-z]\))?")
    for i, text in enumerate(pages):
        for line in text.splitlines():
            if pattern.match(line):
                print(f"\n--- PAGE {i+1} ---")
                print(text)
                return
    print(f"未找到編號 {question_num}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]
    if cmd == "probe" and len(argv) >= 3:
        probe(int(argv[2]))
    elif cmd == "page" and len(argv) >= 3:
        page = int(argv[2])
        show_range(page, page)
    elif cmd == "dump" and len(argv) >= 3:
        a, b = argv[2].split("-")
        show_range(int(a), int(b))
    elif cmd == "find" and len(argv) >= 3:
        find(argv[2])
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
