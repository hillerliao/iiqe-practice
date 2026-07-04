"""
修復 _p3_clean.json 中「上一題 iv 項 + c)/d) 選項行混入下一題 stem」的錯位。

模式:下一題 stem 開頭是上一題的 "iv." 項(可能跨行),緊跟 c)/d) 重複選項行,
之後才是本題問句。
修復:
  - iv 項移回上一題 stem 末尾
  - c)/d) 重複選項行刪除(opts 已有)
  - 剩餘為本題正確 stem
"""
import json, re, os, shutil

SRC = r"d:\Downloads\IIQE\_p3_clean.json"
IV_START = re.compile(r"^\s*iv[.)]", re.I)
OPT_START = re.compile(r"^\s*[cd]\)")
QUESTION_END = re.compile(r"[?？：:]$")


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    backup = SRC + ".bak"
    if not os.path.exists(backup):
        shutil.copy2(SRC, backup)
        print(f"backup -> {backup}")

    fixed = 0
    for i, q in enumerate(data):
        stem = q.get("stem") or ""
        lines = stem.split("\n")
        if not lines or not IV_START.match(lines[0].strip()):
            continue
        # 收集 iv 項(從開頭直到遇到 c)/d) 或問句行)
        iv_lines = []
        j = 0
        while j < len(lines):
            ln = lines[j].strip()
            if OPT_START.match(ln):
                break
            if QUESTION_END.search(ln) and not IV_START.match(ln):
                break
            iv_lines.append(lines[j])
            j += 1
        # 跳過 c)/d) 重複選項行
        while j < len(lines) and OPT_START.match(lines[j].strip()):
            j += 1
        remaining = [l for l in lines[j:] if l.strip()]
        # iv 項移給上一題
        if i > 0 and iv_lines:
            prev = data[i - 1]
            prev["stem"] = (prev.get("stem") or "").rstrip() + "\n" + "\n".join(iv_lines)
        q["stem"] = "\n".join(remaining).strip()
        fixed += 1
        n = q.get("q") or q.get("number")
        print(f"Q{n}: moved iv-lines to Q{data[i-1].get('q') or data[i-1].get('number')}, "
              f"new stem: {q['stem'][:50]!r}")

    print(f"\nfixed: {fixed}")
    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"-> wrote {SRC}")


if __name__ == "__main__":
    main()
