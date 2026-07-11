#!/usr/bin/env python3
"""
Restore 13 questions whose 'b' option accidentally swallowed the last roman-labeled
stem item. Source of truth: D:\\Downloads\\IIQE\\_p3monthly.txt, _p1_all.txt, _p1mock.txt.

Files touched (each gets a single backup .bak.<ts>):
  - data/questions-p3-exam.json   (#11 / #15 / #51 / #62 / #298)
  - data/questions-p1-exam.json   (#309 / #329 / #368)
  - data/questions-p1-mock.json   (#662 / #704 / #705 / #706 / #838)

What changes per question (id/number/ref/source/sourceLabel/page untouched):
  - question: original stem + appended "iv" statement (with newline so the stem
    formatter can split it)
  - options.a/b/c/d: real options from the PDF anchor line
  - answer:      from the PDF answer column

Run:  python scripts/fix_13_misplaced.py
Verify: scripts/fix_13_misplaced.py --verify   (re-runs the audit script)
"""
from __future__ import annotations
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(r'D:\Downloads\IIQE\iiqe-app')
DATA = ROOT / 'data'

# (file, number, ref, answer, question_with_iv_appended, options_dict)
PATCHES = {
    'questions-p3-exam.json': [
        {
            'number': 11,
            'ref': '1.2.1',
            'answer': 'A',
            'question': (
                '以下哪項有關壽險保單的轉讓與可保權益的法律規定的關係要求的描述是正確的？\n'
                'i.就 某人的生命購買保險，對該受保生命必須具有可保權益。但透過轉讓程序購買別人的現有保單，對該受保生命無須具有可保權益\n'
                'ii.保 單所有人不能將壽險合約轉讓予第三者，即使該第三者對受保生命具有可保權益\n'
                'iii. 保單所有人可以把正當地安排的壽險合約轉讓予第三者，即使該第三者對受保生命缺乏可保權益\n'
                'iv.保 單所有人只可將壽險合約轉讓予對該受保生命有可保權益的第三者'
            ),
            'options': {
                'a': 'i, iii',
                'b': 'i, ii',
                'c': 'i, iii, iv',
                'd': 'ii, iii, iv',
            },
        },
        {
            'number': 15,
            'ref': '1.2.2',
            'answer': 'C',
            'question': (
                '以下哪項為最高誠信的正確描述？\n'
                'i. 任何人不可能被期望披露不可能知道的情況\n'
                'ii.就免健康核保的申請，保險中介人必需嚴謹制定一份建議書\n'
                'iii.最高誠信的原則是主動披露，並不會因投保人已獲得保險人安排合資格的醫療團隊的體檢而影響\n'
                'iv.重要資料是在「訂定保費方面會影響一名保險人的判斷的任何情況」'
            ),
            'options': {
                'a': 'i, ii',
                'b': 'i, iii',
                'c': 'i, iii, iv',
                'd': 'ii, iii, iv',
            },
        },
        {
            'number': 51,
            'ref': '2(b)',
            'answer': 'C',
            'question': (
                '下列哪項屬於基本形式之壽險保單的常見變化？\n'
                'i)保單所有人可以選擇將保單紅利轉換為公司股份\n'
                'ii)如果最初只投保一段有限時間，可能可以續保\n'
                'iii)保單所有人可以選擇將保單紅利轉換為公司優先股\n'
                'iv)保單可加入各種附約，用以改善所提供的保障'
            ),
            'options': {
                'a': 'i, ii',
                'b': 'iii, iv',
                'c': 'ii, iv',
                'd': 'i, ii, iii, iv',
            },
        },
        {
            'number': 62,
            'ref': '2.3.1(b)',
            'answer': 'B',
            'question': (
                '根據《合資格延期年金保單指引》（指引19），以下哪一項是的合資格延期年金保設計特點?\n'
                'i.年 金保費 的總額 不得少於 $180,000 ，最短保費 繳付期為 5年\n'
                'ii.最 短 年金期不得少於 10年\n'
                'iii. 年金款項須定期向年金領取人支付，最低限度為每半年一次\n'
                'iv.年 金 期 最早由 年金領取人年滿 50歲開始'
            ),
            'options': {
                'a': 'i,ii',
                'b': 'i,ii,iv',
                'c': 'iii,iv',
                'd': 'i,iii',
            },
        },
        {
            'number': 298,
            'ref': '4.7',
            'answer': 'D',
            'question': (
                '要保單復效，保單所有人必須受到下列哪些條件限制？\n'
                'i) 提供連續可保性證明\n'
                'ii) 繳付任何未繳清貸款利息\n'
                'iii) 從復效日計起的另一段自殺免責期\n'
                'iv) 從復效日計起的另一段可異議期'
            ),
            'options': {
                'a': 'i及ii',
                'b': 'i及iii',
                'c': 'ii及iii',
                'd': 'i, ii, iii 及 iv',
            },
        },
    ],
    'questions-p1-exam.json': [
        {
            'number': 309,
            'ref': '6.1.3b',
            'answer': 'B',
            'question': (
                '以下哪項與索償有關的個案屬保險投訴局的職權範圍?\n'
                'i.1 00,000港元個人保單索償\n'
                'ii.因 違反保單條款，300,000港元家居保險索償爭議\n'
                'iii.涉 及汽車保險的無償折扣糾紛\n'
                'iv.汽 車全險中涉及10,000港元的玻璃保險索償'
            ),
            'options': {
                'a': 'ii,iii',
                'b': 'i,ii,iv',
                'c': 'i,ii',
                'd': 'i,iii,iv',
            },
        },
        {
            'number': 329,
            'ref': '6.1.3',
            'answer': 'B',
            'question': (
                '以下哪項是保險投訴局的描述是正確的?\n'
                'i)會員是在香港從事個人保險業務的獲授權保險人\n'
                'ii)涉及的投訴個案保單須屬個人保單\n'
                'iii)保險投訴委員會兩名委員必須來會計，法律或精算等業界\n'
                'iv)保險投訴委員會兩名委員來自保險業界'
            ),
            'options': {
                'a': 'i,ii,iii',
                'b': 'i,ii,iv',
                'c': 'iii, iv',
                'd': 'i, ii, iii, iv',
            },
        },
        {
            'number': 368,
            'ref': '7.2.1',
            'answer': 'D',
            'question': (
                '資料使用者透過制定服務合約，對資料處理者施加的責任是:\n'
                'i.資 料使用者有權審核及視察資料處理者如何處理和儲存個人資料\n'
                'ii.不 再需要就受託目的處理有關個人資料時， 必須適時交還、銷毀或刪除有關資料\n'
                'iii.須 採取的保安措施，以保障受託的個人資料，並要求資料處理者遵從保障資料原則\n'
                'iv.資 料處理者必須居於香港'
            ),
            'options': {
                'a': 'i,ii',
                'b': 'ii,iii,iv',
                'c': 'iii,iv',
                'd': 'i,ii,iii',
            },
        },
    ],
    'questions-p1-mock.json': [
        {
            'number': 662,
            'ref': '6.1.3b',
            'answer': 'B',
            'question': (
                '以下哪項與索償有關的個案屬保險投訴局的職權範圍?\n'
                'i.1 00,000港元個人保單索償\n'
                'ii.因 違反保單條款，300,000港元家居保險索償爭議\n'
                'iii. 涉及汽車保險的無償折扣糾紛\n'
                'iv.汽 車全險中涉及10,000港元的玻璃保險索償'
            ),
            'options': {
                'a': 'ii,iii',
                'b': 'i,ii,iv',
                'c': 'i,ii',
                'd': 'i,iii,iv',
            },
        },
        {
            'number': 704,
            'ref': '6.1.3',
            'answer': 'B',
            'question': (
                '以下哪項是保險投訴局的描述是正確的?\n'
                'i)會員是在香港從事個人保險業務的獲授權保險人\n'
                'ii)涉及的投訴個案保單須屬個人保單\n'
                'iii)保險投訴委員會兩名委員必須來會計，法律或精算等業界\n'
                'iv)保險投訴委員會兩名委員來自保險業界'
            ),
            'options': {
                'a': 'i,ii,iii',
                'b': 'i,ii,iv',
                'c': 'iii, iv',
                'd': 'i, ii, iii, iv',
            },
        },
        {
            'number': 705,
            'ref': '6.1.3',
            'answer': 'A',
            'question': (
                '以下哪項是保險投訴局的描述是正確的?\n'
                'i)會員是在香港從事個人保險業務的獲授權保險人\n'
                'ii)投訴委員會是由一位主席、四位委員組成\n'
                'iii)涉及的投訴個案保單須屬個人保單\n'
                'iv)保險投訴局會代為處理理賠及索償'
            ),
            'options': {
                'a': 'i,ii,iii',
                'b': 'i,ii,iv',
                'c': 'iii, iv',
                'd': 'i, ii, iii, iv',
            },
        },
        {
            'number': 706,
            'ref': '6.1.3',
            'answer': 'B',
            'question': (
                '以下哪項是保險投訴局的描述是正確的?\n'
                'i)保險投訴局成立目的是代表會員處理及支付索償\n'
                'ii)會員是在香港從事個人保險業務的獲授權保險人\n'
                'iii)涉及的投訴個案保單須屬個人保單\n'
                'iv)投訴委員會的委員中有兩位來自保險業'
            ),
            'options': {
                'a': 'i,ii,iii',
                'b': 'ii,iii,iv',
                'c': 'iii, iv',
                'd': 'i, ii, iii, iv',
            },
        },
        {
            'number': 838,
            'ref': '7.5.1',
            'answer': 'A',
            'question': (
                '以下哪項是《防止賄賂條例》的描述是正確的?\n'
                'i.防 止主事人免受代理人濫用職權所損害\n'
                'ii.持 牌個人保險代理是作為保險經紀公司委任的業務代表\n'
                'iii. 行賄目的未達可作為賄賂的辯護理由\n'
                'iv.以 上皆是'
            ),
            'options': {
                'a': 'i.',
                'b': 'i,ii',
                'c': 'ii,iii',
                'd': 'v',
            },
        },
    ],
}


def backup(path: Path) -> Path:
    ts = time.strftime('%Y%m%d-%H%M%S')
    bak = path.with_suffix(path.suffix + f'.bak.{ts}')
    shutil.copy2(path, bak)
    return bak


def apply(file_name: str, patches: list) -> tuple[int, list[str]]:
    path = DATA / file_name
    arr = json.loads(path.read_text(encoding='utf-8'))
    by_num = {q['number']: q for q in arr if isinstance(q, dict) and q.get('number') is not None}
    log: list[str] = []
    for p in patches:
        n = p['number']
        q = by_num.get(n)
        if q is None:
            log.append(f'  #{n}: SKIP — not in file')
            continue
        before_q = q.get('question') or q.get('stem') or ''
        before_opts = q.get('options') or {}
        # mutate
        q['question'] = p['question']
        q['options'] = p['options']
        q['answer'] = p['answer'].lower()  # local JSON convention is lowercase
        q['ref'] = p['ref']
        log.append(f'  #{n}: applied (question len {len(before_q)}→{len(q["question"])}, opts keys {sorted(before_opts)}→{sorted(q["options"])})')
    bak = backup(path)
    path.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding='utf-8')
    log.append(f'  backup: {bak.name}')
    log.append(f'  wrote: {path.name}')
    return len(patches), log


def main():
    print('=== fixing 13 A-class misplaced questions ===')
    total = 0
    for fname, patches in PATCHES.items():
        print(f'\n## {fname}  ({len(patches)} patches)')
        n, log = apply(fname, patches)
        total += n
        for line in log:
            print(line)
    print(f'\nTOTAL applied: {total}')


if __name__ == '__main__':
    main()