#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recursively strip stray spaces in Chinese text inside a JSON file.

Rule (matches the agreed definition):
  Remove a space that is *between two Han chars* OR *immediately before a Han
  char* OR *immediately after a Han char*. Other spaces (inside English words,
  around numbers, in punctuation) are left untouched.

Fields touched: every string value found anywhere in the JSON tree
(question / options.* / explanation / labels ...). Scalar non-string fields
(answer, id, number, page ...) are never changed.

Safety:
  - Always writes a timestamped backup before mutating.
  - `--dry-run` reports counts and changes nothing.
  - Uses only the Python standard library.

Usage:
  python3 clean_stray_spaces_json.py <file.json> [--dry-run]
"""
import json
import os
import re
import sys
from datetime import datetime

# Space-like chars only (excludes \n / \t so we never collapse line breaks).
# Kept identical to clean_stray_spaces.py (SQLite) to avoid eating newlines.
SPACE = r"[ \u00a0\u3000]"
# A space adjacent (on either side) to a CJK ideograph.
STRAY_RE = re.compile(rf"(?<=[一-鿿]){SPACE}+|{SPACE}+(?=[一-鿿])")

# CJK ranges we treat as "Han": common (\u4e00-\u9fff) plus ext A and compat.
HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


def strip_text(s: str) -> str:
    return STRAY_RE.sub("", s)


def clean_node(node, stats):
    """Recursively clean string nodes; return possibly-new node."""
    if isinstance(node, str):
        if HAN.search(node):  # only worth touching if it contains Han chars
            new = strip_text(node)
            if new != node:
                stats["strings_changed"] += 1
                stats["chars_removed"] += len(node) - len(new)
            return new
        return node
    if isinstance(node, list):
        changed = False
        out = []
        for item in node:
            res = clean_node(item, stats)
            if res is not item:
                changed = True
            out.append(res)
        return out if changed else node
    if isinstance(node, dict):
        changed = False
        out = {}
        for k, v in node.items():
            res = clean_node(v, stats)
            if res is not v:
                changed = True
            out[k] = res
        return out if changed else node
    return node


def main():
    if len(sys.argv) < 2:
        print("usage: clean_stray_spaces_json.py <file.json> [--dry-run]")
        sys.exit(2)

    path = sys.argv[1]
    dry = "--dry-run" in sys.argv[2:]
    if not os.path.isfile(path):
        print(f"ERROR: file not found: {path}")
        sys.exit(1)

    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    stats = {"strings_changed": 0, "chars_removed": 0}
    new_data = clean_node(data, stats)

    if dry:
        print(f"[DRY-RUN] {os.path.basename(path)}")
        print(f"  strings that would change : {stats['strings_changed']}")
        print(f"  stray spaces that would be removed : {stats['chars_removed']}")
        print("  (no file written)")
        return

    # backup
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = f"{path}.bak.{ts}"
    with open(bak, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"  backup -> {bak}")

    with open(path, "w", encoding="utf-8") as fh:
        json.dump(new_data, fh, ensure_ascii=False, indent=2)

    print(f"[APPLY] {os.path.basename(path)}")
    print(f"  strings changed : {stats['strings_changed']}")
    print(f"  stray spaces removed : {stats['chars_removed']}")


if __name__ == "__main__":
    main()
