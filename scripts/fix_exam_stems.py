"""
修復 .cache_paper1.json 中「問句跑到上一題題幹末尾」的錯位。

模式:current 題幹以羅馬數字(i./ii./i))開頭(缺問句),
其問句被混入到上一題(prev)題幹的最後一行。
修復:把 prev 題幹最後一行(問句)移到 current 題幹開頭。

校驗:只移走「像問句」的行(含 ? ？ ： : 且非羅馬數字開頭)。
"""
import json, re, os, shutil

SRC = r"d:\Downloads\IIQE\.cache_paper1.json"
ROMAN_START = re.compile(r"^\s*(i{1,3}|iv|v|vi{0,3})[.)]", re.IGNORECASE)
QUESTION_END = re.compile(r"[?？：:]$")


def looks_like_question(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if ROMAN_START.match(s):
        return False
    return bool(QUESTION_END.search(s)) or "?" in s or "？" in s or "：" in s or s.endswith(":")


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    backup = SRC + ".bak"
    if not os.path.exists(backup):
        shutil.copy2(SRC, backup)
        print(f"backup -> {backup}")

    fixed = 0
    skipped = []
    for i, q in enumerate(data):
        stem = (q.get("question") or "").strip()
        first_line = stem.split("\n")[0].strip()
        if not ROMAN_START.match(first_line):
            continue
        if i == 0:
            continue
        prev = data[i - 1]
        prev_stem = (prev.get("question") or "").rstrip()
        if "\n" not in prev_stem:
            skipped.append((q.get("number"), "prev single-line, cannot split"))
            continue
        body, last_line = prev_stem.rsplit("\n", 1)
        last_line = last_line.strip()
        if not looks_like_question(last_line):
            skipped.append((q.get("number"), f"last line not question: {last_line[:40]!r}"))
            continue
        # 移走
        prev["question"] = body.rstrip()
        q["question"] = last_line + "\n" + stem
        fixed += 1
        print(f"Q{q.get('number')}: moved '{last_line[:50]}' from Q{prev.get('number')} -> Q{q.get('number')}")

    print(f"\nfixed: {fixed}")
    if skipped:
        print(f"skipped: {len(skipped)}")
        for n, reason in skipped:
            print(f"  Q{n}: {reason}")

    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"-> wrote {SRC}")


if __name__ == "__main__":
    main()
