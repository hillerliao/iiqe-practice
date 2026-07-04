"""
修復 .cache_paper1.json 中幾處題幹/選項殘文問題:
1. Q74/Q75: 安琪情景被題號切分,情景整體應歸 Q75
2. Q284: 題幹末尾「即時需要大量現金」應拼到選項 b 末尾
3. Q305: 題幹末尾「選擇的保險產品...」應拼到選項 a 末尾
4. Q396: 題幹末尾孤立「的」字,刪除
"""
import json, os, shutil

SRC = r"d:\Downloads\IIQE\.cache_paper1.json"
with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

by_num = {q["number"]: q for q in data}

# 1. Q74/Q75 安琪情景切分
q74 = by_num[74]
q75 = by_num[75]
# Q74 保留問句,安琪情景整體歸 Q75
q74_stem = q74["question"]
# 找到第一個換行後即為情景開始
nl = q74_stem.find("\n")
if nl != -1:
    angela_intro = q74_stem[nl + 1:].strip()  # 安琪在登機前...安琪不幸在旅程中
    q74["question"] = q74_stem[:nl].strip()  # 甚麼是代價?
    q75["question"] = angela_intro + q75["question"]  # 安琪在登機前...安琪不幸在旅程中斷了一條腿...
    print(f"Q74 -> {q74['question']!r}")
    print(f"Q75 -> {q75['question'][:60]!r}...")

# 2. Q284 殘文拼回選項 b
q284 = by_num[284]
s = q284["question"]
if s.endswith("即時需要大量現金"):
    frag = "即時需要大量現金"
    q284["question"] = s[: -len(frag)].rstrip()
    q284["options"]["b"] = q284["options"]["b"] + frag
    print(f"Q284 stem -> {q284['question']!r}")
    print(f"Q284 opt b -> {q284['options']['b']!r}")

# 3. Q305 殘文拼回選項 a
q305 = by_num[305]
s = q305["question"]
frag = "選擇的保險產品，而該等產品是適合其客戶情況"
if frag in s:
    q305["question"] = s.replace(frag, "").strip()
    q305["options"]["a"] = q305["options"]["a"] + frag
    print(f"Q305 stem -> {q305['question']!r}")
    print(f"Q305 opt a -> {q305['options']['a']!r}")

# 4. Q396 刪除孤立「的」
q396 = by_num[396]
s = q396["question"]
if s.endswith("\n的") or s.endswith("的"):
    lines = s.split("\n")
    if lines[-1].strip() == "的":
        q396["question"] = "\n".join(lines[:-1]).rstrip()
        print(f"Q396 stem -> {q396['question']!r}")

with open(SRC, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"\n-> wrote {SRC}")
