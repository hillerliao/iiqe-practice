#!/usr/bin/env python3
"""
精準最小修補 + 補缺號,專門處理 P3 真題三個污染熱點:
  區段 A: Q46 補缺 (runtime + upstream 都缺)
  區段 B: Q47 補缺 (upstream 缺) + runtime ans 'b' → 'D' (與 PDF 不符)
  區段 C: Q48 upstream 覆寫 (原本是 Q46+Q47+Q48 三題合併鬼)
  區段 D: Q78 補缺 (runtime + upstream 都缺)
  區段 E: Q79 upstream 拆 stem (原本是 Q78 stem + Q78 a/c 殘留 + Q79 stem 三段黏合)

不動的東西: P1 / mock / 其他章節

PDF 原文來源:
  D:\\Downloads\\IIQE\\Paper 3 每月必讀試題 (8月份).pdf
    - 第 9 頁:  Q46, Q47, Q48
    - 第 14 頁: Q78, Q79

設計紀律:
  - 100% 依照 PDF 原文,絕不憑 LLM 記憶生成
  - 任何寫入都有 .bak.<ts> 備份
  - idempotent (重跑 = 全 SKIP)
  - 先 dry-run 印 diff,再 apply

用法:
  python scripts/fix_cross_q_pollution.py          # apply
  python scripts/fix_cross_q_pollution.py --dry    # 只印 diff,不寫
"""
from __future__ import annotations
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(r"D:\Downloads\IIQE\iiqe-app")

# ---------- PDF 原文 (從 Paper 3 每月必讀試題 (8月份).pdf 實機抽出) ----------

Q46 = {
    "question": "以下哪項屬於儲蓄壽險合約的特點？",
    "ref": "2.1.2",
    "options": {
        "a": "於香港十分普遍",
        "b": "儲蓄壽險是不分紅的",
        "c": "它包含一項重大的儲蓄成份",
        "d": "只會於保單期滿時仍然生存才支付保額",
    },
    "answer": "c",
    # runtime schema 用 answer: 'c'; upstream schema 用 ans: 'C'
}

Q47 = {
    "question": "以下哪項不是終身壽險的繳付保費方法？",
    "ref": "2.1.3",
    "options": {
        "a": "終身繳付",
        "b": "按指定年數",
        "c": "指定年齡前繳付",
        "d": "可按年遞減保費",
    },
    "answer": "d",   # PDF 答案為 D (不是 runtime 原本的 b)
}

Q48 = {
    "question": "合資格延期年金保費及強積金可扣稅自願性供款合計可享的扣除金額是:",
    "ref": "2.3.1",
    "options": {
        "a": "3萬",
        "b": "5萬",
        "c": "6萬",
        "d": "8萬",
    },
    "answer": "c",
}

Q78 = {
    "question": "以下哪項有關遞減定期壽險的描述是不正確？",
    "ref": "2.1.1a(b)",
    "options": {
        "a": "年保費逐年遞減",
        "b": "現有人壽保險種類中最便宜的",
        "c": "適合於逐漸減少的短暫保障需求",
        "d": "死亡保險金按年或其他特定周期遞減",
    },
    "answer": "a",   # PDF 答案為 A (年保費逐年遞減 = 不正確描述)
}

Q79 = {
    "question": "遞減定期壽險適合應付以下哪個或哪些情況？",
    "ref": "2.1.1a(b)",
    "options": {
        "a": "繳付遺產稅",
        "b": "為個人作退休資本",
        "c": "清繳抵押貸款的結欠",
        "d": "以上所有各項皆是",
    },
    "answer": "c",
}


# ---------- schema 工具 ----------

def runtime_entry(q: dict, n: int) -> dict:
    """構造 runtime schema 的 entry (用於 data/questions-p3-exam.json)。"""
    return {
        "id": f"P3-exam-{n}",
        "number": n,
        "ref": q["ref"],
        "question": q["question"],
        "options": dict(q["options"]),
        "answer": q["answer"],
        "explanation": None,
        "page": None,
        "source": "exam",
        "sourceLabel": "2022年版",
    }


def upstream_entry(q: dict, n: int) -> dict:
    """構造 upstream legacy schema 的 entry (用於 _p3_clean.json / scripts/p3_clean.json)。"""
    return {
        "q": n,
        "ref": q["ref"],
        "ans": q["answer"].upper(),
        "stem": q["question"],
        "opts": [f"{k}){v}" for k, v in q["options"].items()],
    }


# ---------- 核心操作 ----------

def backup(path: Path) -> Path:
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak.{ts}")
    shutil.copy2(path, bak)
    return bak


def find_idx_by_num(data: list, num: int, key: str = "number") -> int:
    for i, q in enumerate(data):
        if isinstance(q, dict) and q.get(key) == num:
            return i
    return -1


# ---------- 一個檔一個修補 ----------

def patch_runtime(dry: bool, log: list[str]) -> int:
    """data/questions-p3-exam.json: 補 Q46, 補 Q78, 改 Q47 answer b→d"""
    rel = "data/questions-p3-exam.json"
    p = ROOT / rel
    arr = json.loads(p.read_text(encoding="utf-8"))
    changed = 0

    # 1) 補 Q46 (原本 idx=44 是 Q45, idx=45 應該是 Q47...,我們插在 Q45 之後)
    idx45 = find_idx_by_num(arr, 45)
    if idx45 == -1:
        log.append(f"  [{rel}] Q45 NOT FOUND — cannot anchor Q46")
    else:
        # 確認 Q46 已存在?
        if find_idx_by_num(arr, 46) != -1:
            log.append(f"  [{rel}] Q46 already exists — SKIP")
        else:
            if not dry:
                arr.insert(idx45 + 1, runtime_entry(Q46, 46))
            log.append(f"  [{rel}] INSERT Q46 after idx={idx45} (Q45)")
            changed += 1

    # 2) 補 Q78 (插在 Q77 之後)
    idx77 = find_idx_by_num(arr, 77)
    if idx77 == -1:
        log.append(f"  [{rel}] Q77 NOT FOUND — cannot anchor Q78")
    else:
        if find_idx_by_num(arr, 78) != -1:
            log.append(f"  [{rel}] Q78 already exists — SKIP")
        else:
            if not dry:
                arr.insert(idx77 + 1, runtime_entry(Q78, 78))
            log.append(f"  [{rel}] INSERT Q78 after idx={idx77} (Q77)")
            changed += 1

    # 3) Q47 answer b → d (runtime 與 PDF 不一致)
    idx47 = find_idx_by_num(arr, 47)
    if idx47 == -1:
        log.append(f"  [{rel}] Q47 NOT FOUND")
    else:
        cur = arr[idx47].get("answer", "")
        if cur == "d":
            log.append(f"  [{rel}] Q47 answer already 'd' — SKIP")
        elif cur == "b":
            if not dry:
                arr[idx47]["answer"] = "d"
            log.append(f"  [{rel}] Q47: answer 'b' → 'd' (PDF)")
            changed += 1
        else:
            log.append(f"  [{rel}] Q47: unexpected answer={cur!r} — MANUAL REVIEW")

    if changed > 0 and not dry:
        bk = backup(p)
        p.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
        log.append(f"  [{rel}] backup -> {bk.name}, wrote {rel}")
    elif changed == 0:
        log.append(f"  [{rel}] no-op")
    return changed


def patch_upstream(rel: str, dry: bool, log: list[str]) -> int:
    """_p3_clean.json 與 scripts/p3_clean.json:
    - 補 Q46, Q47, Q78 (按 number 順序插入)
    - 覆寫 Q48 (把合併鬼改成真 Q48)
    - 拆 Q79 (改成真 Q79)
    """
    p = ROOT / rel
    arr = json.loads(p.read_text(encoding="utf-8"))
    changed = 0

    # 1) 補 Q46 (插在 q=45 之後)
    idx45 = find_idx_by_num(arr, 45, key="q")
    if idx45 == -1:
        log.append(f"  [{rel}] q=45 NOT FOUND")
    else:
        if find_idx_by_num(arr, 46, key="q") != -1:
            log.append(f"  [{rel}] q=46 already exists — SKIP")
        else:
            if not dry:
                arr.insert(idx45 + 1, upstream_entry(Q46, 46))
            log.append(f"  [{rel}] INSERT q=46 after idx={idx45} (q=45)")
            changed += 1

    # 2) 補 Q47 (插在 q=46 之後 - 但 q=46 剛插;用原始 idx45+1 邏輯找)
    #    簡化:重新 find q=46
    idx46 = find_idx_by_num(arr, 46, key="q")
    if idx46 == -1:
        log.append(f"  [{rel}] q=46 NOT FOUND (插 Q47 失敗)")
    else:
        if find_idx_by_num(arr, 47, key="q") != -1:
            log.append(f"  [{rel}] q=47 already exists — SKIP")
        else:
            if not dry:
                arr.insert(idx46 + 1, upstream_entry(Q47, 47))
            log.append(f"  [{rel}] INSERT q=47 after idx={idx46} (q=46)")
            changed += 1

    # 3) 覆寫 Q48 (原本是合併鬼,改成真 Q48)
    idx48 = find_idx_by_num(arr, 48, key="q")
    if idx48 == -1:
        log.append(f"  [{rel}] q=48 NOT FOUND")
    else:
        before_stem = (arr[idx48].get("stem") or "")[:50]
        # 偵測污染:stem 內同時含「儲蓄壽險合約的特點」+「終身壽險的繳付保費」這兩個獨立題目
        stem_now = arr[idx48].get("stem", "")
        is_polluted = (
            "儲蓄壽險合約的特點" in stem_now
            and "終身壽險的繳付保費" in stem_now
        )
        if not is_polluted:
            log.append(f"  [{rel}] q=48 stem 看起來已乾淨 — SKIP  (現在前 50 字:{before_stem!r})")
        else:
            if not dry:
                arr[idx48] = upstream_entry(Q48, 48)
            log.append(f"  [{rel}] REPLACE q=48 (合併鬼 → 真 Q48)")
            log.append(f"          BEFORE stem 開頭: {before_stem!r}")
            log.append(f"          AFTER  stem: {Q48['question']!r}")
            changed += 1

    # 4) 補 Q78 (插在 q=77 之後)
    idx77 = find_idx_by_num(arr, 77, key="q")
    if idx77 == -1:
        log.append(f"  [{rel}] q=77 NOT FOUND")
    else:
        if find_idx_by_num(arr, 78, key="q") != -1:
            log.append(f"  [{rel}] q=78 already exists — SKIP")
        else:
            if not dry:
                arr.insert(idx77 + 1, upstream_entry(Q78, 78))
            log.append(f"  [{rel}] INSERT q=78 after idx={idx77} (q=77)")
            changed += 1

    # 5) 拆 Q79 (覆寫成真 Q79;因為 Q78 已用上 idx=idx77+1,Q79 的真身原本在 idx77+1 已被覆蓋為 Q78
    #    原本的「污染 Q79」應該已經不在 — 但若還在,需要覆寫。
    idx79 = find_idx_by_num(arr, 79, key="q")
    if idx79 == -1:
        log.append(f"  [{rel}] q=79 NOT FOUND")
    else:
        before_stem = (arr[idx79].get("stem") or "")[:80]
        stem_now = arr[idx79].get("stem", "")
        # 偵測污染:同一 stem 內含「遞減定期壽險的描述是不正確」+「遞減定期壽險適合應付」
        is_polluted = (
            "遞減定期壽險的描述是不正確" in stem_now
            and "遞減定期壽險適合應付" in stem_now
        )
        if not is_polluted:
            log.append(f"  [{rel}] q=79 stem 已乾淨 — SKIP  (前 80 字:{before_stem!r})")
        else:
            if not dry:
                arr[idx79] = upstream_entry(Q79, 79)
            log.append(f"  [{rel}] REPLACE q=79 (合併鬼 → 真 Q79)")
            log.append(f"          BEFORE stem 開頭: {before_stem!r}")
            log.append(f"          AFTER  stem: {Q79['question']!r}")
            changed += 1

    if changed > 0 and not dry:
        bk = backup(p)
        p.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
        log.append(f"  [{rel}] backup -> {bk.name}, wrote {rel}")
    elif changed == 0:
        log.append(f"  [{rel}] no-op")
    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只印 diff 不寫檔")
    args = ap.parse_args()

    log: list[str] = []
    log.append(f"=== fix_cross_q_pollution {'(DRY-RUN)' if args.dry else '(APPLY)'} ===")

    c = patch_runtime(args.dry, log)
    log.append(f"\nruntime changed ops: {c}")

    for rel in ["_p3_clean.json", "scripts/p3_clean.json"]:
        log.append("")
        c = patch_upstream(rel, args.dry, log)
        log.append(f"\n{rel} changed ops: {c}")

    out = "\n".join(log) + "\n"
    print(out)

    if not args.dry:
        log_path = ROOT / "scripts" / "fix_cross_q_pollution.log"
        log_path.write_text(out, encoding="utf-8")
        print(f"audit log -> {log_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
