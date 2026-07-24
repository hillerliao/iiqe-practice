// Splits a question stem into a lead-in part and a list of sub-statements
// marked by roman numerals. The source PDFs use several marker styles,
// including bare numerals, so candidates are validated as a sequence before
// they are treated as statements.

const ROMAN_NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const ROMAN_SOURCE = "viii|vii|vi|iv|ix|v|iii|ii|i|x";
// 裸羅馬數字後接空白、行尾或中日韓字符均視為分項標記
// (OCR 常丟失分隔號, 如 "iii保險人" — 中文正文不會出現羅馬數字, 故安全)
const CJK_LOOKAHEAD = "[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff]";
const ROMAN_MARKER_RE = new RegExp(
  `(^|[\\s:：;；,，])((?:[(（]\\s*)?(?:${ROMAN_SOURCE})\\s*[)）]|(?:${ROMAN_SOURCE})[.．]|(?:${ROMAN_SOURCE})(?=\\s|$|${CJK_LOOKAHEAD}))`,
  "gi",
);

type RomanMarker = {
  start: number;
  end: number;
  numeral: number;
};

export type SplitQuestion = { lead: string; items: string[] };

function findRomanMarkers(text: string): RomanMarker[] {
  return Array.from(text.matchAll(ROMAN_MARKER_RE), (match) => {
    const prefixLength = match[1].length;
    const marker = match[2];
    const start = (match.index ?? 0) + prefixLength;
    const numeralText = marker.replace(/[\s()（）.．]/g, "").toLowerCase();

    return {
      start,
      end: start + marker.length,
      numeral: ROMAN_NUMERALS.indexOf(numeralText) + 1,
    };
  });
}

function hasStatementBody(text: string): boolean {
  return text.replace(/[\s,，;；:：.．()（）]/g, "").length >= 2;
}

export function splitQuestionStatements(text: string): SplitQuestion {
  const markers = findRomanMarkers(text);

  for (let first = 0; first < markers.length; first++) {
    if (markers[first].numeral !== 1) continue;

    let end = first + 1;
    while (
      end < markers.length &&
      markers[end].numeral === markers[end - 1].numeral + 1
    ) {
      end++;
    }

    const sequence = markers.slice(first, end);
    if (sequence.length < 2) continue;

    const hasBodies = sequence.every((marker, index) => {
      const bodyEnd = index + 1 < sequence.length ? sequence[index + 1].start : text.length;
      return hasStatementBody(text.slice(marker.end, bodyEnd));
    });
    if (!hasBodies) continue;

    return {
      lead: text.slice(0, sequence[0].start).trim(),
      items: sequence.map((marker, index) => {
        const itemEnd = index + 1 < sequence.length ? sequence[index + 1].start : text.length;
        return text.slice(marker.start, itemEnd).trim();
      }),
    };
  }

  return { lead: text, items: [] };
}
