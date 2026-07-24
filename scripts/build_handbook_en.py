"""Generate isolated English P1 and P3 handbook JSON and offline HTML."""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import pdfplumber

try:
    from .build_handbook import (
        _spans_to_markdown,
        esc,
        make_offline_html,
        render_paragraph,
    )
except ImportError:
    from build_handbook import (  # type: ignore[import-not-found]
        _spans_to_markdown,
        esc,
        make_offline_html,
        render_paragraph,
    )

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT.parent
OUT_DIR = ROOT / "public" / "handbook"

Line = tuple[str, str, float, float, bool, float]

H1_RE = re.compile(r"^([1-7])\s+(.+)$")
H2_RE = re.compile(r"^(\d+)\.(\d+)\.?\s+(.+)$")
H3_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)\.?\s+(.+)$")
NUMBER_ONLY_RE = re.compile(r"^(\d+(?:\.\d+){0,2})\.?$")
APPENDIX_RE = re.compile(r"^Appendix\s+([A-N])$", re.IGNORECASE)
PAGE_NUMBER_RE = re.compile(r"^(?:\d+\s*/\s*\d+|\d+/\d+)$")

ENGLISH_LABELS = {
    "brand": "IIQE Study Hub",
    "home": "Back to home",
    "handbook": "Study Notes: ",
    "open_toc": "Open table of contents",
    "toc": "Contents",
    "switch_theme": "Switch theme",
    "theme": "Theme",
    "light": "Light",
    "light_desc": "Always use light mode",
    "dark": "Dark",
    "dark_desc": "Always use dark mode",
    "system": "System",
    "system_desc": "Follow the operating system setting",
    "back_to_top": "Back to top",
}


@dataclass(frozen=True)
class HandbookSpec:
    slug: str
    pdf_name: str
    title: str
    version: str
    chapter_starts: dict[int, int]
    tail_sections: dict[int, tuple[str, str]]
    appendix_start: int | None = None


SPECS = (
    HandbookSpec(
        slug="exam1-2024-en",
        pdf_name="StudyNotes - Principles and Practice of Insurance Examination - P1_SN_2024_eng.pdf",
        title="Principles and Practice of Insurance Examination Study Notes",
        version="Eighth Edition, November 2024",
        chapter_starts={1: 9, 2: 15, 3: 27, 4: 48, 5: 59, 6: 70, 7: 159},
        tail_sections={
            195: ("apx-glossary", "Glossary"),
            215: ("apx-index", "Index"),
            224: ("apx-representative-answers", "Representative Examination Questions Answers"),
            225: ("apx-ack", "Acknowledgements"),
        },
    ),
    HandbookSpec(
        slug="exam3-2022-en",
        pdf_name="Long Term Insurance Examination P3_StudyNotes_2022_Eng.pdf",
        title="Long Term Insurance Examination Study Notes",
        version="August 2022 Edition",
        chapter_starts={1: 8, 2: 26, 3: 45, 4: 67, 5: 80},
        appendix_start=135,
        tail_sections={
            204: ("apx-glossary", "Glossary"),
            226: ("apx-index", "Index"),
            235: ("apx-representative-answers", "Representative Examination Questions Answers"),
            236: ("apx-ack", "Acknowledgements"),
        },
    ),
)


def extract_pdf_pages(pdf_path: Path, first_page: int) -> list[tuple[int, list[Line]]]:
    pages: list[tuple[int, list[Line]]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            if page_number < first_page:
                continue
            rows: dict[float, list[dict]] = defaultdict(list)
            for char in page.chars:
                rows[round(float(char["top"]) / 0.5) * 0.5].append(char)

            extracted: list[Line] = []
            previous_y: float | None = None
            for y, chars in sorted(rows.items()):
                ordered = sorted(chars, key=lambda char: float(char["x0"]))
                spans = [(str(char["text"]), str(char.get("fontname", ""))) for char in ordered]
                plain = "".join(text for text, _ in spans).strip()
                if not plain or PAGE_NUMBER_RE.fullmatch(plain):
                    continue
                x0 = min(float(char["x0"]) for char in ordered)
                size = max(float(char.get("size", 0.0)) for char in ordered)
                visible = [char for char in ordered if str(char.get("text", "")).strip()]
                bold = bool(visible) and sum(
                    "bold" in str(char.get("fontname", "")).lower() for char in visible
                ) >= len(visible) * 0.7
                gap = 0.0 if previous_y is None else y - previous_y
                extracted.append((plain, _spans_to_markdown(spans), x0, size, bold, gap))
                previous_y = y
            pages.append((page_number, extracted))
    return pages


def merge_split_heading_lines(lines: list[Line]) -> list[Line]:
    """Join a standalone section number and wrapped bold title lines."""
    result: list[Line] = []
    index = 0
    while index < len(lines):
        plain, markdown, x0, size, bold, gap = lines[index]
        number_match = NUMBER_ONLY_RE.fullmatch(plain)
        if number_match and bold and index + 1 < len(lines):
            following = lines[index + 1]
            if following[4] and following[3] >= 12.5:
                plain = f"{number_match.group(1)} {following[0]}"
                markdown = f"{markdown} {following[1]}"
                size = max(size, following[3])
                index += 1

        match = H3_RE.match(plain) or H2_RE.match(plain)
        if match and bold:
            title_parts = [match.group(match.lastindex or 0).strip()]
            markdown_parts = [markdown]
            while index + 1 < len(lines) and len(title_parts) < 4:
                following = lines[index + 1]
                next_plain = following[0].strip()
                if (
                    not following[4]
                    or following[3] < 12.5
                    or H1_RE.match(next_plain)
                    or H2_RE.match(next_plain)
                    or H3_RE.match(next_plain)
                    or APPENDIX_RE.match(next_plain)
                    or next_plain.upper() in {"GLOSSARY", "INDEX", "ACKNOWLEDGEMENTS"}
                ):
                    break
                title_parts.append(next_plain)
                markdown_parts.append(following[1])
                index += 1
            if len(title_parts) > 1:
                title_group = match.lastindex or 0
                plain = plain[: match.start(title_group)] + " ".join(title_parts)
                markdown = " ".join(markdown_parts)
        result.append((plain, markdown, x0, size, bold, gap))
        index += 1
    return result


def _page_badge(page: int) -> str:
    return f'<a class="page-badge" id="pdf-page-{page}" href="#pdf-page-{page}">PDF p.{page}</a>'


def build_handbook(spec: HandbookSpec, pages: list[tuple[int, list[Line]]]) -> tuple[list[dict], str]:
    chapters: list[dict] = []
    html: list[str] = []
    pending: list[tuple[str, float]] = []
    current_chapter: int | None = None
    seen_ids: set[str] = set()
    appendix_letters: set[str] = set()

    def flush() -> None:
        nonlocal pending
        if pending:
            html.append(render_paragraph(pending, False))
            pending = []

    def add_heading(entry: dict, tag: str, label: str) -> None:
        if entry["id"] in seen_ids:
            return
        flush()
        seen_ids.add(entry["id"])
        chapters.append(entry)
        badge = _page_badge(entry["page"]) if entry["level"] <= 2 else ""
        html.append(f'<{tag} id="{entry["id"]}">{esc(label)} {badge}</{tag}>')

    for page_number, raw_lines in pages:
        lines = merge_split_heading_lines(raw_lines)
        tail = spec.tail_sections.get(page_number)
        if tail:
            section_id, title = tail
            add_heading(
                {"id": section_id, "level": 1, "number": "", "title": title, "page": page_number},
                "h1",
                title,
            )

        expected_chapter = next(
            (number for number, start in spec.chapter_starts.items() if start == page_number),
            None,
        )
        for index, (plain, markdown, x0, size, bold, gap) in enumerate(lines):
            stripped = re.sub(r"\s+", " ", plain.strip())
            upper = stripped.upper()

            if tail and upper in {
                "GLOSSARY",
                "INDEX",
                "ACKNOWLEDGEMENTS",
                "REPRESENTATIVE EXAMINATION QUESTIONS",
                "ANSWERS",
            }:
                continue

            if spec.appendix_start and page_number >= spec.appendix_start:
                appendix = APPENDIX_RE.fullmatch(stripped)
                if appendix and appendix.group(1).upper() not in appendix_letters:
                    letter = appendix.group(1).upper()
                    appendix_letters.add(letter)
                    title_parts: list[str] = []
                    for candidate in lines[index + 1 : index + 5]:
                        candidate_text = candidate[0].strip()
                        if candidate_text.startswith("(Source:"):
                            break
                        has_page_count = bool(re.search(r"\(\d+/\d+\)$", candidate_text))
                        cleaned = re.sub(r"\s*\(\d+/\d+\)$", "", candidate_text).strip()
                        if cleaned:
                            title_parts.append(cleaned)
                        if has_page_count:
                            break
                    title = " ".join(title_parts) or f"Appendix {letter}"
                    if title.count("(") == title.count(")") + 1:
                        title += ")"
                    add_heading(
                        {
                            "id": f"apx-{letter.lower()}",
                            "level": 1,
                            "number": f"Appendix {letter}",
                            "title": title,
                            "page": page_number,
                        },
                        "h1",
                        f"Appendix {letter}: {title}",
                    )
                    continue

            if expected_chapter is not None and bold and size >= 14.5:
                h1 = H1_RE.match(stripped)
                if h1 and int(h1.group(1)) == expected_chapter:
                    current_chapter = expected_chapter
                    title = h1.group(2).strip()
                    add_heading(
                        {
                            "id": f"ch-{current_chapter}",
                            "level": 1,
                            "number": f"Chapter {current_chapter}",
                            "title": title,
                            "page": page_number,
                        },
                        "h1",
                        f"Chapter {current_chapter}: {title}",
                    )
                    continue

            in_main_text = current_chapter is not None and (
                spec.appendix_start is None or page_number < spec.appendix_start
            ) and page_number < min(spec.tail_sections)
            if in_main_text and bold and size >= 12.5:
                h3 = H3_RE.match(stripped)
                if h3 and int(h3.group(1)) == current_chapter:
                    number = ".".join(h3.group(i) for i in range(1, 4))
                    title = h3.group(4).strip()
                    add_heading(
                        {
                            "id": "ch-" + number.replace(".", "-"),
                            "level": 3,
                            "number": number,
                            "title": title,
                            "page": page_number,
                            "parent": "ch-" + "-".join(number.split(".")[:2]),
                        },
                        "h3",
                        f"{number} {title}",
                    )
                    continue
                h2 = H2_RE.match(stripped)
                if h2 and int(h2.group(1)) == current_chapter:
                    number = f"{h2.group(1)}.{h2.group(2)}"
                    title = h2.group(3).strip()
                    add_heading(
                        {
                            "id": "ch-" + number.replace(".", "-"),
                            "level": 2,
                            "number": number,
                            "title": title,
                            "page": page_number,
                            "parent": f"ch-{current_chapter}",
                        },
                        "h2",
                        f"{number} {title}",
                    )
                    continue

            if gap > 24 and pending:
                flush()
            pending.append((markdown, x0))
        flush()

    return chapters, "\n".join(part for part in html if part)


def validate_structure(spec: HandbookSpec, chapters: list[dict], html: str) -> None:
    ids = [chapter["id"] for chapter in chapters]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{spec.slug}: duplicate chapter IDs")
    for chapter in chapters:
        if html.count(f'id="{chapter["id"]}"') != 1:
            raise ValueError(f"{spec.slug}: invalid HTML anchor count for {chapter['id']}")
    expected = {f"ch-{number}" for number in spec.chapter_starts}
    expected.update(section_id for section_id, _ in spec.tail_sections.values())
    if spec.appendix_start:
        expected.update(f"apx-{letter.lower()}" for letter in "ABCDEFGHIJKLMN")
    missing = sorted(expected.difference(ids))
    if missing:
        raise ValueError(f"{spec.slug}: missing expected sections: {', '.join(missing)}")


def generate(spec: HandbookSpec) -> tuple[Path, Path, int]:
    pdf_path = PDF_DIR / spec.pdf_name
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)
    pages = extract_pdf_pages(pdf_path, min(spec.chapter_starts.values()))
    chapters, body_html = build_handbook(spec, pages)
    validate_structure(spec, chapters, body_html)
    data = {
        "slug": spec.slug,
        "title": spec.title,
        "version": spec.version,
        "language": "en-HK",
        "chapters": chapters,
        "html": body_html,
        "pdfPageStarts": sorted(spec.chapter_starts.values()),
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_DIR / f"{spec.slug}.json"
    html_path = OUT_DIR / f"{spec.slug}.html"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    html_path.write_text(
        make_offline_html(
            spec.title,
            spec.version,
            chapters,
            body_html,
            language="en-HK",
            labels=ENGLISH_LABELS,
        ),
        encoding="utf-8",
    )
    return json_path, html_path, len(chapters)


def main() -> int:
    requested = set(sys.argv[1:])
    specs = [spec for spec in SPECS if not requested or spec.slug in requested]
    if requested.difference(spec.slug for spec in specs):
        print("Unknown slug(s): " + ", ".join(sorted(requested)), file=sys.stderr)
        return 2
    for spec in specs:
        json_path, html_path, count = generate(spec)
        print(f"{spec.slug}: {count} sections")
        print(f"  -> {json_path}")
        print(f"  -> {html_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
