"""
從研習手冊 JSON 的 html 字段中提取各章節純文本。
按 id="ch-X-Y-Z" 錨點切分，輸出 { section_number: text } 映射。

用法: python scripts/extract_handbook_sections.py
輸出: scripts/cache_handbook_sections.json
"""

import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
HANDBOOK_DIR = ROOT / "public" / "handbook"
OUTPUT = Path(__file__).resolve().parent / "cache_handbook_sections.json"

# 要處理的手冊文件
HANDBOOK_FILES = [
    "exam1-2024.json",
    "exam3-2022.json",
]


def extract_sections(html: str) -> dict[str, str]:
    """將手冊 HTML 按 ch-* 錨點切分為 { section_number: plain_text }。"""
    soup = BeautifulSoup(html, "html.parser")
    sections: dict[str, str] = {}

    # 找到所有帶 id="ch-..." 的標題元素
    headings = soup.find_all(re.compile(r"^h[1-3]$"), id=re.compile(r"^ch-"))

    for i, heading in enumerate(headings):
        anchor_id: str = heading["id"]  # e.g. "ch-1-1-2"
        # 從錨點 id 提取章節編號: "ch-1-1-2" -> "1.1.2"
        section_num = anchor_id.replace("ch-", "").replace("-", ".")

        # 收集從當前標題到下一個標題之間的所有文本
        texts: list[str] = []
        # 標題本身的文本(去掉 page-badge 連結)
        heading_text = heading.get_text(strip=True)
        # 移除 "PDF p.N" 字樣
        heading_text = re.sub(r"\s*PDF p\.\d+\s*$", "", heading_text)
        if heading_text:
            texts.append(heading_text)

        # 遍歷後續兄弟元素直到下一個標題
        for sibling in heading.find_next_siblings():
            if sibling.name in ("h1", "h2", "h3") and sibling.get("id", "").startswith("ch-"):
                break
            text = sibling.get_text(strip=True)
            if text:
                texts.append(text)

        sections[section_num] = "\n".join(texts)

    return sections


def main():
    result: dict[str, dict[str, str]] = {}

    for filename in HANDBOOK_FILES:
        filepath = HANDBOOK_DIR / filename
        slug = filename.replace(".json", "")
        print(f"Processing {filename}...")

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        html = data.get("html", "")
        if not html:
            print(f"  WARNING: no html field in {filename}")
            continue

        sections = extract_sections(html)
        result[slug] = sections
        print(f"  Extracted {len(sections)} sections")

        # 顯示前 3 個章節的摘要
        for num in list(sections.keys())[:3]:
            preview = sections[num][:80].replace("\n", " ")
            print(f"    {num}: {preview}...")

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nSaved to {OUTPUT}")


if __name__ == "__main__":
    main()
