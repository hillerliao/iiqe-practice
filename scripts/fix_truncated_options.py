"""Legacy one-off repair for flattened layout-parser output.

Do not run this script against production datasets. Its input lacks physical PDF
row boundaries and cannot reliably distinguish a wrapped option from the next
question stem. Rebuild from source with ``rebuild_mock_pdfs.py`` instead.

Historical heuristic and failure mode:
the parser incorrectly treats the continuation as a new question's stem.

Detection: In the raw layout file, a genuine continuation line appears
IMMEDIATELY after an option line (no blank line between), AND the next
non-blank line after it is NOT an option marker (a/b/c/d). If the next
non-blank line IS an option, then the line is actually the next question's
stem (which just happens to have no blank line before it).

Fix: Move the continuation from next question's stem back to the truncated option.
"""
import json
import re
import os
import sys

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")
DATA = os.path.join(ROOT, "data")

TAG_RE = re.compile(
    r"^\s*(\d{1,4})\s+([0-9]+(?:\.[0-9]+){0,3}(?:[a-z]|\([a-z0-9]+\))?)\s+(.*)$"
)
OPTION_RE = re.compile(r"^\s*([abcd])\)\s*(.*?)\s*$")
PAGE_RE = re.compile(r"^===PAGE\s+(\d+)===\s*$")


def is_noise_line(text: str) -> bool:
    """Check if a line is a header/noise that should be skipped."""
    if not text:
        return True
    if PAGE_RE.match(text):
        return True
    if "模擬試題2025" in text:
        return True
    if text in ("試卷一", "試卷㇐", "試卷三", "I I Q E", "⾧期保險"):
        return True
    if "題號" in text and "參考章節" in text:
        return True
    if text.startswith("試卷㇐") or text.startswith("試卷三"):
        return True
    return False


def find_continuations(layout_path: str) -> list[dict]:
    """Find genuine option continuation lines.
    
    A continuation is a non-empty line that:
    1. Appears IMMEDIATELY after an option line (no blank line between)
    2. Is not itself an option/tag/header
    3. The next non-blank line after it is NOT an option marker (a/b/c/d)
       (if it IS an option, then this line is a next question stem, not a continuation)
    """
    with open(layout_path, "r", encoding="utf-8") as f:
        raw_lines = [l.rstrip("\n") for l in f.readlines()]

    results = []
    
    for i in range(len(raw_lines) - 1):
        line = raw_lines[i]
        next_line = raw_lines[i + 1]
        
        # Current line must be an option line
        opt_m = OPTION_RE.match(line)
        if not opt_m:
            continue
        
        letter = opt_m.group(1)
        opt_text = opt_m.group(2).strip()
        
        # Next line must be non-empty (no blank line = potential continuation)
        next_stripped = next_line.strip()
        if not next_stripped:
            continue  # Blank line means no continuation
        
        # Next line must NOT be an option, page marker, or header
        if OPTION_RE.match(next_line):
            continue
        if is_noise_line(next_stripped):
            continue
        
        # Check if it's a tag line with embedded continuation
        tag_m = TAG_RE.match(next_stripped)
        if tag_m:
            # Tag line might have continuation text in the "rest" portion
            rest = tag_m.group(3).strip()
            # Remove trailing answer letter
            rest_clean = re.sub(r"\s+[A-D]\s*$", "", rest).strip()
            # Remove leading option marker if present (e.g., "c)text  D")
            opt_in_tag = OPTION_RE.match(rest_clean)
            if opt_in_tag:
                continue  # It's a new option on the tag line, not a continuation
            if rest_clean and not re.match(r"^[A-D]$", rest_clean):
                # Verify: the next non-blank line after this tag should NOT be a)
                # (if it is, this tag starts a new question, not a continuation)
                # Actually for tag-embedded continuations, the tag IS part of the
                # same question, so we accept it.
                results.append({
                    "line": i + 1,
                    "letter": letter,
                    "opt_first_line": opt_text,
                    "continuation": rest_clean,
                    "type": "tag_embedded"
                })
            continue
        
        # KEY CHECK: Find the next non-blank line after the suspected continuation.
        # If it's an option line (a/b/c/d), then this line is actually a next
        # question's stem, NOT a continuation.
        next_nonblank_idx = i + 2
        while next_nonblank_idx < len(raw_lines) and not raw_lines[next_nonblank_idx].strip():
            next_nonblank_idx += 1
        
        if next_nonblank_idx < len(raw_lines):
            next_nonblank = raw_lines[next_nonblank_idx].strip()
            if OPTION_RE.match(raw_lines[next_nonblank_idx]):
                continue  # Next non-blank is a) -> this is a question stem, not continuation
            # Also skip if next non-blank is a tag line starting with a) in rest
            tag_next = TAG_RE.match(next_nonblank)
            if tag_next:
                rest_next = tag_next.group(3).strip()
                if OPTION_RE.match(rest_next):
                    continue  # Tag line with a) option -> new question
        
        # FILTER: Reject false positives where the "continuation" is actually
        # a question stem. Genuine continuations are sentence fragments that
        # complete an option, NOT full questions.
        # Question stems almost always contain ？ or end with ： (introducing options).
        if re.search(r"[？?：:]\s*$", next_stripped) or re.search(r"[？?]", next_stripped):
            continue  # Contains question mark or ends with colon -> question stem
        # Also reject if it contains roman numeral sub-options (i. ii. iii.)
        if re.search(r"[iivx]+\.\s", next_stripped):
            continue
        
        # It's a genuine continuation line
        cont_text = re.sub(r"\s+[A-D]\s*$", "", next_stripped).strip()
        if cont_text:
            results.append({
                "line": i + 1,
                "letter": letter,
                "opt_first_line": opt_text,
                "continuation": cont_text,
                "type": "next_line"
            })
    
    return results


def find_question_number_for_line(raw_lines: list[str], line_idx: int) -> int | None:
    """Find the question number that owns the option at line_idx.
    
    Search forward and backward for the nearest tag line.
    The tag line within the same question block gives us the number.
    """
    # Search backward for nearest tag
    for i in range(line_idx, max(line_idx - 15, -1), -1):
        if i < 0:
            break
        m = TAG_RE.match(raw_lines[i].strip())
        if m:
            return int(m.group(1))
    
    # Search forward for nearest tag
    for i in range(line_idx + 1, min(line_idx + 15, len(raw_lines))):
        m = TAG_RE.match(raw_lines[i].strip())
        if m:
            return int(m.group(1))
    
    return None


def fix_paper(layout_path: str, json_path: str, paper: str) -> int:
    """Fix truncated options in JSON using layout as ground truth."""
    with open(layout_path, "r", encoding="utf-8") as f:
        raw_lines = f.readlines()
    
    continuations = find_continuations(layout_path)
    
    with open(json_path, "r", encoding="utf-8") as f:
        questions = json.load(f)
    
    q_by_num = {q["number"]: q for q in questions}
    
    fixes = 0
    for cont in continuations:
        # Find question number
        qnum = find_question_number_for_line(raw_lines, cont["line"] - 1)
        if qnum is None:
            continue
        
        letter = cont["letter"]
        continuation = cont["continuation"]
        first_line = cont["opt_first_line"]
        
        # Clean answer letter from first_line
        first_line_clean = re.sub(r"\s+[A-D]\s*$", "", first_line).strip()
        
        if qnum not in q_by_num:
            continue
        
        q = q_by_num[qnum]
        current_opt = q["options"].get(letter, "")
        
        # Skip if already contains the continuation
        if continuation in current_opt:
            continue
        
        # The expected full option text
        expected_full = first_line_clean + continuation
        
        # Verify current option is a truncated prefix of expected
        if not current_opt or not expected_full.startswith(current_opt):
            # Try: maybe current_opt has slight differences
            # Check if first_line_clean starts with current_opt (option might have
            # been further processed)
            if current_opt and first_line_clean.startswith(current_opt):
                # current_opt is even shorter than first_line_clean
                # This means the option was truncated at an even earlier point
                expected_full = current_opt + first_line_clean[len(current_opt):] + continuation
            else:
                continue
        
        if len(current_opt) >= len(expected_full):
            continue  # Not truncated
        
        missing = expected_full[len(current_opt):]
        
        # Find the next question and check if its stem starts with the missing text
        next_qnum = qnum + 1
        if next_qnum not in q_by_num:
            # Last question - just fix the option
            q["options"][letter] = expected_full
            fixes += 1
            print(f"  [{paper}] Q{qnum} opt {letter}: appended '{missing[:30]}'")
            continue
        
        next_q = q_by_num[next_qnum]
        next_stem = next_q["question"]
        
        if next_stem.startswith(missing):
            q["options"][letter] = expected_full
            next_q["question"] = next_stem[len(missing):]
            fixes += 1
            print(f"  [{paper}] Q{qnum} opt {letter}: +'{missing[:30]}' | Q{next_qnum} stem fixed")
        else:
            # Try normalized comparison (space differences)
            # The missing text might have different spacing
            found = False
            for trim in range(len(missing), 0, -1):
                candidate = missing[:trim]
                if next_stem.startswith(candidate):
                    q["options"][letter] = current_opt + candidate
                    next_q["question"] = next_stem[len(candidate):]
                    fixes += 1
                    print(f"  [{paper}] Q{qnum} opt {letter}: +'{candidate[:30]}' (partial) | Q{next_qnum} stem fixed")
                    found = True
                    break
            if not found:
                print(f"  [{paper}] Q{qnum} opt {letter}: CANNOT FIX - missing '{missing[:40]}' not in Q{next_qnum} stem '{next_stem[:40]}'")
    
    if fixes > 0:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
            f.write("\n")
    
    return fixes


def main():
    targets = [
        {
            "layout": os.path.join(SCRIPTS, "_mock_p1_layout.txt"),
            "json": os.path.join(DATA, "questions-p1-mock.json"),
            "paper": "P1",
        },
        {
            "layout": os.path.join(SCRIPTS, "_mock_p3_layout.txt"),
            "json": os.path.join(DATA, "questions-p3-mock.json"),
            "paper": "P3",
        },
    ]
    
    for t in targets:
        if not os.path.exists(t["layout"]):
            print(f"[skip] {t['layout']} not found")
            continue
        print(f"\n=== {t['paper']} ===")
        conts = find_continuations(t["layout"])
        print(f"  Found {len(conts)} continuation lines in layout")
        fixes = fix_paper(t["layout"], t["json"], t["paper"])
        print(f"  Total fixes applied: {fixes}")


if __name__ == "__main__":
    main()
