"""
build_handbook_p3.py — 將「卷三 - 长期保险 - 2022 年版.pdf」轉為
  1) public/handbook/exam3-2022.json  (供 Next.js 動態路由載入)
  2) public/handbook/exam3-2022.html  (單檔離線預覽)

結構:
  p.1   封面
  p.2   空白
  p.3-6 目錄
  p.7   應考須知
  p.8   第 1 章 人壽保險簡介
  p.24  第 2 章 人壽保險及年金的種類
  p.42  第 3 章 保險利益附約及其他產品
  p.63  第 4 章 闡釋人壽保險單
  p.75  第 5 章 人壽保險程序
  p.121 模擬試題
  p.123 附件 A 起
  p.190 術語解釋
  p.207 辭彙表(中英按字母)
  p.226 模擬試題答案
  p.227 鳴謝

執行:
  python scripts/build_handbook_p3.py
"""
import json
import os
import re
import sys
from html import escape

# 復用卷一(mini-header + 三檔主題 dropdown + 返回首頁/頂部)的最新版 make_offline_html
# 卷一與卷三的「HTML/JSON 結構」不同(chapters schema 一致),但離線預覽樣式完全相同,
# 故兩版本共用同一份 HTML template。
from build_handbook import make_offline_html as _p1_make_offline_html  # type: ignore[import-not-found]  # noqa: E402

import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(ROOT)
PDF_PATH = os.path.join(PARENT, "卷三 - 长期保险 - 2022 年版.pdf")
OUT_DIR = os.path.join(ROOT, "public", "handbook")
os.makedirs(OUT_DIR, exist_ok=True)

SLUG = "exam3-2022"

# 已知章節起始 PDF 頁碼(1 為起)
CHAPTER_START_PAGES = {1: 8, 2: 24, 3: 42, 4: 63, 5: 75}
# 跳過:封面(p1)、空白(p2)、目錄(p3-6)、應考須知(p7)
SKIP_PAGES_BEFORE = 7

CN_DIGIT = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5}
# 卷三一律用「第 N 章」格式;但偶爾只有 "N 標題"
H1_PLAIN_RE = re.compile(r"^([1-5])\s+([^.\d].+)$")
H1_CN_RE = re.compile(r"^第([一二三四五])章\s+(.+)$")
H2_RE = re.compile(r"^(\d+)\.(\d+)\.?\s+(.+)$")
H3_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)\.?\s+(.+)$")

INLINE_BLOCKLIST_START = (
    "以下", "在於", "若要", "若是", "如同", "如果", "當作", "其他", "此種", "此等", "這是", "那是",
    "請問", "請參", "按以", "從以", "對於", "關於", "透過", "通過", "根據", "按照", "由於", "因為",
    "所以", "首先", "其次", "最後", "雖然", "該公", "該保", "本公", "本保", "還有", "也可", "都會",
    "並不", "並非", "為何", "為甚", "為什", "怎麼", "怎樣", "哪些", "哪一", "何人", "誰是",
)
H1_MAX_LEN = 25
H2_MAX_LEN = 40
H3_MAX_LEN = 60

Line = tuple[str, str, float]
ParagraphLine = tuple[str, float]

CONTENT_LEFT_X = 68.0
INDENT_STEP_X = 36.75
MAX_INDENT_LEVEL = 3

# 列舉項 a. / b. / c. …:PDF 中每項常獨立成行,但 build script 把它們
# 跟上一段合併成同一個 <p>。在行首偵測 [a-h]\. + 空白 + CJK 字元
# 來當作新段切點;排除 e.g./i.e. 等英文縮寫(它們後面還有 .)、
# 以及 glossary/vocab/mock-answers(由專用 flush 處理)。
LIST_ITEM_RE = re.compile(r"^[a-h]\.\s+[一-鿿]")


def esc(s: str) -> str:
    return escape(s, quote=True)


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")


# ──────────────────────────────────────────────────────────────
_MARKER_RE = re.compile(r"\x01/?[BI]\x01")


def _strip_markers(s: str) -> str:
    return _MARKER_RE.sub("", s)


def _is_cjk(ch: str) -> bool:
    if not ch or ch.isspace():
        return False
    return ord(ch) >= 0x2E80


def _need_space_between(prev_ch: str, next_ch: str) -> bool:
    if not prev_ch or not next_ch:
        return False
    if _is_cjk(prev_ch) or _is_cjk(next_ch):
        return False
    return True


def smart_join_markdown(lines: list[str]) -> str:
    pieces = [ln.strip() for ln in lines if ln.strip()]
    if not pieces:
        return ""
    result = pieces[0]
    for piece in pieces[1:]:
        prev_vis = _strip_markers(result).rstrip()
        next_vis = _strip_markers(piece).lstrip()
        gap = " " if _need_space_between(
            prev_vis[-1] if prev_vis else "",
            next_vis[0] if next_vis else "",
        ) else ""
        result = result.rstrip() + gap + piece.lstrip()
    return result


_SEP_O_RE = re.compile(r"^o([-\s–—]+o)*[-\s–—]*$", re.IGNORECASE)
_SEP_DASH_RE = re.compile(r"^[-–—=~•·*=\s]{3,}$")
SUBLABEL_RE = re.compile(r"^\d+\.\d+(\.\d+)?[a-z]?\s")


def _indent_level(x0: float) -> int:
    return max(0, min(MAX_INDENT_LEVEL, round((x0 - CONTENT_LEFT_X) / INDENT_STEP_X)))


def render_paragraph(lines: list[ParagraphLine], is_mock_exam_zone: bool) -> str:
    if not lines:
        return ""
    markdown_lines = [line for line, _ in lines]
    indent_level = _indent_level(lines[0][1])
    # 列舉項 a. / b. / c. …:相對於父級 (ii)/(iii) 再深一級,用 padding-left 推 2em
    is_list_item = bool(LIST_ITEM_RE.match(_strip_markers(markdown_lines[0]).strip()))
    classes: list[str] = []
    if indent_level:
        classes.append(f"handbook-indent-{indent_level}")
    if is_list_item:
        classes.append("handbook-list-item")
    paragraph_class = f' class="{" ".join(classes)}"' if classes else ""
    plain_lines = [_strip_markers(line).strip() for line in markdown_lines]
    plain_lines = [p for p in plain_lines if p]
    if not plain_lines:
        return ""
    joined_md = smart_join_markdown(markdown_lines)
    joined_plain = _strip_markers(joined_md).strip()
    joined_nobullet = re.sub(r"^[•·\-\*]\s+", "", joined_plain)
    if _SEP_O_RE.match(joined_nobullet) or _SEP_DASH_RE.match(joined_nobullet):
        return '<hr class="handbook-divider">'
    if all(re.match(r"^[•·\-\*]\s+", p) for p in plain_lines):
        items = []
        for plain_line, line in zip(
            plain_lines, [line for line in markdown_lines if line.strip()]
        ):
            stripped = re.sub(r"^[•·\-\*]\s+", "", line)
            items.append(f"<li>{_markdown_to_html(stripped)}</li>")
        return f"<ul>{''.join(items)}</ul>"
    inner = _markdown_to_html(joined_md)
    inner = _format_inline_lettered_list(inner)
    chunks = _split_long_paragraph(inner)
    return "".join(f"<p{paragraph_class}>{c}</p>" for c in chunks)


def _format_inline_lettered_list(inner_html: str) -> str:
    markers = [f"{letter}." for letter in "abcd"]
    if not all(marker in inner_html for marker in markers):
        return inner_html
    formatted = re.sub(r"(?<=：)(?=a\.\s)", "<br>", inner_html)
    return re.sub(r"(?<=[；;])及(?=[b-d]\.\s)", "及<br>", formatted)


def _font_flags(fontname: str) -> tuple[bool, bool]:
    fn = fontname or ""
    is_bold = "Bold" in fn or "bold" in fn
    is_italic = "Italic" in fn or "italic" in fn or "Oblique" in fn
    return is_bold, is_italic


def _spans_to_html(spans: list[tuple[str, str]]) -> str:
    if not spans:
        return ""
    merged: list[tuple[str, bool, bool]] = []
    for text, font in spans:
        b, i = _font_flags(font)
        if text == "":
            continue
        if merged and merged[-1][1] == b and merged[-1][2] == i:
            merged[-1] = (merged[-1][0] + text, b, i)
        else:
            merged.append((text, b, i))
    out: list[str] = []
    for text, b, i in merged:
        s = esc(text)
        if b and i:
            s = f"<strong><em>{s}</em></strong>"
        elif b:
            s = f"<strong>{s}</strong>"
        elif i:
            s = f"<em>{s}</em>"
        out.append(s)
    return "".join(out)


def extract_pdf_pages() -> list[tuple[int, list[Line]]]:
    """回傳 [(pdf_page_idx(1-based), lines), ...]
    lines = [(plain, markdown, x0)] 段間用 ('', '', 0.0) 標記
    """
    pages: list[tuple[int, list[Line]]] = []
    LINE_GAP = 2.5
    with pdfplumber.open(PDF_PATH) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            if i < SKIP_PAGES_BEFORE:
                continue
            chars = page.chars
            if not chars:
                pages.append((i, []))
                continue
            from collections import defaultdict
            rows: dict[float, list[dict]] = defaultdict(list)
            for c in chars:
                y_key = round(c["top"] / 0.5) * 0.5
                rows[y_key].append(c)
            sorted_ys = sorted(rows.keys())
            merged: list[tuple[float, list[dict]]] = []
            for y in sorted_ys:
                cs = sorted(rows[y], key=lambda c: c["x0"])
                if merged and (y - merged[-1][0] < LINE_GAP):
                    merged[-1] = (y, merged[-1][1] + cs)
                else:
                    merged.append((y, cs))
            row_pairs: list[tuple[float, str, str, float]] = []
            for y, cs in merged:
                spans: list[tuple[str, str]] = [
                    (c["text"], c.get("fontname", "")) for c in sorted(cs, key=lambda c: c["x0"])
                ]
                plain = "".join(s[0] for s in spans).strip()
                if not plain:
                    continue
                if re.match(r"^\d+\s*/\s*\d+$", plain):
                    continue
                x0 = min(float(c["x0"]) for c in cs)
                row_pairs.append((y, plain, _spans_to_markdown(spans), x0))
            if not row_pairs:
                pages.append((i, []))
                continue
            segments: list[list[Line]] = []
            current: list[Line] = []
            prev_y: float | None = None
            for y, plain, mk, x0 in row_pairs:
                if prev_y is None or (y - prev_y) <= 32.0:
                    current.append((plain, mk, x0))
                else:
                    if current:
                        segments.append(current)
                    current = [(plain, mk, x0)]
                prev_y = y
            if current:
                segments.append(current)
            line_pairs: list[Line] = []
            for seg in segments:
                line_pairs.extend(seg)
                if seg is not segments[-1]:
                    line_pairs.append(("", "", 0.0))
            pages.append((i, line_pairs))
    return pages


def _spans_to_markdown(spans: list[tuple[str, str]]) -> str:
    if not spans:
        return ""
    merged: list[tuple[str, bool, bool]] = []
    for text, font in spans:
        if text == "":
            continue
        b, i = _font_flags(font)
        if merged and merged[-1][1] == b and merged[-1][2] == i:
            merged[-1] = (merged[-1][0] + text, b, i)
        else:
            merged.append((text, b, i))
    out: list[str] = []
    for text, b, i in merged:
        s = esc(text)
        if b and i:
            out.append(f"\x01B\x01{s}\x01/B\x01")
        elif b:
            out.append(f"\x01B\x01{s}\x01/B\x01")
        elif i:
            out.append(f"\x01I\x01{s}\x01/I\x01")
        else:
            out.append(s)
    return "".join(out)


def _spans_plain(spans: list[tuple[str, str]]) -> str:
    return esc("".join(s[0] for s in spans))


def _markdown_to_html(s: str) -> str:
    s2 = re.sub(
        r"\x01B\x01(.*?)\x01/B\x01",
        lambda m: f"<strong>{_markdown_to_html(m.group(1))}</strong>",
        s,
        flags=re.DOTALL,
    )
    s2 = re.sub(
        r"\x01I\x01(.*?)\x01/I\x01",
        lambda m: f"<em>{_markdown_to_html(m.group(1))}</em>",
        s2,
        flags=re.DOTALL,
    )
    s2 = re.sub(r"<strong>\s*</strong>", "", s2)
    s2 = re.sub(r"<em>\s*</em>", "", s2)
    s2 = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", s2)
    return s2


_PRIMARY_END = "。！？!?."
_SOFT_END = "；;：:"
_PARA_TARGET = 130
_PARA_SOFT_MIN = 220
_PARA_HARD = 420
_SOFT_BAD_LEAD = "的而及或並且亦也仍則與"


def _previous_visible_char(s: str, from_idx: int) -> str:
    i = from_idx - 1
    while i >= 0:
        ch = s[i]
        if ch == ">":
            i = s.rfind("<", 0, i)
            if i == -1:
                return ""
            i -= 1
            continue
        if ch == ";":
            j = s.rfind("&", 0, i)
            if j != -1 and i - j <= 8:
                i = j - 1
                continue
        if not ch.isspace():
            return ch
        i -= 1
    return ""


def _next_visible_char(s: str, from_idx: int) -> str:
    i = from_idx + 1
    n = len(s)
    while i < n:
        ch = s[i]
        if ch == "<":
            j = s.find(">", i)
            if j == -1:
                return ""
            i = j + 1
            continue
        if ch == "&":
            j = s.find(";", i)
            if j != -1 and j - i <= 8:
                i = j + 1
                continue
            return ch
        if not ch.isspace():
            return ch
        i += 1
    return ""


def _split_long_paragraph(inner_html: str) -> list[str]:
    def total_visible(s: str) -> int:
        t = re.sub(r"</?[^>]+>", "", s)
        t = re.sub(r"&[a-zA-Z#0-9]+;", "X", t)
        return len(t)

    if total_visible(inner_html) < _PARA_TARGET:
        return [inner_html]

    chunks: list[str] = []
    cur = ""
    stack: list[str] = []
    vlen = 0
    i, n = 0, len(inner_html)
    while i < n:
        ch = inner_html[i]
        if ch == "<":
            j = inner_html.find(">", i)
            if j == -1:
                cur += inner_html[i:]
                break
            tag = inner_html[i:j + 1]
            cur += tag
            m_open = re.match(r"<(strong|em)>", tag, re.IGNORECASE)
            m_close = re.match(r"</(strong|em)>", tag, re.IGNORECASE)
            if m_open:
                stack.append(m_open.group(1).lower())
            elif m_close:
                nm = m_close.group(1).lower()
                if stack and stack[-1] == nm:
                    stack.pop()
                elif nm in stack:
                    stack.remove(nm)
            i = j + 1
            continue
        if ch == "&":
            j = inner_html.find(";", i)
            if j != -1 and j - i <= 8:
                cur += inner_html[i:j + 1]
                vlen += 1
                i = j + 1
                continue
        cur += ch
        vlen += 1
        do_split = False
        if ch in _PRIMARY_END and vlen >= _PARA_TARGET:
            prev = _previous_visible_char(inner_html, i)
            nxt = _next_visible_char(inner_html, i)
            if ch == "." and (
                (prev.isdigit() and nxt.isdigit())
                or (prev.isascii() and prev.isalpha() and bool(nxt))
            ):
                do_split = False
            else:
                do_split = True
        elif ch in _SOFT_END:
            nxt = _next_visible_char(inner_html, i)
            if vlen >= _PARA_HARD:
                do_split = True
            elif nxt and nxt in _SOFT_BAD_LEAD:
                do_split = False
            elif vlen >= _PARA_SOFT_MIN:
                do_split = True
        if do_split:
            close = "".join(f"</{t}>" for t in reversed(stack))
            reopen = "".join(f"<{t}>" for t in stack)
            chunks.append(cur + close)
            cur = reopen
            vlen = 0
        i += 1
    if cur.strip():
        chunks.append(cur)
    return chunks or [inner_html]


# 卷三附錄區從 p.121「模擬試題」開始
APPENDIX_START_PAGE = 121


def detect_chapter_for_page(pdf_page: int) -> int | None:
    """給定 PDF 頁碼,回傳其屬於第幾章(1-5),或 None 表示在附錄區。
    附錄區從 p.121 開始(5.6 之後)。
    """
    if pdf_page >= APPENDIX_START_PAGE:
        return None
    chap = None
    for n, start in CHAPTER_START_PAGES.items():
        if pdf_page >= start:
            chap = n
        else:
            break
    return chap


def build_chapters_and_html(pages: list[tuple[int, list[Line]]]) -> tuple[list[dict], str]:
    chapters: list[dict] = []
    html_parts: list[str] = []
    pdf_pages_seen: set[int] = set()

    current_h1_id: str | None = None
    current_h2_id: str | None = None
    current_h2_num: str | None = None
    pending_lines: list[ParagraphLine] = []

    def flush_paragraph():
        nonlocal pending_lines
        if pending_lines:
            is_zone = current_h1_id in ("apx-vocab", "apx-glossary", "apx-mock-answers")
            html_parts.append(render_paragraph(pending_lines, is_zone))
            pending_lines = []

    def flush_glossary():
        """術語解釋/辭彙表:每行是一個術語 + 解釋。辭彙表按字母分節(粗體)。"""
        nonlocal pending_lines
        if not pending_lines:
            return
        out_items: list[str] = []
        for line, _ in pending_lines:
            plain = _strip_markers(line).strip()
            if not plain:
                continue
            out_items.append(f"<p>{_markdown_to_html(line)}</p>")
        if out_items:
            html_parts.append(f'<div class="glossary-block">{"".join(out_items)}</div>')
        pending_lines = []

    def page_badge(pdf_page: int) -> str:
        anchor_id = ""
        if pdf_page not in pdf_pages_seen:
            pdf_pages_seen.add(pdf_page)
            anchor_id = f' id="pdf-page-{pdf_page}"'
        return f'<a class="page-badge"{anchor_id} href="#pdf-page-{pdf_page}">PDF p.{pdf_page}</a>'

    NEW_PARA_START_RE = re.compile(
        r"^(\([a-z]\)|\([ivx]+\)|\(\d+\)|註[:：]|"
        r"[一二三四五六七八九十]+[、.]|"
        r"\d+\s+[一-鿿])"
    )
    BULLET_RE = re.compile(r"^[•·\-\*]\s+")

    def process_line(plain: str, pdf_page: int, is_app_zone: bool) -> bool:
        nonlocal current_h1_id, current_h2_id, current_h2_num

        if not is_app_zone:
            expected_chap = next(
                (n for n, start in CHAPTER_START_PAGES.items() if start == pdf_page),
                None,
            )
            if expected_chap is not None:
                m1_cn = H1_CN_RE.match(plain)
                m1_plain = H1_PLAIN_RE.match(plain) if not m1_cn else None
                m1 = m1_cn or m1_plain
                if m1:
                    if m1_cn:
                        cn = m1.group(1)
                        chap_n = CN_DIGIT[cn]
                        number = f"第{cn}章"
                        title = m1.group(2).strip()
                    else:
                        chap_n = int(m1.group(1))
                        number = f"第{chap_n}章"
                        title = m1.group(2).strip()
                    if (chap_n == expected_chap
                            and len(title) <= H1_MAX_LEN
                            and not title.startswith(INLINE_BLOCKLIST_START)):
                        h1_id = f"ch-{chap_n}"
                        if not any(c["id"] == h1_id for c in chapters):
                            flush_paragraph()
                            chapters.append({
                                "id": h1_id,
                                "level": 1,
                                "number": number,
                                "title": title,
                                "page": pdf_page,
                            })
                            html_parts.append(
                                f'<h1 id="{h1_id}">{esc(number)} {esc(title)} {page_badge(pdf_page)}</h1>'
                            )
                            current_h1_id = h1_id
                            current_h2_id = None
                            current_h2_num = None
                            return True

        m3 = H3_RE.match(plain)
        if m3 and not is_app_zone:
            a, b, c = m3.group(1), m3.group(2), m3.group(3)
            title = m3.group(4).strip()
            if (current_h1_id
                    and re.match(r"^[1-5]$", a)
                    and int(a) == int(current_h1_id.split("-")[1])
                    and len(title) <= H3_MAX_LEN):
                h3_id = f"ch-{a}-{b}-{c}"
                if not any(cc["id"] == h3_id for cc in chapters):
                    flush_paragraph()
                    chapters.append({
                        "id": h3_id,
                        "level": 3,
                        "number": f"{a}.{b}.{c}",
                        "title": title,
                        "page": pdf_page,
                        "parent": f"ch-{a}-{b}",
                    })
                    html_parts.append(
                        f'<h3 id="{h3_id}">{esc(a)}.{esc(b)}.{esc(c)} {esc(title)}</h3>'
                    )
                    return True

        m2 = H2_RE.match(plain)
        if m2 and not is_app_zone:
            a, b = m2.group(1), m2.group(2)
            title = m2.group(3).strip()
            if (current_h1_id
                    and re.match(r"^[1-5]$", a)
                    and int(a) == int(current_h1_id.split("-")[1])
                    and len(title) <= H2_MAX_LEN):
                h2_id = f"ch-{a}-{b}"
                if not any(cc["id"] == h2_id for cc in chapters):
                    flush_paragraph()
                    h2_num = f"{a}.{b}"
                    chapters.append({
                        "id": h2_id,
                        "level": 2,
                        "number": h2_num,
                        "title": title,
                        "page": pdf_page,
                        "parent": current_h1_id,
                    })
                    html_parts.append(
                        f'<h2 id="{h2_id}">{esc(h2_num)} {esc(title)} {page_badge(pdf_page)}</h2>'
                    )
                    current_h2_id = h2_id
                    current_h2_num = h2_num
                    return True
        return False

    # 卷三附錄結構(從 p.118 開始)
    APPENDIX_TITLES = [
        ("模擬試題答案", "apx-mock-answers"),
        ("模擬試題", "apx-mock-1"),
        ("術語解釋", "apx-glossary"),
        ("辭彙表", "apx-vocab"),
        ("鳴謝", "apx-ack"),
    ]
    # 附件(A-N)標題偵測:每個附件以「附件 X」單獨成行,後續幾行是標題+資料來源
    # 抓標題邏輯:取緊接的標題行(不含「附件 X」/「資料來源」/頁碼)
    ATTACHMENT_RE = re.compile(r"^\s*附件\s*([A-N])\s*$")
    META_LINE_RE = re.compile(r"^\s*[\(（]?資料來源|^\s*\(?\d+/\d+\)?\s*$|^[\s\d/]+$")
    PAGE_COUNT_SUFFIX_RE = re.compile(r"\s*[（(]\s*\d+\s*/\s*\d+\s*[）)]\s*$")

    attachment_titles: dict[str, str] = {}
    for _, attachment_lines in pages:
        visible_lines = [plain.strip() for plain, _, _ in attachment_lines if plain.strip()]
        for index, line in enumerate(visible_lines):
            match = ATTACHMENT_RE.match(line)
            if not match or match.group(1) in attachment_titles:
                continue
            title_parts: list[str] = []
            for candidate in visible_lines[index + 1:]:
                if ATTACHMENT_RE.match(candidate) or META_LINE_RE.match(candidate):
                    break
                title_parts.append(PAGE_COUNT_SUFFIX_RE.sub("", candidate).strip())
                if len(title_parts) == 2:
                    break
            if title_parts:
                attachment_titles[match.group(1)] = " — ".join(title_parts)

    is_app_zone = False

    for pdf_page, line_pairs in pages:
        chap = detect_chapter_for_page(pdf_page)
        is_app_zone_now = chap is None

        for plain, markdown, x0 in line_pairs:
            if not plain:
                if pending_lines and current_h1_id not in ("apx-vocab", "apx-glossary", "apx-mock-answers"):
                    flush_paragraph()
                continue

            stripped = plain.strip()

            # 附件 (A-Z) 偵測:在附錄區,「附件 X」單獨成行
            if is_app_zone_now or is_app_zone:
                m_attach = ATTACHMENT_RE.match(stripped)
                if m_attach:
                    letter = m_attach.group(1)
                    att_id = f"att-{letter}"
                    # 建立附件 H1 章節(用「附件 X」作標題即可,標題本體由 PDF 元數據決定)
                    flush_paragraph()
                    if current_h1_id in ("apx-vocab", "apx-glossary"):
                        flush_glossary()
                    if not any(c["id"] == att_id for c in chapters):
                        attachment_title = attachment_titles.get(letter, f"附件 {letter}")
                        chapters.append({
                            "id": att_id,
                            "level": 1,
                            "number": f"附件 {letter}",
                            "title": attachment_title,
                            "page": pdf_page,
                        })
                        html_parts.append(
                            f'<h1 id="{att_id}">附件 {letter} {page_badge(pdf_page)}</h1>'
                        )
                        current_h1_id = att_id
                        current_h2_id = None
                        current_h2_num = None
                    pending_lines.append((markdown, x0))
                    continue

                # 附錄 H1 標題偵測
                apx_matched = False
                for apx_title, apx_id in APPENDIX_TITLES:
                    if stripped == apx_title or stripped.startswith(apx_title):
                        if (apx_id == "apx-mock-1"
                                and any(c["id"] == "apx-mock-1" for c in chapters)
                                and pdf_page >= 220):
                            flush_paragraph()
                            pending_marker = f'<h1 id="apx-mock-answers-tmp">{esc(apx_title)}</h1>'
                            html_parts.append(pending_marker)
                            current_h1_id = "apx-mock-answers-pending"
                            apx_matched = True
                            break
                        if not any(c["id"] == apx_id for c in chapters):
                            flush_paragraph()
                            if current_h1_id in ("apx-vocab", "apx-glossary"):
                                flush_glossary()
                            chapters.append({
                                "id": apx_id,
                                "level": 1,
                                "number": "",
                                "title": apx_title,
                                "page": pdf_page,
                            })
                            html_parts.append(
                                f'<h1 id="{apx_id}">{esc(apx_title)} {page_badge(pdf_page)}</h1>'
                            )
                            current_h1_id = apx_id
                            current_h2_id = None
                            current_h2_num = None
                        apx_matched = True
                        break
                if apx_matched:
                    continue
                if current_h1_id == "apx-mock-answers-pending" and stripped == "答案":
                    for i in range(len(html_parts) - 1, -1, -1):
                        if 'id="apx-mock-answers-tmp"' in html_parts[i]:
                            html_parts[i] = re.sub(
                                r'id="apx-mock-answers-tmp"',
                                'id="apx-mock-answers"',
                                html_parts[i],
                            )
                            html_parts[i] = re.sub(
                                r'>模擬試題<', '>模擬試題答案<', html_parts[i]
                            )
                            break
                    chapters.append({
                        "id": "apx-mock-answers",
                        "level": 1,
                        "number": "",
                        "title": "模擬試題答案",
                        "page": pdf_page,
                    })
                    current_h1_id = "apx-mock-answers"
                    continue

            handled = process_line(plain, pdf_page, is_app_zone_now)
            if handled:
                continue

            is_new_para = bool(NEW_PARA_START_RE.match(plain))
            is_bullet = bool(BULLET_RE.match(plain))
            is_list_item = bool(LIST_ITEM_RE.match(plain)) and current_h1_id not in (
                "apx-vocab", "apx-glossary", "apx-mock-answers",
            )

            if (is_new_para or is_bullet or is_list_item) and pending_lines:
                if current_h1_id in ("apx-vocab", "apx-glossary", "apx-mock-answers"):
                    pass
                else:
                    flush_paragraph()
            pending_lines.append((markdown, x0))

        # 頁結束:辭彙表/術語解釋 走專用 flush
        if current_h1_id in ("apx-vocab", "apx-glossary"):
            flush_glossary()
        else:
            flush_paragraph()

    return chapters, "\n".join(html_parts)


# 卷三的 HTML 模板完全复刻卷一(同样的 mini-header + 三檔主题 dropdown + 返回首页/顶部)
def make_offline_html(title: str, version: str, chapters: list[dict], body_html: str) -> str:
    """卷三 复用卷一的 mini-header + 三档主题 dropdown 实现。"""
    return _p1_make_offline_html(title, version, chapters, body_html)


def main() -> int:
    if not os.path.exists(PDF_PATH):
        print(f"PDF not found: {PDF_PATH}")
        return 1

    print(f"opening {PDF_PATH}")
    pages = extract_pdf_pages()
    print(f"  extracted {len(pages)} pages (after page {SKIP_PAGES_BEFORE})")

    chapters, body_html = build_chapters_and_html(pages)
    print(f"  detected {len(chapters)} chapter headings")
    print(f"  body html length: {len(body_html):,} chars")

    data = {
        "slug": SLUG,
        "title": "長期保險 研習資料手冊 2022 年版",
        "version": "2022 年 8 月版",
        "chapters": chapters,
        "html": body_html,
        "pdfPageStarts": sorted(CHAPTER_START_PAGES.values()),
    }
    json_path = os.path.join(OUT_DIR, f"{SLUG}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  -> wrote {json_path}")

    offline_html = make_offline_html(data["title"], data.get("version", ""), chapters, body_html)
    html_path = os.path.join(OUT_DIR, f"{SLUG}.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(offline_html)
    print(f"  -> wrote {html_path}")

    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
