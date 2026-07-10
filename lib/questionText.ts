// Splits a question stem into a lead-in part and a list of sub-statements
// marked by roman numerals (i. ii. iii. iv. ...). Used to render each
// statement on its own line instead of one long wrapped paragraph.

// Order matters: longer roman numerals must come first so e.g. "iv" is not
// partially matched by the "i" alternative. The trailing marker may be a dot
// (i.), a parenthesis (i)) or their full-width equivalents.
const ROMAN_RE = /[ \t]*(viii|vii|vi|iv|ix|v|iii|ii|i|x)[.．）)]/gi;

export type SplitQuestion = { lead: string; items: string[] };

export function splitQuestionStatements(text: string): SplitQuestion {
  const matches = Array.from(text.matchAll(ROMAN_RE));
  if (matches.length < 2) {
    return { lead: text, items: [] };
  }
  const items: string[] = [];
  const firstIdx = matches[0].index ?? 0;
  const lead = text.slice(0, firstIdx).trim();
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    items.push(text.slice(start, end).trim());
  }
  return { lead, items };
}
