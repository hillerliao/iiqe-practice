"""測試 pdfplumber 的 layout=True 是否能改善雙欄解析"""
import os
import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(ROOT)
SCRIPTS = os.path.join(ROOT, "scripts")
SRC = os.path.join(
    PARENT,
    "試卷㇐：保險原理及實務 — 模擬試題2025年版(適用於2025年2月17日或以後的考試).pdf",
)

with pdfplumber.open(SRC) as pdf:
    for i, page in enumerate(pdf.pages[:2]):
        print(f"=== Page {i + 1} (layout) ===")
        t = page.extract_text(layout=True) or ""
        print(t[:2500])
        print()
