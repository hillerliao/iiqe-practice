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
    """把一段內文 HTML 切成多段 inner HTML(inline 標籤保持平衡)。

    只在總可見字數足夠長時才切,避免動到本來就短的段落。
    回傳 list,長度 1 表示不需切。
    """
    # 粗略總可見字數(標籤/實體不計)
    def total_visible(s: str) -> int:
        t = re.sub(r"</?[^>]+>", "", s)
        t = re.sub(r"&[a-zA-Z#0-9]+;", "X", t)
        return len(t)

    if total_visible(inner_html) < _PARA_TARGET:
        return [inner_html]

    chunks: list[str] = []
    cur = ""                 # 當前段累積的 HTML
    stack: list[str] = []    # 當前開著的 inline 標籤(strong/em),保持平衡
    vlen = 0                 # 當前段可見字數
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
        if ch == "&":  # HTML 實體視為 1 字
            j = inner_html.find(";", i)
            if j != -1 and j - i <= 8:
                cur += inner_html[i:j + 1]
                vlen += 1
                i = j + 1
                continue
        # 一般文字字元
        cur += ch
        vlen += 1
        do_split = False
        if ch in _PRIMARY_END and vlen >= _PARA_TARGET:
            do_split = True
        elif ch in _SOFT_END:
            # 軟斷點:下一個可見字是純接續連詞就不切,避免殘句;
            # 但若已超過絕對上限仍強制切,以免段落過長。
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


def build_chapters_and_html(pages: list[tuple[int, list[tuple[str, str]]]]) -> tuple[list[dict], str, list[int]]:
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

    def process_line(plain: str, pdf_page: int, is_mock_exam_zone: bool, page_badge: str) -> bool:
        """處理單行;回傳 True 表示已消化。plain 是純文字(給 regex)。"""
        nonlocal current_h1_id, current_h2_id, current_h2_num

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
        if m2 and not is_mock_exam_zone:
            a, b = m2.group(1), m2.group(2)
            title = m2.group(3).strip()
            # N.M 編號是強信號:即使 title 以內文起首詞開頭也視為標題
            if (current_h1_id
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
            # 辭彙表內:把這些視為「分節標題」,不觸發任何 flush(由 flush_vocab 處理)
            # 但仍 append 進 pending,讓 flush_vocab 識別為 vocab-section
            if (is_new_para or is_bullet or is_sublabel) and pending_lines:
                if current_h1_id == "apx-vocab":
                    pass  # 不 flush,留給頁結束
                else:
                    flush_paragraph()
            pending_lines.append(markdown)
        # 頁結束 → 強制 flush(辭彙表用專用,其他用通用)
        if current_h1_id == "apx-vocab":
            flush_vocab()
        else:
            flush_paragraph()

    return chapters, "\n".join(html_parts), sorted(CHAPTER_START_PAGES.values())


def make_offline_html(title: str, chapters: list[dict], body_html: str) -> str:
    """單檔離線預覽:側邊欄 + 自動/手動深色模式 + 返回頂部按鈕。0 行 JS。"""
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

    css = r"""
/* 預設淺色主題 */
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #2563eb;
  --code-bg: #f5f5f5;
  --sidebar-bg: #fafafa;
}
/* 系統偏好深色時,自動切換 */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0d0f;
    --fg: #e5e7eb;
    --muted: #9ca3af;
    --border: #374151;
    --accent: #60a5fa;
    --code-bg: #1f2937;
    --sidebar-bg: #111827;
  }
}
/* 使用者手動切換(checkbox checked):
   策略:同時用 :has() 與 sibling selector 兩種方式,
   任何一個支援都能運作(覆蓋舊瀏覽器) */
:root:has(#theme-toggle:checked) {
  --bg: #0d0d0f;
  --fg: #e5e7eb;
  --muted: #9ca3af;
  --border: #374151;
  --accent: #60a5fa;
  --code-bg: #1f2937;
  --sidebar-bg: #111827;
}
/* Fallback for 舊瀏覽器(不支援 :has()):在 body 上用 sibling selector
   當 checkbox 與 body 同輩時,無法直接 sibling 改 body 樣式
   故改用 :checked 影響後續所有兄弟元素,並用 :has() 雙保險 */
#theme-toggle:checked ~ .layout {
  --bg: #0d0d0f;
  --fg: #e5e7eb;
  --muted: #9ca3af;
  --border: #374151;
  --accent: #60a5fa;
  --code-bg: #1f2937;
  --sidebar-bg: #111827;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
  /* body 不直接套用 var(--bg),改在 .layout 與 :root 兩處都設定 */
  color: var(--fg);
  line-height: 1.7;
}
/* 隱藏 checkbox,改用 label 觸發 */
#theme-toggle { display: none; }
.theme-toggle-label {
  position: fixed; top: 14px; right: 16px; z-index: 100;
  width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 999px; background: var(--bg);
  color: var(--fg);
  cursor: pointer; user-select: none; font-size: 18px;
  transition: all 0.2s;
}
@media (max-width: 900px) {
  .theme-toggle-label { right: 16px; }
  .back-to-top { right: 16px; bottom: 16px; }
}
.theme-toggle-label:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.theme-toggle-label::after { content: "🌙"; }
:root:has(#theme-toggle:checked) .theme-toggle-label::after { content: "☀️"; }
/* 不支援 :has() 的瀏覽器:用 sibling selector 切換 label 文字(失敗也無害) */
#theme-toggle:checked ~ .theme-toggle-label::after { content: "☀️"; }
.back-to-top {
  position: fixed; bottom: 24px; right: 24px; z-index: 90;
  width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 999px; background: var(--bg);
  color: var(--fg); text-decoration: none; font-size: 18px; box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
.back-to-top:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.layout { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; background: var(--bg); }
/* Mobile:sidebar 預設隱藏,點漢堡按鈕展開;漢堡按鈕是 #menu-toggle 的 label */
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar {
    position: fixed; top: 0; left: 0;
    width: 280px; height: 100vh;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    padding-top: 70px;
    box-shadow: 2px 0 12px rgba(0,0,0,0.15);
  }
  /* 當 #menu-toggle checked,sidebar 滑入 */
  #menu-toggle:checked ~ .layout .sidebar { transform: translateX(0); }
  /* 背景遮罩(用 .layout::before 充當) */
  .layout::before {
    content: ""; position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    opacity: 0; pointer-events: none;
    transition: opacity 0.25s ease;
    z-index: 199;
  }
  #menu-toggle:checked ~ .layout::before { opacity: 1; pointer-events: auto; }
  .menu-toggle-label { display: flex; }
  .content { padding: 56px 16px 80px; }
  .content h1 { font-size: 22px; }
  .content h2 { font-size: 19px; }
  .content h3 { font-size: 17px; }
}
/* 漢堡按鈕:在 desktop 完全隱藏 */
.menu-toggle-label {
  display: none;
  position: fixed; top: 14px; left: 16px; z-index: 250;
  width: 38px; height: 38px;
  align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--fg);
  cursor: pointer; user-select: none; font-size: 20px;
  line-height: 1;
}
.menu-toggle-label:hover { background: var(--accent); color: white; border-color: var(--accent); }
#menu-toggle { display: none; }
.sidebar {
  position: sticky; top: 0; align-self: start;
  height: 100vh; overflow-y: auto;
  background: var(--sidebar-bg); border-right: 1px solid var(--border);
  padding: 64px 14px 24px 18px; font-size: 14px;
}
.sidebar h2 { margin: 0 0 12px; font-size: 16px; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li { margin: 4px 0; }
.sidebar li.lvl-1 { font-weight: 600; margin-top: 10px; }
.sidebar li.lvl-2 { padding-left: 14px; }
.sidebar li.lvl-3 { padding-left: 28px; color: var(--muted); font-size: 13px; }
.sidebar a { color: var(--fg); text-decoration: none; }
.sidebar a:hover { color: var(--accent); }
.content { padding: 64px 32px 80px; max-width: 880px; margin: 0 auto; }
.content h1, .content h2, .content h3, .content h4 {
  scroll-margin-top: 70px;
}
.content h1 { font-size: 28px; border-bottom: 2px solid var(--border); padding-bottom: 6px; margin-top: 32px; }
.content h2 { font-size: 22px; margin-top: 28px; }
.content h3 { font-size: 18px; margin-top: 22px; }
.content h4.sub7 { font-size: 16px; margin-top: 18px; color: var(--muted); }
.page-badge {
  display: inline-block; font-size: 11px; padding: 2px 6px; margin-left: 6px;
  border-radius: 4px; background: var(--code-bg); color: var(--muted);
  text-decoration: none; vertical-align: middle;
}
.content p { margin: 10px 0; }
.content ul { padding-left: 24px; }
.content hr.handbook-divider {
  border: none;
  border-top: 1px dashed var(--border);
  margin: 22px auto;
  width: 60%;
}
/* 辭彙表區塊:PDF 兩欄(英文/中文),用 CSS columns 還原 */
.vocab-block {
  column-count: 2;
  column-gap: 32px;
  column-rule: 1px solid var(--border);
  font-size: 14px;
  line-height: 1.6;
  margin: 12px 0;
}
.vocab-block strong { color: var(--accent); }
.vocab-block .vocab-section {
  display: inline-block;
  font-weight: 600;
  font-size: 15px;
  color: var(--fg);
  background: var(--code-bg);
  border-radius: 4px;
  padding: 1px 6px;
  margin-top: 6px;
}
.vocab-block .vocab-subsection {
  display: inline-block;
  font-weight: 500;
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}
@media (max-width: 900px) {
  .vocab-block { column-count: 1; }
}
"""

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<style>{css}</style>
</head>
<body>
<input type="checkbox" id="menu-toggle">
<input type="checkbox" id="theme-toggle">
<label for="menu-toggle" class="menu-toggle-label" title="開啟目錄" aria-label="開啟目錄">☰</label>
<label for="theme-toggle" class="theme-toggle-label" title="切換深色模式"></label>
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
<a href="#top" class="back-to-top" title="返回頂部">↑</a>
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

    offline_html = make_offline_html(data["title"], chapters, body_html)
    html_path = os.path.join(OUT_DIR, f"{SLUG}.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(offline_html)
    print(f"  -> wrote {html_path}")

    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
