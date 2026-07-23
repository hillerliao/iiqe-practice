"""
將生成的 explanation 回寫到題目 JSON 文件。
僅修改目標題目，其餘不動。保持 JSON 格式：2 空格縮進、ensure_ascii=False。

用法: python scripts/apply_explanations.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPLANATIONS_FILE = Path(__file__).resolve().parent / "cache_explanations_p3.json"

# 要更新的題目文件
QUESTIONS_FILE = ROOT / "data" / "questions-p3-exam.json"


def main():
    with open(EXPLANATIONS_FILE, "r", encoding="utf-8") as f:
        explanations = json.load(f)

    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        questions = json.load(f)

    updated = 0
    not_found = []

    for q in questions:
        qid = q["id"]
        if qid in explanations:
            q["explanation"] = explanations[qid]
            updated += 1

    # 檢查是否有 explanation 找不到對應題目
    question_ids = {q["id"] for q in questions}
    for eid in explanations:
        if eid not in question_ids:
            not_found.append(eid)

    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Updated {updated} questions in {QUESTIONS_FILE.name}")
    if not_found:
        print(f"WARNING: {len(not_found)} explanations had no matching question: {not_found}")

    # 驗證
    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        verify = json.load(f)

    non_null = sum(1 for q in verify if q.get("explanation"))
    null_count = sum(1 for q in verify if not q.get("explanation"))
    print(f"Verification: {non_null} non-null explanations, {null_count} null explanations, {len(verify)} total")


if __name__ == "__main__":
    main()
