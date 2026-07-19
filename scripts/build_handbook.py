"""
build_handbook.py — 將「保險原理及實務 研習手冊 2024.pdf」轉為
  1) public/handbook/exam1-2024.json  (供 Next.js 動態路由載入)
  2) public/handbook/exam1-2024.html  (單檔離線預覽)

章節偵測:
  H1: ^第[一二三四五六七]章\s+(.+)$           -> id="ch-N"
  H2: ^(\d+)\.(\d+)\s+(.+)$                   -> id="ch-N-M"
  H3: ^(\d+)\.(\d+)\.(\d+)\s+(.+)$            -> id="ch-N-M-K"
  H4 (sub7, p143+): ^(\d+)\.(\d+)\s+(.+)$     -> id="sub7-N-M"

執行:
  python scripts/build_handbook.py
"""
import json
import os
import re
import sys
from html import escape

import pdfplumber

try:
    from .handbook_text_utils import join_wrapped_heading, split_long_paragraph
except ImportError:
    from handbook_text_utils import join_wrapped_heading, split_long_paragraph

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(
    os.path.dirname(ROOT),
    "保險原理及實務 研習手冊 2024.pdf",
)
OUT_DIR = os.path.join(ROOT, "public", "handbook")
os.makedirs(OUT_DIR, exist_ok=True)

SLUG = "exam1-2024"

# 已知章節起始 PDF 頁碼(以 1 為起)
CHAPTER_START_PAGES = {1: 10, 2: 16, 3: 27, 4: 47, 5: 57, 6: 68, 7: 143}
# 跳過:封面(p1)、序言(p2)、目錄(p3-8)
SKIP_PAGES_BEFORE = 9

CN_DIGIT = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7}
# H1 兩種格式: "1 風險及保險" 或 "第一章 風險及保險"
H1_PLAIN_RE = re.compile(r"^([1-7])\s+([^.\d].+)$")
H1_CN_RE = re.compile(r"^第([一二三四五六七])章\s+(.+)$")
# H2/H3 容許 "5.3." 或 "5.3 " 形式(子編號後可能有句號)
H2_RE = re.compile(r"^(\d+)\.(\d+)\.?\s+(.+)$")
H3_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)\.?\s+(.+)$")

# 內文起首詞:句子常以這些詞開頭,不是真標題(用於 H1/H2/H3 防誤判)
# 注意:用兩字以上的詞,避免「如」「何」這類也常見於真標題(如「如何」是
# 標題詞,但「如」單字會誤殺「如何產生」「如何適用」這類子標題)
INLINE_BLOCKLIST_START = (
    "以下", "在於", "若要", "若是", "如同", "如果", "當作", "其他", "此種", "此等", "這是", "那是",
    "請問", "請參", "按以", "從以", "對於", "關於", "透過", "通過", "根據", "按照", "由於", "因為",
    "所以", "首先", "其次", "最後", "雖然", "該公", "該保", "本公", "本保", "還有", "也可", "都會",
    "並不", "並非", "為何", "為甚", "為什", "怎麼", "怎樣", "哪些", "哪一", "何人", "誰是",
)
# H1 標題長度限制(字元):真標題短而精簡
H1_MAX_LEN = 25
# H2/H3 標題長度限制
H2_MAX_LEN = 40
H3_MAX_LEN = 60
WRAPPED_HEADING_MAX_LEN = 140
_WRAPPED_HEADING_MARKER = "\x02"


def esc(s: str) -> str:
    """escape for HTML attribute or text"""
    return escape(s, quote=True)


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")


# ──────────────────────────────────────────────────────────────
# 格式標記 / CJK 感知的跨行合併
# 標記 token: \x01B\x01(開粗) \x01/B\x01(關粗) \x01I\x01(開斜) \x01/I\x01(關斜)
_MARKER_RE = re.compile(r"\x01/?[BI]\x01")


def _strip_markers(s: str) -> str:
    """移除格式標記,只留下可見文字(供判斷用)。"""
    return _MARKER_RE.sub("", s)


def _is_cjk(ch: str) -> bool:
    """是否為 CJK(含全角標點)。空格/控制字元回傳 False。"""
    if not ch or ch.isspace():
        return False
    return ord(ch) >= 0x2E80


def _need_space_between(prev_ch: str, next_ch: str) -> bool:
    """兩行合併處是否插入空格。

    原邏輯用 ' '.join 在每行間都插空格,造成「與 潛在損失」「一 部照相機」
    這類中文句子被無故切開。修正:只要任一側是 CJK(含全角標點)就不插空格;
    僅當兩側皆為 ASCII 文字/標點(英文)時才插空格,避免英文跨行 wrap 黏在一起。
    """
    if not prev_ch or not next_ch:
        return False
    if _is_cjk(prev_ch) or _is_cjk(next_ch):
        return False
    return True


def smart_join_markdown(lines: list[str]) -> str:
    """把多行 markdown 合併成一段,跨行 wrap 時依 CJK 規則決定是否空格。"""
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


# 裝飾性分隔線(如 'o - o - o -'、'----'、'–––')→ 轉為 <hr>
_SEP_O_RE = re.compile(r"^o([-\s–—]+o)*[-\s–—]*$", re.IGNORECASE)
_SEP_DASH_RE = re.compile(r"^[-–—=~•·*=\s]{3,}$")

# 行首的內文編號子標籤(如 '1.1.2b '),應另起一段,不要黏在上一段
SUBLABEL_RE = re.compile(r"^\d+\.\d+(\.\d+)?[a-z]?\s")


def render_paragraph(lines: list[str], is_mock_exam_zone: bool) -> str:
    """把一塊連續的非標題文字行轉為 <p>...</p> 或 <ul><li>..."""
    if not lines:
        return ""
    # 純文字合併(移除格式標記後看是否為 bullet 列表)
    plain_lines = [_strip_markers(line).strip() for line in lines]
    plain_lines = [p for p in plain_lines if p]
    if not plain_lines:
        return ""
    # 裝飾性分隔線(整段只有 'o - o - o -' 或一串 -/–/•,可能帶前導 bullet '- ')
    # → 轉為 <hr>。必須在 bullet 偵測之前,且要先去掉前導 bullet 再判斷。
    joined_md = smart_join_markdown(lines)
    joined_plain = _strip_markers(joined_md).strip()
    joined_nobullet = re.sub(r"^[•·\-\*]\s+", "", joined_plain)
    if _SEP_O_RE.match(joined_nobullet) or _SEP_DASH_RE.match(joined_nobullet):
        return '<hr class="handbook-divider">'
    # bullet 偵測:所有 plain_lines 都以 - • · 開頭
    if all(re.match(r"^[•·\-\*]\s+", p) for p in plain_lines):
        items = []
        for plain_line, line in zip(plain_lines, [l for l in lines if l.strip()]):
            # 移除開頭的 bullet 標記,保留其餘 markdown 格式
            stripped = re.sub(r"^[•·\-\*]\s+", "", line)
            items.append(f"<li>{_markdown_to_html(stripped)}</li>")
        return f"<ul>{''.join(items)}</ul>"
    # 一般段落:CJK 感知合併各行 markdown,長段落依句號自動切成多段
    inner = _markdown_to_html(joined_md)
    chunks = _split_long_paragraph(inner)
    return "".join(f"<p>{c}</p>" for c in chunks)


# 將 PDF 字型名映射為 (is_bold, is_italic)
# TimesNewRomanPS-BoldMT  → bold
# TimesNewRomanPS-ItalicMT → italic
# TimesNewRomanPS-BoldItalicMT → bold + italic
# Arial-BoldMT → bold
# BCDGEE+Wingdings 等特殊字型忽略
def _font_flags(fontname: str) -> tuple[bool, bool]:
    fn = fontname or ""
    is_bold = "Bold" in fn or "bold" in fn
    is_italic = "Italic" in fn or "italic" in fn or "Oblique" in fn
    return is_bold, is_italic


def _spans_to_html(spans: list[tuple[str, str]]) -> str:
    """將 [(text, fontname)] 序列轉為 HTML,粗體/斜體用 <strong>/<em> 包住。

    合併連續同字型的 spans,只在字型切換時插入標籤。
    """
    if not spans:
        return ""
    # 先合併連續同字型
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


def extract_pdf_pages() -> list[tuple[int, list[tuple[str, str]]]]:
    """回傳 [(pdf_page_idx(1-based), lines), ...]

    lines 是 [(plain_text, markdown_text)] 列表,行與行之間以
    `\\n\\n` 區隔(下游 `build_chapters_and_html` 會依此切段)。

    段分隔策略:
    - 同 y 差距 < LINE_GAP (2.5pt) → 同行內 wrap,合併
    - y 差距 2.5-15pt → 同一段內的不同行(原文 wrap)
    - y 差距 15-25pt → 大段空白(段與段之間的視覺空行)
    - y 差距 > 25pt → 新段(術語表詞條間距,或章節間距)
    """
    pages: list[tuple[int, list[tuple[str, str]]]] = []
    LINE_GAP = 2.5
    PARAGRAPH_GAP = 25.0  # pt:y 差距超過此值視為新段
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
            # 第一階段:把每行合併為 (plain, markdown)
            row_pairs: list[tuple[float, str, str]] = []
            for y, cs in merged:
                spans: list[tuple[str, str]] = [
                    (c["text"], c.get("fontname", "")) for c in sorted(cs, key=lambda c: c["x0"])
                ]
                plain = "".join(s[0] for s in spans).strip()
                if not plain:
                    continue
                if re.match(r"^\d+\s*/\s*\d+$", plain):
                    continue
                row_pairs.append((y, plain, _spans_to_markdown(spans)))
            # 第二階段:依 y 差距切段,用 \n\n 分隔
            if not row_pairs:
                pages.append((i, []))
                continue
            # 合併差距 < 32pt 的行為同一段(line 段),> 32pt 切段
            # (依實測:內文 wrap 行間距 15.5pt,段內空行 29.5pt,詞條間距 39-43pt,
            #  故 32pt 為安全分界 — 只切明顯的視覺空行)
            segments: list[list[tuple[str, str]]] = []
            current: list[tuple[str, str]] = []
            prev_y: float | None = None
            for y, plain, mk in row_pairs:
                if prev_y is None or (y - prev_y) <= 32.0:
                    current.append((plain, mk))
                else:
                    if current:
                        segments.append(current)
                    current = [(plain, mk)]
                prev_y = y
            if current:
                segments.append(current)
            # 把段內行用 \n 串接,段間用 \n\n 標記 → 簡化:回傳 (plain_per_line, md_per_line)
            # 但 build_chapters_and_html 用空行切段,需要 text 字串格式
            # 改:把每行視為獨立 line_pair,加一個空 pair 標記段邊界
            line_pairs: list[tuple[str, str]] = []
            for seg in segments:
                for plain, mk in seg:
                    line_pairs.append((plain, mk))
                # 段結尾加一個空 pair(空白 plain,空 markdown)作為「段分隔」標記
                if seg is not segments[-1]:
                    line_pairs.append(("", ""))
            pages.append((i, line_pairs))
    return pages


def _spans_to_markdown(spans: list[tuple[str, str]]) -> str:
    """將 spans 編碼為內部格式:用 \x01 作為格式標記分隔符。

    文字先 escape(避免 < > & 影響 HTML),然後包進 \x01B\x01...\x01/B\x01
    (粗體) 或 \x01I\x01...\x01/I\x01 (斜體)。esc 過的文字在 markdown→html
    階段不會再被 esc 一次。
    """
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
    """純文字版(忽略粗體/斜體),供章節標題偵測使用。"""
    return esc("".join(s[0] for s in spans))


def _markdown_to_html(s: str) -> str:
    """將 \x01B\x01...\x01/B\x01 與 \x01I\x01...\x01/I\x01 標記轉為 HTML。"""
    # bold 內嵌 italic 不會出現(手冊內文粗體內無斜體)
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
    # 清除空標籤(如跨行 wrap 產生的 <strong> </strong> / <em></em>)
    s2 = re.sub(r"<strong>\s*</strong>", "", s2)
    s2 = re.sub(r"<em>\s*</em>", "", s2)
    # 移除兩個 CJK 字之間的空格(PDF 常有「可保權 益」這類斷詞空格)。
    # 不影響 CJK 與標點/拉丁字之間的空格。標題不走這條路徑,故安全。
    s2 = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", s2)
    return s2


# ── 長段落自動斷句 ──────────────────────────────────────────────
# PDF 常把整段說明(如 7.4.7a 引言)抽成一整塊文字,渲染後變成一個超長 <p>,
# 擠在一起難以閱讀。這裡依句末標點把長 <p> 切成數個較短 <p>,並在極長的
# 單句內用 ; ： 再切。切點會保持 <strong>/<em> 等 inline 標籤平衡。
_PRIMARY_END = "。！？!?."   # 句末強斷點
_SOFT_END = "；;：:"          # 句內軟斷點(目前段已夠長才切)
_PARA_TARGET = 130           # 累積到這個可見字數才允許在強斷點切
_PARA_SOFT_MIN = 220         # 累積到這個字數才允許在軟斷點切
_PARA_HARD = 420             # 單段絕對上限,超過無論如何都在軟斷點切
# 純接續連詞:絕不會出現在句首,若在軟斷點緊接其後,表示這是句子內部延續,
# 不應在此切開(否則會產生「及(v) ...」「的保險機構...」這類殘句段落)。
_SOFT_BAD_LEAD = "的而及或並且亦也仍則與"


def _previous_visible_char(s: str, from_idx: int) -> str:
    """從 from_idx 之前找第一個可見文字字元(跳過標籤/實體/空白)。"""
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
    """從 from_idx 之後找第一個可見文字字元(跳過標籤/實體/空白)。"""
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
    """把一段內文 HTML 切成多段 inner HTML(inline 標籤保持平衡)。"""
    return split_long_paragraph(
        inner_html,
        primary_end=_PRIMARY_END,
        soft_end=_SOFT_END,
        target=_PARA_TARGET,
        soft_min=_PARA_SOFT_MIN,
        hard_limit=_PARA_HARD,
        soft_bad_lead=_SOFT_BAD_LEAD,
    )


def detect_chapter_for_page(pdf_page: int) -> int | None:
    """給定 PDF 頁碼,回傳其屬於第幾章(1-7),或 None 表示在已知章節外。

    為了支援 p.171+ 的術語表/辭彙表/模擬試題/鳴謝,這些頁面也視為合法範圍:
    - p.143-172 屬第 7 章
    - p.173+ 也回傳 7(實際章節,內容會被當作附錄處理)
    """
    chap = None
    for n, start in CHAPTER_START_PAGES.items():
        if pdf_page >= start:
            chap = n
        else:
            break
    if chap is not None:
        return chap
    # p.171+ 附錄也屬於「合法範圍」,用 7 代理,後續 build_chapters_and_html
    # 會依內容判斷是附錄段(術語解釋、辭彙表、模擬試題答案、鳴謝)
    if pdf_page >= 171:
        return 7
    return None


def _is_structural_line(text: str) -> bool:
    stripped = text.strip()
    return bool(
        H1_CN_RE.match(stripped)
        or H1_PLAIN_RE.match(stripped)
        or H2_RE.match(stripped)
        or H3_RE.match(stripped)
        or SUBLABEL_RE.match(stripped)
        or re.match(
            r"^(?:[•·\-*]\s+|\([a-z]\)|\([ivx]+\)|\(\d+\)|"
            r"[一二三四五六七八九十]+[、.]|\d+\s+[一-鿿])",
            stripped,
        )
    )


def _merge_wrapped_heading_lines(
    pages: list[tuple[int, list[tuple[str, str]]]],
) -> list[tuple[int, list[tuple[str, str]]]]:
    merged_pages: list[tuple[int, list[tuple[str, str]]]] = []
    for pdf_page, lines in pages:
        merged_lines: list[tuple[str, str]] = []
        index = 0
        while index < len(lines):
            plain, markdown = lines[index]
            match = H3_RE.match(plain) or H2_RE.match(plain)
            next_plain = lines[index + 1][0] if index + 1 < len(lines) else None
            if match:
                title = match.group(match.lastindex or 0).strip()
                joined = join_wrapped_heading(
                    title,
                    next_plain,
                    is_blocked=_is_structural_line,
                )
                if joined is not None:
                    prefix = plain[:match.start(match.lastindex or 0)]
                    merged_lines.append((_WRAPPED_HEADING_MARKER + prefix + joined, markdown))
                    index += 2
                    continue
            merged_lines.append((plain, markdown))
            index += 1
        merged_pages.append((pdf_page, merged_lines))
    return merged_pages


def _carry_pages(pages: list[tuple[int, list[tuple[str, str]]]]) -> set[int]:
    result: set[int] = set()
    for (pdf_page, lines), (next_page, next_lines) in zip(pages, pages[1:]):
        if next_page != pdf_page + 1 or next_page in CHAPTER_START_PAGES.values():
            continue
        if pdf_page >= 173:
            continue
        current_visible = [plain.strip() for plain, _ in lines if plain.strip()]
        next_visible = [plain.strip() for plain, _ in next_lines if plain.strip()]
        if not current_visible or not next_visible:
            continue
        last_line = current_visible[-1]
        first_next = next_visible[0]
        if last_line.endswith(("。", "！", "？", "!", "?")):
            continue
        if _is_structural_line(first_next):
            continue
        result.add(pdf_page)
    return result


def build_chapters_and_html(pages: list[tuple[int, list[tuple[str, str]]]]) -> tuple[list[dict], str, list[int]]:
    pages = _merge_wrapped_heading_lines(pages)
    carry_pages = _carry_pages(pages)
    chapters: list[dict] = []
    html_parts: list[str] = []
    pdf_pages_seen: set[int] = set()

    current_h1_id: str | None = None
    current_h2_id: str | None = None
    current_h2_num: str | None = None
    # pending_lines 存 markdown 編碼行(含格式標記)
    pending_lines: list[str] = []

    def flush_paragraph():
        nonlocal pending_lines
        if pending_lines:
            is_sub7 = current_h1_id == "ch-7" and current_h2_id is None
            html_parts.append(render_paragraph(pending_lines, is_sub7))
            pending_lines = []

    def flush_vocab():
        """辭彙表專用 flush:把累積的行用 CSS 兩欄排版呈現。"""
        nonlocal pending_lines
        if not pending_lines:
            return
        # 分節標題偵測:整行只含 (一)(1)甲 等(可能後接章節編號)
        # 還有「[按漢字筆劃排序]」「[按英文字母排序]」等次標題
        SECTION_RE = re.compile(
            r"^\s*(\([一二三四五六七八九]+\)|\(\d+\)|"
            r"[甲乙丙丁戊己庚辛壬癸])\s*(\d+\.\d+[a-z]?(?:\([a-z](?:\([ivx]+\))?\))?)?\s*$"
        )
        SUBSECTION_RE = re.compile(r"^\s*\[[^\]]+\]\s*$")
        items: list[str] = []
        for line in pending_lines:
            plain = re.sub(r"\x01[BI]\x01|[\x01/B\x01|\x01/I\x01]", "", line).strip()
            if not plain:
                continue
            if SECTION_RE.match(plain):
                # 分節標題
                items.append(f'<span class="vocab-section">{_markdown_to_html(plain)}</span>')
            elif SUBSECTION_RE.match(plain):
                # 次標題(如 [按漢字筆劃排序])
                items.append(f'<span class="vocab-subsection">{_markdown_to_html(plain)}</span>')
            else:
                items.append(_markdown_to_html(plain))
        if items:
            html_parts.append(
                f'<div class="vocab-block">{"<br/>".join(items)}</div>'
            )
        pending_lines = []

    NEW_PARA_START_RE = re.compile(
        r"^(\([a-z]\)|\([ivx]+\)|\(\d+\)|註[:：]|"
        r"[一二三四五六七八九十]+[、.]|"
        r"\d+\s+[一-鿿])"
    )
    BULLET_RE = re.compile(r"^[•·\-\*]\s+")
    BULLET_LINE_RE = re.compile(r"^\s*[•·\-\*]\s+\S")
    # 列舉項 a. / b. / c. …:PDF 中每項常獨立成行,但 build script 把它們
    # 跟上一段合併成同一個 <p>。在行首偵測 [a-h]\. + 空白 + CJK 字元
    # 來當作新段切點;排除 e.g./i.e. 等英文縮寫(它們後面還有 .)、
    # 以及 glossary 詞條(由 flush_vocab 處理)。
    LIST_ITEM_RE = re.compile(r"^[a-h]\.\s+[一-鿿]")

    def process_line(plain: str, pdf_page: int, is_mock_exam_zone: bool, page_badge: str) -> bool:
        """處理單行;回傳 True 表示已消化。plain 是純文字(給 regex)。"""
        nonlocal current_h1_id, current_h2_id, current_h2_num
        is_wrapped_heading = plain.startswith(_WRAPPED_HEADING_MARKER)
        if is_wrapped_heading:
            plain = plain.removeprefix(_WRAPPED_HEADING_MARKER)

        if not is_mock_exam_zone:
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
                                f'<h1 id="{h1_id}">{esc(number)} {esc(title)} {page_badge}</h1>'
                            )
                            current_h1_id = h1_id
                            current_h2_id = None
                            current_h2_num = None
                            return True

        m3 = H3_RE.match(plain)
        if m3 and not is_mock_exam_zone:
            a, b, c = m3.group(1), m3.group(2), m3.group(3)
            title = m3.group(4).strip()
            # N.M.K 編號是強信號:即使 title 以「如/如果/關」開頭也視為標題
            if (current_h1_id
                    and int(a) == int(current_h1_id.split("-")[1])
                    and len(title) <= (WRAPPED_HEADING_MAX_LEN if is_wrapped_heading else H3_MAX_LEN)):
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
        if m2 and not is_mock_exam_zone:
            a, b = m2.group(1), m2.group(2)
            title = m2.group(3).strip()
            # N.M 編號是強信號:即使 title 以內文起首詞開頭也視為標題
            if (current_h1_id
                    and int(a) == int(current_h1_id.split("-")[1])
                    and len(title) <= (WRAPPED_HEADING_MAX_LEN if is_wrapped_heading else H2_MAX_LEN)):
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
                        f'<h2 id="{h2_id}">{esc(h2_num)} {esc(title)} {page_badge}</h2>'
                    )
                    current_h2_id = h2_id
                    current_h2_num = h2_num
                    return True
        return False

    # 附錄 H1 標題偵測:在 p.173+ 的「模擬試題」「術語解釋」「辭彙表」
    # 「模擬試題答案」「鳴謝」等獨立段落標題
    # 用 startswith 因為 p.212 把「模擬試題答案」拆成「模擬試題」+「答案」兩行
    # 注意:較長的字串放前面(「模擬試題答案」要在「模擬試題」前),
    # 否則「模擬試題答案」會被「模擬試題」先匹配掉
    APPENDIX_TITLES = [
        ("模擬試題答案", "apx-mock-answers"),
        ("模擬試題", "apx-mock-1"),
        ("術語解釋", "apx-glossary"),
        ("辭彙表", "apx-vocab"),
        ("鳴謝", "apx-ack"),
    ]

    for pdf_page, line_pairs in pages:
        chap = detect_chapter_for_page(pdf_page)
        if chap is None:
            continue
        is_mock_exam_zone = (pdf_page >= 173)
        page_badge = f'<a class="page-badge" id="pdf-page-{pdf_page}" href="#pdf-page-{pdf_page}">PDF p.{pdf_page}</a>'
        if pdf_page not in pdf_pages_seen:
            pdf_pages_seen.add(pdf_page)

        # 逐行處理:plain 給 regex,markdown 進 pending
        for plain, markdown in line_pairs:
            if not plain:
                # 空 pair = extract 偵測到的段分隔邊界 → flush 上一段
                # 但辭彙表內空 pair 是詞條間距,不應切段
                if pending_lines and current_h1_id != "apx-vocab":
                    flush_paragraph()
                continue
            # 附錄 H1 標題偵測
            if pdf_page >= 173:
                stripped = plain.strip()
                apx_matched = False
                for apx_title, apx_id in APPENDIX_TITLES:
                    if stripped == apx_title or stripped.startswith(apx_title):
                        # 「模擬試題」+「答案」合併邏輯:
                        # 當 p.212 出現「模擬試題」(此時 apx-mock-1 已存在),
                        # 仍建立 apx-mock-answers 章節,並把 html 標籤用 apx-mock-answers
                        if (apx_id == "apx-mock-1"
                                and any(c["id"] == "apx-mock-1" for c in chapters)
                                and pdf_page >= 200):
                            # 這個「模擬試題」是 p.212 的「模擬試題答案」標題的第一行
                            # 延後到「答案」行時再一起建立
                            # 先輸出一個「(暫存)」標記,後面合併時改寫
                            flush_paragraph()
                            pending_marker = f'<h1 id="apx-mock-answers-tmp">{esc(apx_title)} {page_badge}</h1>'
                            html_parts.append(pending_marker)
                            current_h1_id = "apx-mock-answers-pending"
                            apx_matched = True
                            break
                        if not any(c["id"] == apx_id for c in chapters):
                            flush_paragraph()
                            chapters.append({
                                "id": apx_id,
                                "level": 1,
                                "number": apx_title,
                                "title": apx_title,
                                "page": pdf_page,
                            })
                            html_parts.append(
                                f'<h1 id="{apx_id}">{esc(apx_title)} {page_badge}</h1>'
                            )
                            current_h1_id = apx_id
                            current_h2_id = None
                            current_h2_num = None
                        apx_matched = True
                        break
                if apx_matched:
                    continue
                # 「答案」緊接「模擬試題」(current_h1_id == "apx-mock-answers-pending")
                if current_h1_id == "apx-mock-answers-pending" and stripped == "答案":
                    # 改寫剛剛的 tmp h1
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
                        "number": "模擬試題答案",
                        "title": "模擬試題答案",
                        "page": pdf_page,
                    })
                    current_h1_id = "apx-mock-answers"
                    continue
            handled = process_line(plain, pdf_page, is_mock_exam_zone, page_badge)
            if handled:
                continue
            is_new_para = bool(NEW_PARA_START_RE.match(plain))
            is_bullet = bool(BULLET_RE.match(plain))
            is_sublabel = bool(SUBLABEL_RE.match(plain)) if current_h1_id != "apx-vocab" else False
            is_list_item = bool(LIST_ITEM_RE.match(plain)) and current_h1_id != "apx-vocab"
            # 辭彙表內:把這些視為「分節標題」,不觸發任何 flush(由 flush_vocab 處理)
            # 但仍 append 進 pending,讓 flush_vocab 識別為 vocab-section
            if (is_new_para or is_bullet or is_sublabel or is_list_item) and pending_lines:
                if current_h1_id == "apx-vocab":
                    pass  # 不 flush,留給頁結束
                else:
                    flush_paragraph()
            pending_lines.append(markdown)
        # 頁結束:只有語意段落確實終止時才 flush；跨頁續行保留整個 pending buffer。
        if pdf_page in carry_pages:
            continue
        if current_h1_id == "apx-vocab":
            flush_vocab()
        else:
            flush_paragraph()

    if current_h1_id == "apx-vocab":
        flush_vocab()
    else:
        flush_paragraph()

    return chapters, "\n".join(html_parts), sorted(CHAPTER_START_PAGES.values())


def make_offline_html(title: str, version: str, chapters: list[dict], body_html: str) -> str:
    """單檔離線預覽 — 「迷你主站」風格:

    ┌─ sticky 半透明 header (top-0, h-14) ─────────────────────────────────┐
    │ [書本] IIQE 做题家  │ 研習手冊: <標題> │ ☰ 目錄  ☀ 主題  ↗ 返回首頁 │
    └──────────────────────────────────────────────────────────────────────┘
    │ 280px sidebar (目錄)              │ 內文內容              [↑ 顶部]│
    └──────────────────────────────────────────────────────────────────────┘

    - 主題:三檔 dropdown(淺/深/跟隨),跟主站 ThemeToggle 視覺一致
    - 返回首頁:logo 與 header 右側 ↗ 都連到 /(與主站 logo 行為一致)
    - 返回頂部:右下方圓形按鈕,捲動後出現,rounded-full 對齊主站風格
    - 配色用 CSS variables,值與 globals.css 的 oklch 同步
    """
    nav_items: list[str] = []
    for ch in chapters:
        lvl = ch["level"]
        if lvl == 1:
            nav_items.append(
                f'<li class="lvl-1"><a href="#{ch["id"]}">{esc(ch["number"])} {esc(ch["title"])}</a></li>'
            )
        elif lvl == 2:
            nav_items.append(
                f'<li class="lvl-2"><a href="#{ch["id"]}">{esc(ch["number"])} {esc(ch["title"])}</a></li>'
            )
        elif lvl == 3:
            nav_items.append(
                f'<li class="lvl-3"><a href="#{ch["id"]}">{esc(ch["number"])} {esc(ch["title"])}</a></li>'
            )
    nav_html = "\n".join(nav_items)
    version_badge = f' <span class="version-badge">{esc(version)}</span>' if version else ""

    css = r"""
/* =========================================================================
   預設淺色 (與 globals.css :root 同步;獨立 HTML 用 hex 表達)
   ========================================================================= */
:root {
  --background: #ffffff;
  --foreground: #1a1a1a;
  --popover: #ffffff;
  --popover-foreground: #1a1a1a;
  --primary: #1a1a1a;
  --primary-foreground: #fafafa;
  --secondary: #f5f5f5;
  --secondary-foreground: #1a1a1a;
  --muted: #f5f5f5;
  --muted-foreground: #6b7280;
  --accent: #f5f5f5;
  --accent-foreground: #1a1a1a;
  --border: #e5e7eb;
  --ring: #9ca3af;
  --sidebar: #fafafa;
  --sidebar-foreground: #1a1a1a;
  --code-bg: #f3f4f6;
}
/* 系統偏好深色 + 腳本 fallback */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: #1c1c1e;
    --foreground: #e5e7eb;
    --popover: #2a2a2c;
    --popover-foreground: #e5e7eb;
    --primary: #e5e7eb;
    --primary-foreground: #1c1c1e;
    --secondary: #2a2a2c;
    --secondary-foreground: #e5e7eb;
    --muted: #2a2a2c;
    --muted-foreground: #9ca3af;
    --accent: #2a2a2c;
    --accent-foreground: #e5e7eb;
    --border: #3a3a3c;
    --ring: #6b7280;
    --sidebar: #1f1f21;
    --sidebar-foreground: #e5e7eb;
    --code-bg: #2a2a2c;
  }
}
/* 腳本加上 .dark 類別時強制深色 */
:root.dark {
  --background: #1c1c1e;
  --foreground: #e5e7eb;
  --popover: #2a2a2c;
  --popover-foreground: #e5e7eb;
  --primary: #e5e7eb;
  --primary-foreground: #1c1c1e;
  --secondary: #2a2a2c;
  --secondary-foreground: #e5e7eb;
  --muted: #2a2a2c;
  --muted-foreground: #9ca3af;
  --accent: #2a2a2c;
  --accent-foreground: #e5e7eb;
  --border: #3a3a3c;
  --ring: #6b7280;
  --sidebar: #1f1f21;
  --sidebar-foreground: #e5e7eb;
  --code-bg: #2a2a2c;
}
/* 腳本加上 .light 類別時強制淺色 */
:root.light {
  --background: #ffffff;
  --foreground: #1a1a1a;
  --popover: #ffffff;
  --popover-foreground: #1a1a1a;
  --primary: #1a1a1a;
  --primary-foreground: #fafafa;
  --secondary: #f5f5f5;
  --secondary-foreground: #1a1a1a;
  --muted: #f5f5f5;
  --muted-foreground: #6b7280;
  --accent: #f5f5f5;
  --accent-foreground: #1a1a1a;
  --border: #e5e7eb;
  --ring: #9ca3af;
  --sidebar: #fafafa;
  --sidebar-foreground: #1a1a1a;
  --code-bg: #f3f4f6;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
  background: var(--background);
  color: var(--foreground);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

/* =========================================================================
   sticky header — 主站風格(border-b, backdrop-blur, h-14)
   ========================================================================= */
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 56px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--background) 80%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  padding: 0 20px;
}
.app-header-inner {
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 24px;
}
.app-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  color: var(--foreground);
  text-decoration: none;
  flex-shrink: 0;
}
.app-logo svg { width: 20px; height: 20px; }
.app-title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  color: var(--muted-foreground);
  flex: 1;
  min-width: 0;
}
.app-title b {
  color: var(--foreground);
  font-weight: 600;
}
.version-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--muted);
  color: var(--muted-foreground);
  font-weight: 500;
}
.app-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  text-decoration: none;
  transition: all 0.15s;
}
.icon-btn:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.icon-btn svg { width: 16px; height: 16px; }

/* 主題 dropdown(對齊主站 ThemeToggle 視覺)
   - 預設關閉,按按鈕打開
   - 三檔:淺色 / 深色 / 跟隨系統
   - 鍵盤 Esc / 點外面 / 選了項自動關閉
   - 視覺與主站 min-w-56,rounded-lg,ring-1 一致 */
.theme-dropdown {
  position: relative;
}
.theme-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 224px;
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.15), 0 4px 6px -2px rgb(0 0 0 / 0.05);
  display: none;
  z-index: 110;
}
.theme-menu.open { display: block; }
.theme-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--popover-foreground);
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}
.theme-option:hover,
.theme-option:focus-visible {
  background: var(--accent);
  color: var(--accent-foreground);
  outline: none;
}
.theme-option[data-active="true"] {
  background: var(--muted);
  color: var(--foreground);
}
.theme-option svg {
  width: 16px; height: 16px;
  margin-top: 2px;
  flex-shrink: 0;
  color: var(--muted-foreground);
}
.theme-option[data-active="true"] svg { color: var(--primary); }
.theme-option-text { flex: 1; min-width: 0; }
.theme-option-label {
  display: block;
  font-weight: 500;
  line-height: 1.3;
}
.theme-option-desc {
  display: block;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.3;
  margin-top: 2px;
}
.theme-option-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--primary);
  margin-top: 8px;
  flex-shrink: 0;
}

/* =========================================================================
   Layout: sidebar + content
   ========================================================================= */
.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: calc(100vh - 56px);
}
.sidebar {
  background: var(--sidebar);
  color: var(--sidebar-foreground);
  border-right: 1px solid var(--border);
  padding: 24px 14px 24px 18px;
  font-size: 14px;
  position: sticky;
  top: 56px;
  height: calc(100vh - 56px);
  overflow-y: auto;
}
.sidebar h2 {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li { margin: 4px 0; }
.sidebar li.lvl-1 { font-weight: 600; margin-top: 12px; }
.sidebar li.lvl-2 { padding-left: 14px; font-weight: 500; }
.sidebar li.lvl-3 { padding-left: 28px; color: var(--muted-foreground); font-size: 13px; }
.sidebar a {
  color: var(--foreground);
  text-decoration: none;
  display: block;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}
.sidebar a:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}
.content {
  padding: 32px 40px 96px;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}
.content h1, .content h2, .content h3, .content h4 {
  scroll-margin-top: 80px;
}
.content h1 {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.3;
  color: #1e3a8a;
  margin: 48px 0 24px;
  padding-bottom: 12px;
  border-bottom: 3px solid #93c5fd;
}
:root.dark .content h1 { color: #93c5fd; border-bottom-color: #1e40af; }
.content h2 {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.35;
  color: #1e40af;
  margin: 36px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #dbeafe;
}
:root.dark .content h2 { color: #93c5fd; border-bottom-color: #1e3a8a; }
.content h3 {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: #1e3a8a;
  margin: 28px 0 12px;
}
:root.dark .content h3 { color: #bfdbfe; }
.content h4 {
  font-size: 18px;
  font-weight: 600;
  color: #374151;
  margin: 22px 0 10px;
}
:root.dark .content h4 { color: #d1d5db; }
.content p { margin: 0 0 14px; font-size: 16px; }
.content .handbook-indent-1 { text-indent: 2em; }
.content .handbook-indent-2 { text-indent: 4em; }
.content .handbook-indent-3 { text-indent: 6em; }
/* a. / b. / c. 列舉項:相對於父級 (ii)/(iii) 再往右推 2em,顯示子層級。
   同時覆寫 text-indent 並用 padding-left 處理 wrap 續行的對齊。 */
.content p.handbook-list-item {
  text-indent: 0;
  padding-left: 8em;
}
.content ul, .content ol { margin: 12px 0 14px; padding-left: 28px; }
.content li { margin-bottom: 6px; }
.page-badge {
  display: inline-block;
  font-size: 12px;
  padding: 3px 8px;
  margin-left: 10px;
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--muted-foreground);
  text-decoration: none;
  vertical-align: middle;
  font-weight: 500;
}
.content hr.handbook-divider {
  border: none;
  border-top: 1px dashed var(--border);
  margin: 22px auto;
  width: 60%;
}
.vocab-block {
  column-count: 2;
  column-gap: 32px;
  column-rule: 1px solid var(--border);
  font-size: 14px;
  line-height: 1.6;
  margin: 12px 0;
}
.vocab-block p { margin: 6px 0; font-size: 14px; line-height: 1.6; }
.vocab-block strong { color: #2563eb; }
:root.dark .vocab-block strong { color: #60a5fa; }
.vocab-block .vocab-section {
  display: inline-block;
  font-weight: 600;
  font-size: 15px;
  background: var(--muted);
  color: var(--foreground);
  border-radius: 4px;
  padding: 1px 6px;
  margin-top: 6px;
}
.vocab-block .vocab-subsection {
  display: inline-block;
  font-weight: 500;
  color: var(--muted-foreground);
  font-size: 13px;
  margin-top: 4px;
}

/* =========================================================================
   返回頂部按鈕(rounded-full, 右下角固定,捲動後出現)
   ========================================================================= */
.back-to-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px);
  transition: all 0.2s;
}
.back-to-top[data-visible="true"] {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.back-to-top:hover {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
.back-to-top svg { width: 18px; height: 18px; }

/* =========================================================================
   移動端 (< 768px)
   ========================================================================= */
@media (max-width: 768px) {
  .app-header { padding: 0 12px; }
  .app-header-inner { gap: 12px; }
  .app-title { display: none; }
  .layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: fixed;
    top: 56px;
    left: 0;
    width: 280px;
    height: calc(100vh - 56px);
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: 2px 0 12px rgba(0,0,0,0.15);
  }
  .layout.menu-open .sidebar { transform: translateX(0); }
  .layout::before {
    content: "";
    position: fixed;
    top: 56px;
    left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
    z-index: 199;
  }
  .layout.menu-open::before {
    opacity: 1;
    pointer-events: auto;
  }
  .content { padding: 24px 16px 80px; }
  .content h1 { font-size: 24px; }
  .content h2 { font-size: 20px; }
  .content h3 { font-size: 18px; }
  .content .handbook-indent-1 { text-indent: 2em; }
  .content .handbook-indent-2 { text-indent: 4em; }
  .content .handbook-indent-3 { text-indent: 6em; }
  .content p.handbook-list-item { text-indent: 0; padding-left: 8em; }
  .vocab-block { column-count: 1; }
  .back-to-top { right: 16px; bottom: 16px; }
}
"""

    # FOUC 防护 + 主题持久化(三檔 light/dark/system,跟主站 key 一致)
    init_script = r"""
(function() {
  try {
    var stored = localStorage.getItem('iiqe:theme');
    var mode = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = (mode === 'system') ? (systemDark ? 'dark' : 'light') : mode;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.classList.toggle('light', resolved === 'light');
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
"""

    # 主題 dropdown 切換 + 後頂部按鈕顯示 + sidebar 切換 — 全部 inline JS
    runtime_script = r"""
(function() {
  var THEME_KEY = 'iiqe:theme';
  var VALID = ['light', 'dark', 'system'];

  function resolve(mode) {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  }

  function applyTheme(mode) {
    var r = resolve(mode);
    document.documentElement.classList.toggle('dark', r === 'dark');
    document.documentElement.classList.toggle('light', r === 'light');
    document.documentElement.style.colorScheme = r;
  }

  // 主題 dropdown
  var themeBtn = document.getElementById('theme-btn');
  var themeMenu = document.getElementById('theme-menu');
  if (themeBtn && themeMenu) {
    var stored = localStorage.getItem(THEME_KEY);
    var currentMode = VALID.indexOf(stored) >= 0 ? stored : 'system';
    var options = themeMenu.querySelectorAll('.theme-option');
    options.forEach(function(opt) {
      opt.setAttribute('data-active', String(opt.getAttribute('data-value') === currentMode));
    });
    themeBtn.setAttribute('aria-expanded', 'false');
    themeMenu.setAttribute('role', 'menu');

    themeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = themeMenu.classList.toggle('open');
      themeBtn.setAttribute('aria-expanded', String(isOpen));
    });
    themeMenu.addEventListener('click', function(e) {
      var opt = e.target.closest('.theme-option');
      if (!opt) return;
      var value = opt.getAttribute('data-value');
      if (VALID.indexOf(value) < 0) return;
      try { localStorage.setItem(THEME_KEY, value); } catch (_) {}
      applyTheme(value);
      options.forEach(function(o) {
        o.setAttribute('data-active', String(o.getAttribute('data-value') === value));
      });
      themeMenu.classList.remove('open');
      themeBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', function(e) {
      if (!themeMenu.classList.contains('open')) return;
      if (themeMenu.contains(e.target) || themeBtn.contains(e.target)) return;
      themeMenu.classList.remove('open');
      themeBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && themeMenu.classList.contains('open')) {
        themeMenu.classList.remove('open');
        themeBtn.setAttribute('aria-expanded', 'false');
        themeBtn.focus();
      }
    });
    // 跟隨系統時,即時響應 prefers-color-scheme 變化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      var m = localStorage.getItem(THEME_KEY);
      if (m === 'system' || !m || VALID.indexOf(m) < 0) applyTheme('system');
    });
  }

  // 目錄切換(移動端)
  var menuToggle = document.getElementById('menu-toggle');
  var layout = document.querySelector('.layout');
  if (menuToggle && layout) {
    menuToggle.addEventListener('click', function() {
      layout.classList.toggle('menu-open');
    });
    layout.addEventListener('click', function(e) {
      if (window.innerWidth > 768) return;
      if (e.target === layout || (e.target.classList && e.target.classList.contains('content'))) {
        layout.classList.remove('menu-open');
      }
    });
  }

  // 返回頂部(顯示/隱藏 + 平滑捲動)
  var backBtn = document.getElementById('back-to-top');
  if (backBtn) {
    function update() {
      if (window.scrollY > 300) {
        backBtn.setAttribute('data-visible', 'true');
      } else {
        backBtn.setAttribute('data-visible', 'false');
      }
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
    backBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
"""

    # SVG 圖示(避免依賴 icon library)
    icons = {
        "book": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        "menu": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>',
        "sun": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        "moon": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
        "monitor": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
        "external": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
        "arrowUp": '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>',
    }

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<script>{init_script}</script>
<style>{css}</style>
</head>
<body>
<header class="app-header">
  <div class="app-header-inner">
    <a href="/" class="app-logo" title="返回首頁">
      {icons["book"]}
      <span>IIQE 做题家</span>
    </a>
    <span class="app-title">
      研習手冊：<b>{esc(title)}</b>{version_badge}
    </span>
    <div class="app-actions">
      <button type="button" id="menu-toggle" class="icon-btn" aria-label="開啟目錄" title="目錄">
        {icons["menu"]}
      </button>
      <div class="theme-dropdown">
        <button type="button" id="theme-btn" class="icon-btn" aria-haspopup="menu" aria-label="切換主題" title="主題">
          {icons["sun"]}
        </button>
        <div class="theme-menu" id="theme-menu">
          <button type="button" class="theme-option" data-value="light" role="menuitemradio">
            {icons["sun"]}
            <span class="theme-option-text">
              <span class="theme-option-label">淺色</span>
              <span class="theme-option-desc">固定使用淺色模式</span>
            </span>
            <span class="theme-option-dot" aria-hidden="true"></span>
          </button>
          <button type="button" class="theme-option" data-value="dark" role="menuitemradio">
            {icons["moon"]}
            <span class="theme-option-text">
              <span class="theme-option-label">深色</span>
              <span class="theme-option-desc">固定使用深色模式</span>
            </span>
            <span class="theme-option-dot" aria-hidden="true"></span>
          </button>
          <button type="button" class="theme-option" data-value="system" role="menuitemradio">
            {icons["monitor"]}
            <span class="theme-option-text">
              <span class="theme-option-label">跟隨系統</span>
              <span class="theme-option-desc">依作業系統設定自動切換</span>
            </span>
            <span class="theme-option-dot" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <a href="/" class="icon-btn" aria-label="返回首頁" title="返回首頁">
        {icons["external"]}
      </a>
    </div>
  </div>
</header>
<div class="layout" id="top">
  <aside class="sidebar">
    <h2>目錄</h2>
    <nav><ul>
{nav_html}
    </ul></nav>
  </aside>
  <main class="content">
{body_html}
  </main>
</div>
<button type="button" id="back-to-top" class="back-to-top" aria-label="返回頂部" title="返回頂部">
  {icons["arrowUp"]}
</button>
<script>{runtime_script}</script>
</body>
</html>
"""


def main() -> int:
    if not os.path.exists(PDF_PATH):
        print(f"PDF not found: {PDF_PATH}")
        return 1

    print(f"opening {PDF_PATH}")
    pages = extract_pdf_pages()
    print(f"  extracted {len(pages)} pages (after page {SKIP_PAGES_BEFORE})")

    chapters, body_html, pdf_starts = build_chapters_and_html(pages)
    print(f"  detected {len(chapters)} chapter headings")
    print(f"  body html length: {len(body_html):,} chars")

    data = {
        "slug": SLUG,
        "title": "保險原理及實務 研習手冊 2024",
        "version": "第八版 2024 年 11 月",
        "chapters": chapters,
        "html": body_html,
        "pdfPageStarts": pdf_starts,
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
