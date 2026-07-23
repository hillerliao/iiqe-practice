/**
 * Detect TRUE text-bleed from PDF parsing.
 * 
 * True bleed pattern (like Q654):
 *   prev option d: "...應行的審"  (truncated mid-word)
 *   curr question: "慎監控可能會流於鬆懈根據保險業條例..."
 *   The fragment "慎監控可能會流於鬆懈" is the missing tail of prev option.
 * 
 * Filter criteria to avoid false positives:
 * - Fragment must be > 4 chars (short ones like "就", "以下" are valid connectors)
 * - Fragment must NOT start with a valid question-preamble character
 * - Fragment must NOT contain punctuation
 * - Prev option must look truncated
 * - A strong question marker must appear after the fragment
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = [
  'questions-p1-exam.json',
  'questions-p1-mock.json',
  'questions-p3-exam.json',
  'questions-p3-mock.json',
];

// Characters that validly start a question preamble
const VALID_START_CHARS = new Set(
  '就在關如按根以下哪什何試請當若假除對向從於與為被把由可須要有是不未已將會能應保選《「『（(ABCDEFGHIJVX0123456789'.split('')
);

// Strong question-start markers that indicate where the REAL question begins
const Q_MARKERS = [
  '根據', '按照', '依照', '以下哪', '下列哪', '以下那', '下列那',
  '哪一項', '哪一個', '哪項', '哪些', '什麼', '為何', '如何',
  '以下', '下列',
];

function looksTruncated(text) {
  if (!text) return false;
  const lastChar = text[text.length - 1];
  if ('。！？：；，、）)】」》'.includes(lastChar)) return false;
  if (lastChar === '：' || lastChar === ':') return false;
  return true;
}

const issues = [];

for (const file of FILES) {
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (let i = 1; i < questions.length; i++) {
    const prev = questions[i - 1];
    const curr = questions[i];
    const optionKeys = Object.keys(prev.options || {});
    if (optionKeys.length === 0) continue;
    const lastOptionKey = optionKeys[optionKeys.length - 1];
    const lastOption = prev.options[lastOptionKey];

    if (!looksTruncated(lastOption)) continue;

    const q = curr.question;

    for (const marker of Q_MARKERS) {
      const idx = q.indexOf(marker);
      if (idx <= 0 || idx > 25) continue;

      const fragment = q.substring(0, idx);

      // Must be > 4 chars to be bleed (short = valid connector like "就", "以下")
      if (fragment.length <= 4) continue;

      // Fragment must NOT start with a valid preamble char
      if (VALID_START_CHARS.has(fragment[0])) continue;

      // Fragment must NOT contain punctuation (would indicate natural sentence)
      if (/[，。、；：！？（）《》「」\(\)\s]/.test(fragment)) continue;

      // Passed all filters — this is likely true text-bleed
      issues.push({
        file, prevNum: prev.number, prevId: prev.id,
        currNum: curr.number, currId: curr.id,
        lastOptionKey, lastOption,
        question: q, fragment, splitAt: idx,
        fixedOption: lastOption + fragment,
        fixedQuestion: q.substring(idx),
      });
      break;
    }
  }
}

console.log('='.repeat(70));
console.log(`TRUE TEXT-BLEED ISSUES: ${issues.length}`);
console.log('='.repeat(70));

for (const iss of issues) {
  console.log(`\n[${iss.file}] Q${iss.currNum} (${iss.currId})`);
  console.log(`  PREV Q${iss.prevNum} opt ${iss.lastOptionKey}: "...${iss.lastOption.slice(-40)}"`);
  console.log(`  BLEED FRAGMENT: "${iss.fragment}"`);
  console.log(`  CURR question: "${iss.question.substring(0, 70)}"`);
  console.log(`  → FIX option: "...${iss.fixedOption.slice(-50)}"`);
  console.log(`  → FIX question: "${iss.fixedQuestion.substring(0, 60)}"`);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`TOTAL: ${issues.length}`);
