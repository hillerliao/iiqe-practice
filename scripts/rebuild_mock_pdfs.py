"""Rebuild IIQE 2025 mock-question JSON from PDF word coordinates.

The PDF is a table whose question number/reference/answer cells are vertically
interleaved with question and option text.  This tool extracts words with
pdfplumber, groups them into visual lines, removes table-only cells by their
x-coordinate, and reconstructs questions from a/b/c/d option boundaries.

Run an audit before modifying data:
  python scripts/rebuild_mock_pdfs.py --audit-only
Then rebuild after audit validation succeeds:
  python scripts/rebuild_mock_pdfs.py --rebuild

The audit JSON records source hashes, parser diagnostics, source/current answer
conflicts, and validation results.  It is intentionally a tracked, reproducible
artifact rather than a temporary extraction file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT.parent
AUDIT_PATH = ROOT / "scripts" / "mock_pdf_rebuild_audit.json"

OPTION_RE = re.compile(r"^([abcd])\)(.*)$", re.IGNORECASE)
NUMBER_RE = re.compile(r"^\d{1,4}$")
# References use several source-specific variants, including notes, ampersands
# and a comma typo. Their coordinate column distinguishes them from content.
REF_RE = re.compile(r"^(?=.*\d)[0-9A-Za-z().,&註]+$", re.IGNORECASE)
ANSWER_RE = re.compile(r"^[A-D]$")

SOURCES = (
    {
        "paper": "P1",
        "expected_count": 919,
        "pdf": PDF_ROOT / "試卷㇐：保險原理及實務 — 模擬試題2025年版(適用於2025年2月17日或以後的考試).pdf",
        "target": ROOT / "data" / "questions-p1-mock.json",
    },
    {
        "paper": "P3",
        "expected_count": 865,
        "pdf": PDF_ROOT / "試卷三⾧期保險模擬試題2025年版.pdf",
        "target": ROOT / "data" / "questions-p3-mock.json",
    },
)


@dataclass
class VisualLine:
    """A horizontal PDF text line, ordered by its visual y position."""

    page: int
    top: float
    words: list[dict[str, Any]]

    @property
    def text(self) -> str:
        return " ".join(word["text"] for word in sorted(self.words, key=lambda word: word["x0"]))


@dataclass
class ParsedQuestion:
    number: int | None = None
    ref: str | None = None
    answer: str | None = None
    page: int | None = None
    stem_lines: list[str] = field(default_factory=list)
    options: dict[str, list[str]] = field(default_factory=lambda: {letter: [] for letter in "abcd"})
    active_option: str | None = None

    def append_text(self, text: str) -> None:
        if not text:
            return
        if self.active_option is None:
            self.stem_lines.append(text)
        else:
            self.options[self.active_option].append(text)

    def as_source_dict(self) -> dict[str, Any]:
        return {
            "number": self.number,
            "ref": self.ref,
            "question": join_text(self.stem_lines),
            "options": {letter: join_text(self.options[letter]) for letter in "abcd"},
            "answer": self.answer.lower() if self.answer else None,
            "page": self.page,
        }


def join_text(parts: Iterable[str]) -> str:
    """Normalize PDF line breaks without changing text content or punctuation."""
    return re.sub(r"\s+", " ", " ".join(part.strip() for part in parts if part.strip())).strip()


def group_visual_lines(words: list[dict[str, Any]], page_number: int) -> list[VisualLine]:
    """Group words by nearby y-coordinate, preserving distinct table rows.

    The source has line fragments at slightly different baselines.  A 1.5 point
    tolerance joins normal text but keeps the number/ref/answer cells distinct
    when they are intentionally placed on adjacent visual rows.
    """
    lines: list[VisualLine] = []
    for word in sorted(words, key=lambda word: (word["top"], word["x0"])):
        if lines and abs(word["top"] - lines[-1].top) <= 1.5:
            lines[-1].words.append(word)
        else:
            lines.append(VisualLine(page=page_number, top=word["top"], words=[word]))
    return lines


def is_header(line: VisualLine) -> bool:
    text = line.text
    return (
        "模擬試題2025年版" in text
        or text in {"試卷一", "試卷㇐", "試卷三", "⾧期保險", "I I Q E"}
        or ("題號" in text and "參考章節" in text)
    )


def extract_anchor(lines: list[VisualLine], index: int) -> tuple[int, str, str | None] | None:
    """Read number/reference/answer from their dedicated table columns.

    Most records place all three cells on one baseline. A few source records
    wrap the reference cell immediately above and/or below the number cell, so
    nearby reference-column fragments are joined by y-coordinate as well.
    """
    line = lines[index]
    left = [word["text"] for word in line.words if word["x0"] < 60]
    number = next((int(text) for text in left if NUMBER_RE.fullmatch(text)), None)
    if number is None:
        return None

    reference_words: list[dict[str, Any]] = []
    for nearby in lines:
        if abs(nearby.top - line.top) <= 8:
            reference_words.extend(word for word in nearby.words if 60 <= word["x0"] < 135)
    ref = join_text(word["text"] for word in sorted(reference_words, key=lambda word: (word["top"], word["x0"])))
    right = [word["text"] for word in line.words if word["x0"] >= 500]
    answer = next((text for text in right if ANSWER_RE.fullmatch(text)), None)
    if not ref or not REF_RE.fullmatch(ref.replace(" ", "")):
        return None
    return number, ref, answer


def content_text(line: VisualLine, anchor: tuple[int, str, str | None] | None) -> str:
    """Return visible question-column text after removing table-cell metadata."""
    kept = []
    for word in sorted(line.words, key=lambda word: word["x0"]):
        # The narrow left table columns carry number/reference fragments. The
        # only legitimate question text there is an option marker on page 2.
        if word["x0"] < 60 or word["x0"] >= 500:
            continue
        if 60 <= word["x0"] < 135 and not OPTION_RE.match(word["text"]):
            continue
        kept.append(word["text"])
    return join_text(kept)


def starts_new_question(question: ParsedQuestion, text: str) -> bool:
    """Return whether content follows a completed d) option.

    A table anchor occurs in the middle of a question, between option rows. The
    d)-to-next-stem transition is consequently the dependable record boundary.

    However, option d text may wrap to a second visual line in the PDF. Such
    continuations are short fragments without question markers, so we exclude
    them from triggering a new question.
    """
    if question.active_option != "d" or not text:
        return False
    # If option d's accumulated text ends abruptly (mid-word), the next line is
    # likely a continuation rather than a new question stem.
    option_d_text = join_text(question.options["d"])
    if option_d_text and option_d_text[-1] in "不另至因而或及的於與和但卻又且並乃即若如雖因由自到來去起過著得地之其此該各每某別向對把被將從以素金員權力資格":
        return False
    # Short fragments without question punctuation are likely continuations.
    if len(text) <= 15 and not re.search(r"[？?：:]", text):
        return False
    return True


def consume_content(question: ParsedQuestion, text: str) -> None:
    """Append a line, splitting at a leading a/b/c/d option marker."""
    if not text:
        return
    match = OPTION_RE.match(text)
    if match:
        question.active_option = match.group(1).lower()
        question.append_text(match.group(2).strip())
    else:
        question.append_text(text)


def parse_pdf(pdf_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extract numbered questions in source order, including cross-page content."""
    questions: list[dict[str, Any]] = []
    current: ParsedQuestion | None = None
    diagnostics: dict[str, Any] = {"pages": 0, "anchors": [], "orphan_content": []}

    with pdfplumber.open(pdf_path) as pdf:
        diagnostics["pages"] = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages, start=1):
            visual_lines = group_visual_lines(page.extract_words(use_text_flow=False, keep_blank_chars=False), page_number)
            for line_index, line in enumerate(visual_lines):
                if is_header(line):
                    continue
                anchor = extract_anchor(visual_lines, line_index)
                text = content_text(line, anchor)

                # The next ordinary content after d) starts the following
                # question. Keeping state across pages handles continuations.
                if current is not None and starts_new_question(current, text):
                    questions.append(current.as_source_dict())
                    current = ParsedQuestion()
                if current is None:
                    current = ParsedQuestion()

                if anchor:
                    number, ref, answer = anchor
                    if current.number is not None:
                        diagnostics["orphan_content"].append(current.as_source_dict())
                        current = ParsedQuestion()
                    current.number = number
                    current.ref = ref
                    current.answer = answer
                    current.page = page_number
                    diagnostics["anchors"].append({"number": number, "page": page_number, "ref": ref})
                if text:
                    consume_content(current, text)

    if current is not None and current.number is not None:
        questions.append(current.as_source_dict())
    elif current is not None and (current.stem_lines or any(current.options.values())):
        diagnostics["orphan_content"].append(current.as_source_dict())
    return questions, diagnostics


def load_current(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON list")
    return data


def validate_source(questions: list[dict[str, Any]], expected_count: int) -> list[str]:
    errors: list[str] = []
    numbers = [question["number"] for question in questions]
    if len(questions) != expected_count:
        errors.append(f"expected {expected_count} questions, extracted {len(questions)}")
    if numbers != list(range(1, expected_count + 1)):
        errors.append("question numbers are not exactly sequential from 1 through expected count")
    for question in questions:
        number = question["number"]
        if not question["ref"]:
            errors.append(f"question {number}: missing reference")
        if not question["question"]:
            errors.append(f"question {number}: missing stem")
        missing = [letter for letter in "abcd" if not question["options"].get(letter)]
        if missing:
            errors.append(f"question {number}: empty options {','.join(missing)}")
        if question["answer"] not in {"a", "b", "c", "d", None}:
            errors.append(f"question {number}: invalid answer {question['answer']!r}")
    return errors


def reconstruct(source_questions: list[dict[str, Any]], current: list[dict[str, Any]], paper: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Overlay source truth while preserving the established mock JSON fields."""
    current_by_number = {record.get("number"): record for record in current if isinstance(record.get("number"), int)}
    records: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for source in source_questions:
        number = source["number"]
        old = current_by_number.get(number, {})
        source_answer = source["answer"]
        old_answer = old.get("answer")
        if source_answer and old_answer and source_answer != old_answer:
            conflicts.append({"number": number, "current": old_answer, "source": source_answer})
        answer = source_answer or old_answer
        records.append(
            {
                "id": f"{paper}-mock-{number}",
                "number": number,
                "ref": source["ref"],
                "question": source["question"],
                "options": source["options"],
                "answer": answer,
                "explanation": old.get("explanation"),
                "page": source["page"],
                "source": "mock",
                "sourceLabel": "2025模擬試題",
            }
        )
    return records, conflicts


def compare_reparsed(records: list[dict[str, Any]], source_questions: list[dict[str, Any]]) -> list[str]:
    """Ensure every source-derived field survived schema reconstruction exactly."""
    errors: list[str] = []
    for record, source in zip(records, source_questions, strict=True):
        for field in ("number", "ref", "question", "options", "page"):
            if record[field] != source[field]:
                errors.append(f"question {source['number']}: rebuilt {field} differs from re-parsed PDF")
        if source["answer"] and record["answer"] != source["answer"]:
            errors.append(f"question {source['number']}: rebuilt answer differs from PDF answer")
    return errors


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_one(source_config: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    source_questions, diagnostics = parse_pdf(source_config["pdf"])
    current = load_current(source_config["target"])
    validation_errors = validate_source(source_questions, source_config["expected_count"])
    rebuilt, conflicts = reconstruct(source_questions, current, source_config["paper"])
    validation_errors.extend(compare_reparsed(rebuilt, source_questions))
    source_answers = Counter(question["answer"] is not None for question in source_questions)
    return (
        {
            "paper": source_config["paper"],
            "sourcePdf": str(source_config["pdf"]),
            "sourcePdfSha256": sha256(source_config["pdf"]),
            "target": str(source_config["target"]),
            "expectedCount": source_config["expected_count"],
            "currentCount": len(current),
            "extractedCount": len(source_questions),
            "sourceAnswerAvailability": {"available": source_answers[True], "unavailable": source_answers[False]},
            "answerConflicts": conflicts,
            "validationErrors": validation_errors,
            "valid": not validation_errors,
            "anchorPages": diagnostics["anchors"],
        },
        rebuilt,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--audit-only", action="store_true", help="parse and write audit only; do not alter datasets")
    action.add_argument("--rebuild", action="store_true", help="write validated reconstructed mock datasets")
    args = parser.parse_args()

    audit: dict[str, Any] = {"parser": str(Path(__file__).relative_to(ROOT)), "method": "pdfplumber word coordinates", "papers": []}
    rebuilt_by_target: list[tuple[Path, list[dict[str, Any]]]] = []
    for source_config in SOURCES:
        paper_audit, rebuilt = audit_one(source_config)
        audit["papers"].append(paper_audit)
        rebuilt_by_target.append((source_config["target"], rebuilt))

    audit["valid"] = all(paper["valid"] for paper in audit["papers"])
    AUDIT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote audit: {AUDIT_PATH}")
    for paper in audit["papers"]:
        print(f"{paper['paper']}: {paper['extractedCount']}/{paper['expectedCount']} extracted; valid={paper['valid']}; answer conflicts={len(paper['answerConflicts'])}")

    if args.rebuild:
        if not audit["valid"]:
            raise SystemExit("Refusing rebuild: audit validation failed")
        for target, records in rebuilt_by_target:
            target.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Rebuilt: {target} ({len(records)} records)")


if __name__ == "__main__":
    main()
