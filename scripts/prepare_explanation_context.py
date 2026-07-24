"""
為指定題目準備 explanation 生成上下文：題目 + 選項 + 答案 + 手冊章節文本。
ref 回退策略: "1.2.3(c)" → 先找 "1.2.3"，無則 "1.2"，再無則 "1"。

用法:
  python scripts/prepare_explanation_context.py p3-exam 20      # P3-exam 前 20 題
  python scripts/prepare_explanation_context.py p1-exam 40 0    # P1-exam 第 0-39 題
  python scripts/prepare_explanation_context.py p1-exam 40 40   # P1-exam 第 40-79 題
  python scripts/prepare_explanation_context.py p1-mock 40 0    # P1-mock 第 0-39 題
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECTIONS_FILE = Path(__file__).resolve().parent / "cache_handbook_sections.json"

# 試卷配置
PAPERS = {
    "p1-exam": {
        "questions_file": ROOT / "data" / "questions-p1-exam.json",
        "handbook_slug": "exam1-2024",
    },
    "p1-mock": {
        "questions_file": ROOT / "data" / "questions-p1-mock.json",
        "handbook_slug": "exam1-2024",
    },
    "p3-exam": {
        "questions_file": ROOT / "data" / "questions-p3-exam.json",
        "handbook_slug": "exam3-2022",
    },
    "p3-mock": {
        "questions_file": ROOT / "data" / "questions-p3-mock.json",
        "handbook_slug": "exam3-2022",
    },
}


def ref_to_section(ref: str) -> str:
    """將 ref (如 "1.2.3(c)", "1.3.2b(a)") 轉為章節編號 "1.2.3"。"""
    parts = ref.split(".")
    nums = []
    for p in parts:
        m = re.match(r"^(\d+)", p)
        if m:
            nums.append(m.group(1))
        else:
            break
    return ".".join(nums)


def find_section_text(sections: dict[str, str], section_num: str) -> tuple[str, str]:
    """查找章節文本，帶回退。返回 (matched_section_num, text)。"""
    parts = section_num.split(".")
    for i in range(len(parts), 0, -1):
        candidate = ".".join(parts[:i])
        if candidate in sections:
            return candidate, sections[candidate]
    return "", ""


def main():
    if len(sys.argv) < 3:
        print("用法: python prepare_explanation_context.py <paper> <count> [offset]")
        print("  paper: p1-exam | p1-mock | p3-exam | p3-mock")
        print("  count: 題目數量")
        print("  offset: 起始偏移 (默認 0)")
        sys.exit(1)

    paper_key = sys.argv[1]
    count = int(sys.argv[2])
    offset = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    if paper_key not in PAPERS:
        print(f"Unknown paper: {paper_key}. Available: {', '.join(PAPERS.keys())}")
        sys.exit(1)

    paper = PAPERS[paper_key]
    output = Path(__file__).resolve().parent / f"cache_context_{paper_key}_{offset}_{offset+count}.json"

    with open(SECTIONS_FILE, "r", encoding="utf-8") as f:
        all_sections = json.load(f)

    with open(paper["questions_file"], "r", encoding="utf-8") as f:
        questions = json.load(f)

    slug = paper["handbook_slug"]
    sections = all_sections.get(slug, {})
    batch = questions[offset : offset + count]

    print(f"Processing {paper['questions_file'].name} [{offset}:{offset+count}] ({len(batch)} questions)...")

    results = []
    no_match = 0
    for q in batch:
        section_num = ref_to_section(q["ref"])
        matched_num, handbook_text = find_section_text(sections, section_num)
        if not handbook_text:
            no_match += 1

        results.append({
            "id": q["id"],
            "number": q["number"],
            "ref": q["ref"],
            "matched_section": matched_num,
            "question": q["question"],
            "options": q["options"],
            "answer": q["answer"],
            "handbook_text": handbook_text[:3000] if handbook_text else "(未找到對應章節)",
        })

    with open(output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(results)} entries to {output.name} ({no_match} without handbook match)")


if __name__ == "__main__":
    main()
