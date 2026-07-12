#!/usr/bin/env python3
"""
clean_stray_spaces.py - 清理 SQLite 題庫(Question 表)中「漢字間多餘空格」。

只移除:緊貼某個 CJK 漢字之前或之後的「空格類」字元
(半角空格 U+0020 / 不斷行空格 U+00A0 / 全形空格 U+3000)。
- 不動換行(\\n)、不動 tab,保留題目多行結構
- 不改答案、不改題意、不刪行、不改 option key
處理欄位: question(題幹)、options(JSON 字串,逐個 value 清理)、explanation(解析)

用法(在 VPS 上,對 prod.db 執行):
  python3 clean_stray_spaces.py --db /home/ecs-user/iiqe-app/prisma/prod.db --dry-run   # 先預覽
  python3 clean_stray_spaces.py --db /home/ecs-user/iiqe-app/prisma/prod.db             # 正式執行

會先備份成 <db>.bak.<timestamp>,再於同一 transaction 內 UPDATE;失敗自動 rollback。
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime

# CJK 漢字範圍
CJK = r"\u4e00-\u9fff"
# 要清除的「空格類」字元(不含換行/tab,避免破壞多行結構)
SPACE = r"[ \u00a0\u3000]"
PAT = re.compile(rf"(?<=[{CJK}]){SPACE}+|{SPACE}+(?=[{CJK}])")


def clean(text):
    if not text:
        return text
    return PAT.sub("", text)


def has_stray(text):
    return bool(text) and bool(PAT.search(text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="SQLite db path, e.g. prisma/prod.db")
    ap.add_argument("--dry-run", action="store_true", help="only report, do not write")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"ERROR: db not found: {args.db}")

    con = sqlite3.connect(args.db)
    cur = con.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Question'")
    if not cur.fetchone():
        sys.exit("ERROR: no Question table in this db")

    cur.execute("SELECT id, question, options, explanation FROM Question")
    rows = cur.fetchall()
    total = len(rows)
    pre_q = pre_o = pre_e = 0
    plan = []
    for rid, q, opts, ex in rows:
        nq = clean(q) if q else q
        no = opts
        if opts:
            try:
                d = json.loads(opts)
                nd = {k: clean(v) for k, v in d.items()}
                # compact separators, 保留中文原樣,避免多塞空格
                no = json.dumps(nd, ensure_ascii=False, separators=(",", ":"))
            except Exception:
                no = opts
        ne = clean(ex) if ex else ex
        changed = (nq != q) or (no != opts) or (ne != ex)
        if has_stray(q):
            pre_q += 1
        if has_stray(opts):
            pre_o += 1
        if has_stray(ex):
            pre_e += 1
        if changed:
            plan.append((rid, nq, no, ne))

    print(f"[dry-run={args.dry_run}] db={args.db} total={total}")
    print(f"  pre  stray: question={pre_q} options={pre_o} explanation={pre_e}")
    print(f"  rows to update: {len(plan)}")

    if args.dry_run or not plan:
        con.close()
        print("  (no changes written)")
        return

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = f"{args.db}.bak.{ts}"
    shutil.copy2(args.db, bak)
    print(f"  backup -> {bak}")

    try:
        cur.execute("BEGIN")
        for rid, nq, no, ne in plan:
            cur.execute(
                "UPDATE Question SET question=?, options=?, explanation=? WHERE id=?",
                (nq, no, ne, rid),
            )
        con.commit()
    except Exception as e:
        con.rollback()
        con.close()
        sys.exit(f"ERROR during update, rolled back: {e}")

    cur.execute("SELECT id, question, options, explanation FROM Question")
    post_q = post_o = post_e = 0
    for rid, q, opts, ex in cur.fetchall():
        if has_stray(q):
            post_q += 1
        if has_stray(opts):
            post_o += 1
        if has_stray(ex):
            post_e += 1
    con.close()
    print(f"  post stray: question={post_q} options={post_o} explanation={post_e}")
    print("  DONE.")


if __name__ == "__main__":
    main()
