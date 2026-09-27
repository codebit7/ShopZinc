#!/usr/bin/env python
"""Case-exact audit of every relative import under frontend/src.

Windows and macOS resolve imports case-insensitively; Linux does not. So an
import like "./ProductList.css" for a file named "productList.css" runs fine
locally and fails the production build. Running the app cannot catch this
class of bug on a case-insensitive filesystem -- only comparing each import
against the real directory listing can.

Run from the frontend/ directory:  python scripts/check-imports.py
Exits non-zero if any relative import does not resolve case-exactly.
"""
import io
import os
import re
import sys

ROOT = "src"
EXTS = ("", ".js", ".jsx", ".css", ".json")
IMPORT_RE = re.compile(r"""(?:from|import)\s+['"](\.[^'"]+)['"]""")


def resolves(directory, rel):
    target = os.path.normpath(os.path.join(directory, rel))
    for candidate in (target + ext for ext in EXTS):
        parent, base = os.path.split(candidate)
        parent = parent or "."
        # os.listdir is case-EXACT even on a case-insensitive filesystem,
        # which is the whole point -- os.path.exists is not.
        if os.path.isdir(parent) and base in os.listdir(parent):
            return True
        # a directory import resolving to its index file
        if os.path.isdir(candidate):
            for index in ("index.js", "index.jsx"):
                if index in os.listdir(candidate):
                    return True
    return False


def main():
    if not os.path.isdir(ROOT):
        print(f"FAIL: run this from the frontend/ directory ({ROOT}/ not found)")
        return 1

    problems = 0
    for directory, _dirs, files in os.walk(ROOT):
        for filename in files:
            if not filename.endswith((".js", ".jsx")):
                continue
            path = os.path.join(directory, filename)
            source = io.open(path, encoding="utf-8", errors="replace").read()
            for match in IMPORT_RE.finditer(source):
                rel = match.group(1)
                if not resolves(directory, rel):
                    print(f"CASE/MISSING: {path} -> {rel}")
                    problems += 1

    if problems:
        print(f"\nFAIL: {problems} import(s) will not resolve on a case-sensitive filesystem")
        return 1
    print("OK all relative imports resolve case-exactly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
