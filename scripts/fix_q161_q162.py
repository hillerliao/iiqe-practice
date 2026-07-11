#!/usr/bin/env python3
"""
Repair P3 Q161/Q162 + mock Q320/Q321 cross-question stem pollution.

Source of truth: D:\\Downloads\\IIQE\\iiqe-app\\public\\handbook\\exam3-2022.json
  chapter `ch-3-4-1` (3.4.1(a) 自願醫保計劃 — 背景).

Pollution pattern (NOT yet covered by the existing fix_*_stems scripts):
  * Q161's stem ends abruptly with the tail of option(a) ("…自願選購"),
    and options a/b/c/d are all right-side truncated.
  * Q162's stem starts with the entire option(a) tail of Q161 plus the
    full text of Q161 option(d) ("…僅供\n香港居民自由購買"), before
    Q162's actual question sentence begins.

Files touched (each gets a single .bak.<ts>; .bak kept around):
  - data/questions-p3-exam.json                   (Q161 / Q162)
  - _p3_clean.json                                (Q161 / Q162, legacy schema)
  - scripts/p3_clean.json                         (Q161 / Q162, legacy schema)
  - scripts/mock_p3.json                          (Q320 / Q321, mixed schema)

Idempotent: if the entry is already clean (its stem no longer contains any
of the pollution marker substrings), the patch is recorded as a no-op
skip instead of being re-applied.

Run:    python scripts/fix_q161_q162.py
Audit:  grep -nE "(費者自願選購|香港居民自由購買|供消費者$|僅供$)" \
            data/questions-p3-exam.json _p3_clean.json scripts/p3_clean.json scripts/mock_p3.json
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Callable

ROOT = Path(r"D:\Downloads\IIQE\iiqe-app")
DATA = ROOT / "data"

# ---------- canonical text (from handbook 3.4.1(a)) ----------

Q161_STEM = "自願醫保計劃推動個人住院保險產品的發展，並為香港保險人帶來甚麼機會?"
Q161_OPTS: dict[str, str] = {
    "a": "自願醫保容許參與的保險人提供受食衞局認可的個人償款住院保險產品，供消費者自願選購",
    "b": "自願醫保容許參與的保險人提供受食衞局認可的個人及團體償款住院保險產品，供消費者及團體投保",
    "c": "自願醫保容許參與的保險人提供受稅務局認可的個人償款住院保險產品，供消費者自願投保",
    "d": "自願醫保容許參與的保險人提供受稅務局認可的個人償款住院保險產品，僅供香港居民投保",
}

Q162_STEM = "自願醫保計劃（簡稱「自願醫保」）為保險買家提供了甚麼的機會?"
Q162_OPTS: dict[str, str] = {
    "a": "自願醫保為沒有能力承擔私營醫療服務的消費者提供一個保險計劃",
    "b": "自願醫保為沒有獲僱主提供醫療保險的消費者提供一個保險計劃",
    "c": "自願醫保為願意及有能力使用私營醫療服務的消費者提供額外的保險計劃選擇",
    "d": "自願醫保為沒有能力承擔私營醫療服務的消費者提供一個低收入保險計劃",
}

# markers that, if present anywhere in the current `stem`, prove the entry is polluted
POLLUTION_MARKERS = (
    "費者自願選購",
    "香港居民自由購買",
    "自願選購",
)


# ---------- patches ----------

def patch_exam(q: dict[str, Any]) -> bool:
    """data/questions-p3-exam.json schema."""
    stem = q.get("question") or ""
    if not any(m in stem for m in POLLUTION_MARKERS):
        return False
    q["question"] = Q161_STEM if q["number"] == 161 else Q162_STEM
    opts = q.get("options") or {}
    if not isinstance(opts, dict):
        return False
    canon = Q161_OPTS if q["number"] == 161 else Q162_OPTS
    for k, v in canon.items():
        opts[k] = v
    q["options"] = opts
    return True


def patch_legacy(q: dict[str, Any]) -> bool:
    """_p3_clean.json / scripts/p3_clean.json legacy schema (`q`/`stem`/`opts`/`ans`)."""
    stem = q.get("stem") or ""
    if not any(m in stem for m in POLLUTION_MARKERS):
        return False
    q["stem"] = Q161_STEM if q["q"] == 161 else Q162_STEM
    canon = Q161_OPTS if q["q"] == 161 else Q162_OPTS
    # legacy opts is ["a) ...", "b) ...", "c) ...", "d) ..."]
    q["opts"] = [f"{k}){v}" for k, v in canon.items()]
    return True


def patch_mock(q: dict[str, Any]) -> bool:
    """scripts/mock_p3.json mixed schema for Q320/Q321 (number 320 ↔ exam 161, 321 ↔ 162)."""
    stem = q.get("question") or ""
    if not any(m in stem for m in POLLUTION_MARKERS):
        return False
    q["question"] = Q161_STEM if q["number"] == 320 else Q162_STEM
    canon = Q161_OPTS if q["number"] == 320 else Q162_OPTS
    opts = q.get("options")
    if isinstance(opts, dict):
        for k, v in canon.items():
            opts[k] = v
        q["options"] = opts
    return True


# ---------- io ----------

def backup(path: Path) -> Path:
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak.{ts}")
    shutil.copy2(path, bak)
    return bak


def apply_file(
    rel_path: str,
    target_numbers: set[int],
    patch_fn: Callable[[dict[str, Any]], bool],
) -> tuple[int, int, list[str]]:
    path = ROOT / rel_path
    arr = json.loads(path.read_text(encoding="utf-8"))
    by_num = {
        q["number"]: q
        for q in arr
        if isinstance(q, dict) and isinstance(q.get("number"), int)
    }
    # also accept legacy `q` key (no `number`)
    if not by_num:
        by_num = {
            q["q"]: q
            for q in arr
            if isinstance(q, dict) and isinstance(q.get("q"), int)
        }

    log: list[str] = []
    fixed = 0
    skipped = 0
    for n in sorted(target_numbers):
        q = by_num.get(n)
        if q is None:
            log.append(f"  #{n}: SKIP — not in {rel_path}")
            skipped += 1
            continue
        if patch_fn(q):
            fixed += 1
            log.append(
                f"  #{n}: FIXED in {rel_path}  -> question={q.get('question') or q.get('stem')!r}"
            )
        else:
            skipped += 1
            log.append(f"  #{n}: already clean in {rel_path} (skipped)")

    bak = backup(path)
    path.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
    log.append(f"  backup: {bak.name}")
    log.append(f"  wrote:  {rel_path}")
    return fixed, skipped, log


def main() -> int:
    all_log: list[str] = []
    plan = [
        (
            "data/questions-p3-exam.json",
            {161, 162},
            patch_exam,
        ),
        (
            "_p3_clean.json",
            {161, 162},
            patch_legacy,
        ),
        (
            "scripts/p3_clean.json",
            {161, 162},
            patch_legacy,
        ),
        (
            "scripts/mock_p3.json",
            {320, 321},
            patch_mock,
        ),
    ]

    total_fixed = 0
    total_skipped = 0
    for rel, nums, fn in plan:
        print(f"\n## {rel}  (targets {sorted(nums)})")
        fixed, skipped, log = apply_file(rel, nums, fn)
        for line in log:
            print(line)
        all_log.extend([f"[{rel}] {ln}" for ln in log])
        total_fixed += fixed
        total_skipped += skipped

    print(f"\n=== TOTAL fixed: {total_fixed}, skipped: {total_skipped} ===")

    log_path = ROOT / "scripts" / "fix_q161_q162.log"
    log_path.write_text(
        "\n".join(all_log) + "\n", encoding="utf-8"
    )
    print(f"\naudit log -> {log_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
