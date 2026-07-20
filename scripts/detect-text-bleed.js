/**
 * Detect text-bleed issues from PDF parsing where the tail of one question's
 * option gets prepended to the next question's question text.
 * 
 * HIGH CONFIDENCE: A question marker (根據, 以下, etc.) appears at position > 0
 * in the question text, meaning there's a stray fragment before it.
 * 
 * MEDIUM CONFIDENCE: The previous option looks truncated AND the current question
 * starts with characters that don't form a natural question beginning.
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

// Question markers that indicate the TRUE start of a question
const QUESTION_MARKERS = [
  '根據', '按照', '依照', '以下', '下列', '哪一', '哪個', '哪項', '哪些',
  '什麼', '為何', '如何', '試問', '請問', '關於', '就有', '在以下',
  '就以下', '就下列', '以下哪', '下列哪', '以下那', '下列那',
];

// Check if text ends mid-word/mid-phrase (truncated)
function looksTruncated(text) {
  if (!text) return false;
  const lastChar = text[text.length - 1];
  if ('。！？：；，、）)】」》'.includes(lastChar)) return false;
  if (lastChar === '：' || lastChar === ':') return false;
  return true;
}

let totalHigh = 0;
let totalMedium = 0;
const highConfidenceIssues = [];
const mediumConfidenceIssues = [];

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
    
    // HIGH CONFIDENCE: question marker found at position > 0 and <= 20
    let found = false;
    for (const marker of QUESTION_MARKERS) {
      const idx = curr.question.indexOf(marker);
      if (idx > 0 && idx <= 20) {
        const fragment = curr.question.substring(0, idx);
        // Verify: the fragment should NOT be a natural preamble on its own
        // e.g. "《指引》根據..." is fine (《...》 is a subject)
        // but "慎監控可能會流於鬆懈根據..." is bleed
        // Heuristic: if fragment contains no punctuation and prev option is truncated => bleed
        const fragHasPunct = /[，。、；：！？（）《》「」]/.test(fragment);
        if (!fragHasPunct && looksTruncated(lastOption)) {
          totalHigh++;
          found = true;
          highConfidenceIssues.push({
            file, prevNum: prev.number, prevId: prev.id,
            currNum: curr.number, currId: curr.id,
            lastOptionKey, lastOption,
            question: curr.question,
            fragment, splitAt: idx,
            fixedOption: lastOption + fragment,
            fixedQuestion: curr.question.substring(idx),
          });
          break;
        }
      }
    }
    if (found) continue;
    
    // MEDIUM CONFIDENCE: prev option truncated + question starts oddly
    // Only flag if the question's first 2+ chars don't form a recognizable word
    if (looksTruncated(lastOption)) {
      const q = curr.question;
      const firstChar = q[0];
      // Skip if starts with common question/particle chars
      const safeStarts = '根以下哪關保在當如按試何什選就對向從於與為被把由可須要有是不未已將會能應《「『（(ABCDEFGHIJVX0123456789';
      if (!safeStarts.includes(firstChar)) {
        totalMedium++;
        mediumConfidenceIssues.push({
          file, prevNum: prev.number, prevId: prev.id,
          currNum: curr.number, currId: curr.id,
          lastOptionKey, lastOption,
          question: q,
        });
      }
    }
  }
}

// Output HIGH confidence issues
console.log('\n' + '='.repeat(70));
console.log(`HIGH CONFIDENCE TEXT-BLEED ISSUES: ${totalHigh}`);
console.log('='.repeat(70));
for (const iss of highConfidenceIssues) {
  console.log(`\n[${iss.file}] Q${iss.currNum} (${iss.currId})`);
  console.log(`  PREV Q${iss.prevNum} opt ${iss.lastOptionKey}: "...${iss.lastOption.slice(-40)}"`);
  console.log(`  FRAGMENT: "${iss.fragment}"`);
  console.log(`  FIX option → "...${iss.fixedOption.slice(-50)}"`);
  console.log(`  FIX question → "${iss.fixedQuestion.substring(0, 60)}..."`);
}

console.log('\n' + '='.repeat(70));
console.log(`MEDIUM CONFIDENCE (needs manual review): ${totalMedium}`);
console.log('='.repeat(70));
for (const iss of mediumConfidenceIssues) {
  console.log(`  [${iss.file}] Q${iss.currNum} (${iss.currId}) starts: "${iss.question.substring(0, 50)}"`);
  console.log(`    prev opt ${iss.lastOptionKey}: "...${iss.lastOption.slice(-30)}"`);
}

console.log(`\nSUMMARY: ${totalHigh} high-confidence, ${totalMedium} medium-confidence`);
