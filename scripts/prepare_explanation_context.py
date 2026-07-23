"""
為指定題目準備 explanation 生成上下文：題目 + 選項 + 答案 + 手冊章節文本。
ref 回退策略: "1.2.3(c)" → 先找 "1.2.3"，無則 "1.2"，再無則 "1"。

用法: python scripts/prepare_explanation_context.py
輸出: scripts/cache_explanation_context.json
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECTIONS_FILE = Path(__file__).resolve().parent / "cache_handbook_sections.json"
OUTPUT = Path(__file__).resolve().parent / "cache_explanation_context.json"

# 配置: 要處理的題目文件、手冊 slug、題目數量
TASKS = [
    {
        "questions_file": ROOT / "data" / "questions-p3-exam.json",
        "handbook_slug": "exam3-2022",
        "count": 20,
    },
]


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
    # 嘗試完整編號，然後逐級回退
    parts = section_num.split(".")
    for i in range(len(parts), 0, -1):
        candidate = ".".join(parts[:i])
        if candidate in sections:
            return candidate, sections[candidate]
    return "", ""


def main():
    with open(SECTIONS_FILE, "r", encoding="utf-8") as f:
        all_sections = json.load(f)

    results = []

    for task in TASKS:
        with open(task["questions_file"], "r", encoding="utf-8") as f:
            questions = json.load(f)

        slug = task["handbook_slug"]
        sections = all_sections.get(slug, {})
        count = task["count"]

        print(f"Processing {task['questions_file'].name} (first {count} questions)...")

        for q in questions[:count]:
            section_num = ref_to_section(q["ref"])
            matched_num, handbook_text = find_section_text(sections, section_num)

            entry = {
                "id": q["id"],
                "number": q["number"],
                "ref": q["ref"],
                "matched_section": matched_num,
                "question": q["question"],
                "options": q["options"],
                "answer": q["answer"],
                "handbook_text": handbook_text[:3000] if handbook_text else "(未找到對應章節)",
            }
            results.append(entry)

            status = "✓" if handbook_text else "✗ NO MATCH"
            print(f"  {q['id']:15s} ref={q['ref']:18s} → §{matched_num:8s} {status}")

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(results)} entries to {OUTPUT}")


if __name__ == "__main__":
    main()
