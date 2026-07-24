"""Legacy diagnostic extractor for flattened mock-PDF layout text.

Do not use its output to rebuild production question data. Flattening a physical
PDF table into visual text lines loses authoritative row boundaries. Use
``rebuild_mock_pdfs.py`` instead; it parses physical table rows and cells.

Diagnostic usage only:
  python scripts/extract_mock_pdfs.py
"""
import os
import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(ROOT)
SCRIPTS = os.path.join(ROOT, "scripts")
os.makedirs(SCRIPTS, exist_ok=True)

MOCK_PDFS = [
    {
        "name": "p1",
        "src": os.path.join(
            PARENT,
            "試卷㇐：保險原理及實務 — 模擬試題2025年版(適用於2025年2月17日或以後的考試).pdf",
        ),
        "out": os.path.join(SCRIPTS, "_mock_p1_layout.txt"),
    },
    {
        "name": "p3",
        "src": os.path.join(PARENT, "試卷三⾧期保險模擬試題2025年版.pdf"),
        "out": os.path.join(SCRIPTS, "_mock_p3_layout.txt"),
    },
]

for item in MOCK_PDFS:
    print(f"[{item['name']}] opening {item['src']}")
    if not os.path.exists(item["src"]):
        print(f"  !! file not found, skip")
        continue
    with pdfplumber.open(item["src"]) as pdf:
        with open(item["out"], "w", encoding="utf-8") as f:
            for i, page in enumerate(pdf.pages):
                # 跳過封面/目錄/版權頁
                if i == 0:
                    continue
                t = page.extract_text(layout=True) or ""
                f.write(f"===PAGE {i + 1}===\n")
                f.write(t)
                f.write("\n")
        print(f"  -> wrote {item['out']} ({len(pdf.pages)} pages)")

print("done")
