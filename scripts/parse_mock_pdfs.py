"""
解析 IIQE 模擬題 PDF (layout 模式)。

Layout 模式文字的垂直結構:
  [上一題 c)]
  [上一題 d)]
  [本題 題幹(可能多行)]
  a) [本題 a 選項]
  N ref  b) [本題 b 選項]  ANSWER    <- 題號行
  [本題 c 選項]
  [本題 d 選項]
  [下一題 題幹]
  ...

更精確:
  - a) 一定緊接在題幹之後
  - 題號行(N + ref)出現在 b) 那一行,可能附帶答案
  - 答案字母可能夾在 b)、c) 或 d) 文字尾端;也可能在題號行最尾端(空 ref 形式)
  - 題幹有時候包含 i. ii. iii. iv. 等羅馬數字(雙重選項題型)

策略:
  1. 找所有題號行
  2. 對每題:
     - 題幹 = (前一題號行 + 1) ~ (本題 a_idx - 1) 內,過濾掉前題的 c/d 殘留
     - 選項 = 從 a_idx 開始到下一題號行為止,逐行抓 a) b) c) d)
     - 答案 = 從 b) 行尾抓;若沒有,從 c) 或 d) 抓
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")

TAG_RE = re.compile(
    r"^\s*(\d{1,4})\s+([0-9]+(?:\.[0-9]+){0,3}(?:[a-z]|\([a-z0-9]+\))?)\s+(.*)$"
)
OPTION_RE = re.compile(r"^\s*([abcd])\)\s*(.*?)\s*$")
ANSWER_TAIL_RE = re.compile(r"^(.*?)\s+([A-D])\s*$")
# 羅馬數字常被誤判為題幹;選項行必須以 a) b) c) d) 開頭,這部分是安全的


def parse_file(text_path: str) -> list[dict]:
    with open(text_path, "r", encoding="utf-8") as f:
        raw = f.read()

    lines = raw.splitlines()
    cleaned: list[tuple[int, str]] = []
    current_page = 0
    for ln in lines:
        m = re.match(r"^===PAGE\s+(\d+)===\s*$", ln)
        if m:
            current_page = int(m.group(1))
            continue
        s = ln.strip()
        if not s:
            continue
        # 過濾頁首頁尾
        if "模擬試題2025年版" in s:
            continue
        if s in ("試卷一", "試卷三", "I I Q E"):
            continue
        if "題號" in s and "參考章節" in s and "問題" in s and "答案" in s:
            # 表格標題列
            continue
        # 「試卷㇐」與「試卷三」標題變體
        if s.startswith("試卷㇐") or s.startswith("試卷三"):
            continue
        cleaned.append((current_page, s))

    # 找題號行
    tag_indices: list[int] = []
    tags: list[dict] = []
    for idx, (page, s) in enumerate(cleaned):
        m = TAG_RE.match(s)
        if m:
            num, ref, rest = m.groups()
            tags.append(
                {"idx": idx, "page": page, "number": int(num), "ref": ref, "rest": rest.strip()}
            )
            tag_indices.append(idx)

    print(f"  [{os.path.basename(text_path)}] found {len(tags)} tags")

    questions: list[dict] = []
    for i, tag in enumerate(tags):
        prev_end = tag_indices[i - 1] if i > 0 else -1
        next_start = tag_indices[i + 1] if i + 1 < len(tag_indices) else len(cleaned)
        start = tag["idx"]

        # --- 找本題 a) 的位置 ---
        # a) 在本題題號行之前;但前題的 c/d 也在本題題號行之前。
        # 用反向搜尋:從 start-1 往 prev_end 方向找第一個「a)」開頭的行
        a_idx = None
        for k in range(start - 1, prev_end, -1):
            _, ln = cleaned[k]
            m_opt = OPTION_RE.match(ln)
            if m_opt and m_opt.group(1) == "a":
                a_idx = k
                break

        # --- 題幹 = (prev_end+1) ~ (a_idx - 1),過濾掉前題的 c) d) 殘留 ---
        # prev_end 題號行的 c 應該在 prev_end+1,d 在 prev_end+2(如果兩者都存在)
        # 但偶爾 c 跟 d 會被夾在題號行同行的 ref 後,或漏一個。
        # 安全做法:把所有 c) d) 開頭的行從「題幹範圍」內剔除。
        # 同時,前一個題的「題號行」殘留(若有 ref)也要跳過。
        prev_ref_str = tags[i - 1]["ref"] if i > 0 else None
        stem_lines: list[str] = []
        scan_end = a_idx if a_idx is not None else start
        for k in range(prev_end + 1, scan_end):
            _, ln = cleaned[k]
            # 過濾:選項行
            if OPTION_RE.match(ln):
                continue
            # 過濾:包含前題 ref 號碼的「題號行殘留」(如 "3 1.1.2b b)...")
            if prev_ref_str and re.search(r"\b" + re.escape(prev_ref_str) + r"\b", ln):
                # 跳過這整行
                continue
            stem_lines.append(ln)

        stem = " ".join(stem_lines).strip()
        # 清理前綴雜訊(只刪開頭的雜訊,不影響中段)
        # 注意「題號 參考章節 問題 答案 答案」是表格標題,出現在第一題題幹前
        prefixes = ["試卷㇐", "試卷三", "I I Q E"]
        changed = True
        while changed:
            changed = False
            for prefix in prefixes:
                if stem.startswith(prefix):
                    stem = stem[len(prefix):].strip()
                    changed = True
            # 表格標題只在前綴出現一次
            if stem.startswith("題號"):
                # 刪掉「題號 ... 答案」這段(到第二個「答案」)
                idx = stem.find("答案", 2)  # 跳過開頭的「題號」
                if idx != -1 and idx < 30:
                    stem = stem[idx + len("答案"):].strip()
                    changed = True
        stem = re.sub(r"\s+", " ", stem).strip()

        # --- 選項 + 答案 ---
        options: dict[str, str] = {}
        answer: str | None = None

        scan_start = a_idx if a_idx is not None else start

        for k in range(scan_start, next_start):
            _, ln = cleaned[k]
            # 題號行(本題):b/c/d 中可能夾帶選項文字+答案
            # 真實例子: "b)損失防範  B" / "              A" / "c)開支  D"
            if k == start:
                rest = tag["rest"]
                m_opt_ans = re.match(r"^([abcd])\)\s*(.*?)\s+([A-D])\s*$", rest)
                if m_opt_ans:
                    letter, txt, ans = m_opt_ans.groups()
                    options[letter] = txt.strip()
                    answer = ans
                else:
                    # 行尾可能只有答案(沒選項文字)
                    m_ans_only = re.search(r"\s*([A-D])\s*$", rest)
                    if m_ans_only:
                        answer = m_ans_only.group(1)
                continue

            m_opt = OPTION_RE.match(ln)
            if m_opt:
                letter, txt = m_opt.groups()
                txt = txt.strip()
                if letter in options:
                    continue
                m_text_ans = ANSWER_TAIL_RE.match(txt)
                if m_text_ans:
                    body, ans = m_text_ans.groups()
                    options[letter] = body.strip()
                    if answer is None:
                        answer = ans
                else:
                    options[letter] = txt
            # 非選項行忽略(下一題的題幹)

        missing = [k for k in "abcd" if k not in options]

        questions.append(
            {
                "number": tag["number"],
                "ref": tag["ref"],
                "question": stem,
                "options": options,
                "answer": answer,
                "page": tag["page"],
                "_missing_options": missing,
                "_no_answer": answer is None,
            }
        )

    return questions


def main():
    targets = [
        {"src": "_mock_p1_layout.txt", "out": "mock_p1.json", "name": "p1"},
        {"src": "_mock_p3_layout.txt", "out": "mock_p3.json", "name": "p3"},
    ]
    for t in targets:
        src = os.path.join(SCRIPTS, t["src"])
        out = os.path.join(SCRIPTS, t["out"])
        if not os.path.exists(src):
            print(f"[skip] {src} not found")
            continue
        questions = parse_file(src)
        complete = sum(1 for q in questions if not q["_missing_options"])
        with_ans = sum(1 for q in questions if not q["_no_answer"])
        print(
            f"  -> {len(questions)} parsed, {complete} have all 4 options, {with_ans} have answer"
        )
        for q in questions[:5]:
            print("    sample:", json.dumps(q, ensure_ascii=False))
        bad = [q for q in questions if q["_missing_options"] or q["_no_answer"]]
        if bad:
            print(f"  -> {len(bad)} problematic questions, examples:")
            for q in bad[:3]:
                print("    bad:", json.dumps(q, ensure_ascii=False))
        with open(out, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        print(f"  -> wrote {out}")


if __name__ == "__main__":
    main()
