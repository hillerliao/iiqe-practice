import re
from collections.abc import Callable


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
    while i < len(s):
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


def _is_non_sentence_period(s: str, index: int, prev: str, nxt: str) -> bool:
    if prev == "." or nxt == ".":
        return True
    if prev.isdigit() and nxt.isdigit():
        return True

    prefix = re.sub(r"<[^>]+>", "", s[max(0, index - 100):index])
    if prev.isascii() and prev in "abcdefgh" and s[index + 1:index + 2].isspace():
        return True
    return bool(
        nxt
        and nxt.isascii()
        and (nxt.isalnum() or nxt in "/_-#")
        and re.search(r"(?:https?://|www\.)[^\s]*$", prefix, re.IGNORECASE)
    )


def split_long_paragraph(
    inner_html: str,
    *,
    primary_end: str,
    soft_end: str,
    target: int,
    soft_min: int,
    hard_limit: int,
    soft_bad_lead: str,
) -> list[str]:
    closing_punctuation = "）)]」』”’》〉】〕〗〙〛"
    def total_visible(s: str) -> int:
        text = re.sub(r"</?[^>]+>", "", s)
        text = re.sub(r"&[a-zA-Z#0-9]+;", "X", text)
        return len(text)

    if total_visible(inner_html) < target:
        return [inner_html]

    chunks: list[str] = []
    current = ""
    stack: list[str] = []
    visible_length = 0
    i = 0
    while i < len(inner_html):
        ch = inner_html[i]
        if ch == "<":
            j = inner_html.find(">", i)
            if j == -1:
                current += inner_html[i:]
                break
            tag = inner_html[i:j + 1]
            current += tag
            opening = re.match(r"<(strong|em)>", tag, re.IGNORECASE)
            closing = re.match(r"</(strong|em)>", tag, re.IGNORECASE)
            if opening:
                stack.append(opening.group(1).lower())
            elif closing:
                name = closing.group(1).lower()
                if stack and stack[-1] == name:
                    stack.pop()
                elif name in stack:
                    stack.remove(name)
            i = j + 1
            continue
        if ch == "&":
            j = inner_html.find(";", i)
            if j != -1 and j - i <= 8:
                current += inner_html[i:j + 1]
                visible_length += 1
                i = j + 1
                continue

        current += ch
        visible_length += 1
        should_split = False
        if ch in primary_end and visible_length >= target:
            prev = _previous_visible_char(inner_html, i)
            nxt = _next_visible_char(inner_html, i)
            should_split = not (
                ch == "." and _is_non_sentence_period(inner_html, i, prev, nxt)
            )
        elif ch in soft_end:
            nxt = _next_visible_char(inner_html, i)
            if visible_length >= hard_limit:
                should_split = True
            elif nxt and nxt in soft_bad_lead:
                should_split = False
            elif visible_length >= soft_min:
                should_split = True

        if should_split:
            next_visible = _next_visible_char(inner_html, i)
            if next_visible and next_visible in closing_punctuation:
                should_split = False

        if should_split:
            close = "".join(f"</{tag}>" for tag in reversed(stack))
            reopen = "".join(f"<{tag}>" for tag in stack)
            chunks.append(current + close)
            current = reopen
            visible_length = 0
        i += 1

    if current.strip():
        chunks.append(current)
    return chunks or [inner_html]


def _has_unclosed_parenthesis(text: str) -> bool:
    pairs = {"(": ")", "（": "）"}
    stack: list[str] = []
    for ch in text:
        if ch in pairs:
            stack.append(ch)
        elif ch in pairs.values():
            expected_open = "(" if ch == ")" else "（"
            if stack and stack[-1] == expected_open:
                stack.pop()
    return bool(stack)


def join_wrapped_heading(
    title: str,
    next_plain: str | None,
    *,
    is_blocked: Callable[[str], bool],
    max_length: int = 140,
) -> str | None:
    if not next_plain or not _has_unclosed_parenthesis(title):
        return None
    continuation = next_plain.strip()
    if not continuation or is_blocked(continuation):
        return None

    left = title.rstrip()
    gap = " " if left[-1].isascii() and continuation[0].isascii() else ""
    joined = left + gap + continuation
    if len(joined) > max_length:
        return None
    return joined
