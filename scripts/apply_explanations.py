"""
將生成的 explanation 回寫到題目 JSON 文件。
僅修改目標題目，其餘不動。保持 JSON 格式：2 空格縮進、ensure_ascii=False。

用法:
  python scripts/apply_explanations.py <explanations_json> <questions_json>
  python scripts/apply_explanations.py scripts/cache_explanations_p1_exam_0_40.json data/questions-p1-exam.json
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    if len(sys.argv) < 3:
        print("用法: python apply_explanations.py <explanations_json> <questions_json>")
        sys.exit(1)

    explanations_file = Path(sys.argv[1])
    questions_file = Path(sys.argv[2])

    # 支持相對路徑
    if not explanations_file.is_absolute():
        explanations_file = ROOT / explanations_file
    if not questions_file.is_absolute():
        questions_file = ROOT / questions_file

    with open(explanations_file, "r", encoding="utf-8") as f:
        explanations = json.load(f)

    with open(questions_file, "r", encoding="utf-8") as f:
        questions = json.load(f)

    updated = 0
    for q in questions:
        qid = q["id"]
        if qid in explanations:
            q["explanation"] = explanations[qid]
            updated += 1

    # 檢查是否有 explanation 找不到對應題目
    question_ids = {q["id"] for q in questions}
    not_found = [eid for eid in explanations if eid not in question_ids]

    with open(questions_file, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Updated {updated}/{len(explanations)} questions in {questions_file.name}")
    if not_found:
        print(f"WARNING: {len(not_found)} explanations had no matching question: {not_found}")

    # 驗證
    with open(questions_file, "r", encoding="utf-8") as f:
        verify = json.load(f)
    non_null = sum(1 for q in verify if q.get("explanation"))
    print(f"Total: {non_null} non-null explanations / {len(verify)} questions")


if __name__ == "__main__":
    main()
