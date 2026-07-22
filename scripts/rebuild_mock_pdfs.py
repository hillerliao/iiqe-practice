"""Rebuild IIQE 2025 mock-question JSON from physical PDF table rows.

Each numbered source-table row is one authoritative question boundary. The
parser extracts the row's number, reference, question content, and answer cells
independently, then splits the question cell at ordered a/b/c/d markers.

Run an audit before modifying data:
  python scripts/rebuild_mock_pdfs.py --audit-only
Then rebuild after audit validation succeeds:
  python scripts/rebuild_mock_pdfs.py --rebuild

The audit JSON records source hashes, parser diagnostics, source/current answer
conflicts, and validation results. It is intentionally a tracked, reproducible
artifact rather than a temporary extraction file.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import platform
import re
import sys
from collections import Counter
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


def join_text(parts: Iterable[str]) -> str:
    """Normalize PDF line breaks without changing text content or punctuation."""
    return re.sub(r"\s+", " ", " ".join(part.strip() for part in parts if part.strip())).strip()


def extract_cell_words(
    page: Any,
    cell: tuple[float, float, float, float] | None,
) -> list[dict[str, Any]]:
    """Extract words contained in one physical table cell."""
    if cell is None:
        return []
    return page.crop(cell).extract_words(use_text_flow=False, keep_blank_chars=False)


def join_lines(parts: Iterable[str]) -> str:
    """Join physical PDF line wraps while preserving semantic list spacing."""
    result = ""
    for part in (part.strip() for part in parts if part.strip()):
        if result and re.match(
            r"^(?:[ivx]+(?:[.)]|\s|(?=[\u3400-\u9fff]))|[①-⑳])",
            part,
            re.IGNORECASE,
        ):
            result += " "
        result += part
    return result


def normalize_pdf_spacing(text: str) -> str:
    """Remove extraction-only spaces inserted between adjacent Chinese text."""
    return re.sub(r"(?<=[\u3400-\u9fff]) (?=[\u3400-\u9fff])", "", text)


def cell_text(
    page: Any,
    cell: tuple[float, float, float, float] | None,
) -> str:
    """Return normalized text from one physical table cell."""
    words = extract_cell_words(page, cell)
    lines = group_visual_lines(words)
    return normalize_pdf_spacing(join_lines(line_text(line) for line in lines))


def group_visual_lines(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group cell words by nearby y-coordinate in visual reading order."""
    lines: list[list[dict[str, Any]]] = []
    line_tops: list[float] = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if lines and abs(word["top"] - line_tops[-1]) <= 1.5:
            lines[-1].append(word)
        else:
            lines.append([word])
            line_tops.append(word["top"])
    return lines


def line_text(words: list[dict[str, Any]]) -> str:
    return join_text(word["text"] for word in sorted(words, key=lambda item: item["x0"]))


def split_question_content(
    words: list[dict[str, Any]],
) -> tuple[str, dict[str, str], list[str]]:
    """Split one question cell at its ordered, line-leading option markers."""
    errors: list[str] = []
    sections: dict[str, list[str]] = {"question": []}
    sections.update({letter: [] for letter in "abcd"})
    active = "question"
    markers: list[str] = []

    for line in group_visual_lines(words):
        text = line_text(line)
        match = OPTION_RE.match(text)
        if match:
            letter = match.group(1).lower()
            markers.append(letter)
            active = letter
            remainder = match.group(2).strip()
            if remainder:
                sections[active].append(remainder)
        elif text:
            sections[active].append(text)

    if markers != list("abcd"):
        errors.append(f"option markers are {markers!r}, expected ['a', 'b', 'c', 'd']")

    return (
        normalize_pdf_spacing(join_lines(sections["question"])),
        {
            letter: normalize_pdf_spacing(join_lines(sections[letter]))
            for letter in "abcd"
        },
        errors,
    )


def parse_question_row(
    page: Any,
    page_number: int,
    cells: list[tuple[float, float, float, float] | None],
) -> tuple[dict[str, Any] | None, list[str]]:
    """Parse one numbered physical table row without reading adjacent rows."""
    if len(cells) != 5:
        return None, [f"page {page_number}: row has {len(cells)} cells, expected 5"]

    number_text = cell_text(page, cells[0]).replace(" ", "")
    if not NUMBER_RE.fullmatch(number_text):
        # Every source page repeats one non-numbered table header row.
        return None, []

    number = int(number_text)
    ref = cell_text(page, cells[1])
    stem, options, content_errors = split_question_content(extract_cell_words(page, cells[2]))

    answer_tokens: list[str] = []
    for answer_cell in cells[3:]:
        answer_tokens.extend(
            word["text"].strip()
            for word in extract_cell_words(page, answer_cell)
            if word["text"].strip()
        )
    answers = [token.upper() for token in answer_tokens if ANSWER_RE.fullmatch(token.upper())]

    errors = [f"page {page_number}, question {number}: {error}" for error in content_errors]
    if len(answers) != 1:
        errors.append(
            f"page {page_number}, question {number}: found answers {answers!r}, expected exactly one"
        )

    return (
        {
            "number": number,
            "ref": ref,
            "question": stem,
            "options": options,
            "answer": answers[0].lower() if len(answers) == 1 else None,
            "page": page_number,
        },
        errors,
    )


def parse_pdf(pdf_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extract each question from its authoritative physical table row."""
    questions: list[dict[str, Any]] = []
    diagnostics: dict[str, Any] = {
        "pages": 0,
        "tablePages": 0,
        "tables": 0,
        "rows": 0,
        "dataRows": 0,
        "structureErrors": [],
        "questionPageRanges": [],
    }

    with pdfplumber.open(pdf_path) as pdf:
        diagnostics["pages"] = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables()
            diagnostics["tables"] += len(tables)
            if tables:
                diagnostics["tablePages"] += 1
            if len(tables) > 1:
                diagnostics["structureErrors"].append(
                    f"page {page_number}: found {len(tables)} tables, expected at most one"
                )

            for table in tables:
                diagnostics["rows"] += len(table.rows)
                for row in table.rows:
                    question, errors = parse_question_row(page, page_number, list(row.cells))
                    diagnostics["structureErrors"].extend(errors)
                    if question is None:
                        continue
                    diagnostics["dataRows"] += 1
                    page_ranges = diagnostics["questionPageRanges"]
                    if page_ranges and page_ranges[-1]["page"] == page_number:
                        page_ranges[-1]["lastQuestion"] = question["number"]
                    else:
                        page_ranges.append(
                            {
                                "page": page_number,
                                "firstQuestion": question["number"],
                                "lastQuestion": question["number"],
                            }
                        )
                    questions.append(question)

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
    validation_errors = list(diagnostics["structureErrors"])
    validation_errors.extend(validate_source(source_questions, source_config["expected_count"]))
    rebuilt, conflicts = reconstruct(source_questions, current, source_config["paper"])
    validation_errors.extend(compare_reparsed(rebuilt, source_questions))
    source_answers = Counter(question["answer"] is not None for question in source_questions)
    return (
        {
            "paper": source_config["paper"],
            "sourcePdf": source_config["pdf"].name,
            "sourcePdfSha256": sha256(source_config["pdf"]),
            "target": str(source_config["target"].relative_to(ROOT)).replace("\\", "/"),
            "expectedCount": source_config["expected_count"],
            "currentCount": len(current),
            "extractedCount": len(source_questions),
            "sourceAnswerAvailability": {"available": source_answers[True], "unavailable": source_answers[False]},
            "answerConflicts": conflicts,
            "validationErrors": validation_errors,
            "valid": not validation_errors and not conflicts,
            "diagnostics": diagnostics,
        },
        rebuilt,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--audit-only", action="store_true", help="parse and write audit only; do not alter datasets")
    action.add_argument("--rebuild", action="store_true", help="write validated reconstructed mock datasets")
    args = parser.parse_args()

    audit: dict[str, Any] = {
        "parser": str(Path(__file__).relative_to(ROOT)).replace("\\", "/"),
        "parserSha256": sha256(Path(__file__)),
        "method": "pdfplumber physical table rows and cells",
        "parameters": {
            "tableDetection": "page.find_tables() defaults",
            "wordExtraction": {
                "use_text_flow": False,
                "keep_blank_chars": False,
            },
            "visualLineTolerance": 1.5,
        },
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "pdfplumber": importlib.metadata.version("pdfplumber"),
            "pdfminer.six": importlib.metadata.version("pdfminer.six"),
        },
        "papers": [],
    }
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

    if not audit["valid"]:
        raise SystemExit("Audit validation failed")

    if args.rebuild:
        for target, records in rebuilt_by_target:
            target.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Rebuilt: {target} ({len(records)} records)")


if __name__ == "__main__":
    main()
