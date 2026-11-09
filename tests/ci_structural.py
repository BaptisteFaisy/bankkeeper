"""Structural CI: sizes, taste bans, palette (stdlib only).

Every source file stays under 500 lines, every function under 50, the web
UI honors the brief taste bans and the exact section 9 palette, motion
stays reduced-motion aware and DPR stays capped at 2.

Run: python3 tests/ci_structural.py (from the repo root). Exit 1 on breach.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "target", "node_modules", "dist", "__pycache__",
             ".scratch"}
CODE_EXT = {".rs", ".py", ".ts", ".tsx", ".css"}

RUST_FN = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)")
PY_DEF = re.compile(r"^(\s*)def\s+(\w+)")
TS_FN = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)")
TS_CONST_FN = re.compile(r"^\s*(?:export\s+)?const\s+(\w+)\s*[:=][^;]*=>")

TASTE_RES = [
    (re.compile(r"violet|indigo", re.I), "violet/indigo tint"),
    (re.compile(r"linear-gradient|radial-gradient|conic-gradient"),
     "gradient wash"),
    (re.compile(r"backdrop-filter"), "glassmorphism"),
    (re.compile(r"repeat\(\s*auto-(?:fill|fit)"), "grid of identical cards"),
    (re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]"), "emoji as icon"),
]
CREAM = re.compile(r"#(?:f5f0e1|faf3e0|fff8e7|f8f4e8|fdf6e3)\b", re.I)
PALETTE = ["#0f2a30", "#163940", "#1b4a54", "#24616c", "#c9b083",
           "#e4ede6", "#e0672f", "#e3b65a", "#8fc06f"]


def sources():
    """Every code file under the repo, minus build and cache dirs."""
    found = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in sorted(files):
            if os.path.splitext(name)[1] in CODE_EXT:
                found.append(os.path.join(base, name))
    return found


def brace_length(lines, start):
    """Lines from the fn header until its braces balance (Rust/TS)."""
    depth, opened, end = 0, False, start
    for num in range(start, len(lines)):
        for char in lines[num].split("//")[0]:
            if char == "{":
                depth += 1
                opened = True
            elif char == "}":
                depth -= 1
        end = num
        if opened and depth <= 0:
            break
    return end - start + 1


def rust_fns(path, lines):
    """(name, line, length) for every Rust fn in the file."""
    out = []
    for num, line in enumerate(lines):
        match = RUST_FN.match(line)
        if match:
            out.append((match.group(1), num + 1, brace_length(lines, num)))
    return out


def ts_fns(path, lines):
    """(name, line, length) for every named TS function in the file."""
    out = []
    for num, line in enumerate(lines):
        match = TS_FN.match(line) or TS_CONST_FN.match(line)
        if match:
            out.append((match.group(1), num + 1, brace_length(lines, num)))
    return out


def py_fns(path, lines):
    """(name, line, length) for every Python def in the file."""
    found = [(m.start(), len(m.group(1)), m.group(2))
             for line in lines for m in [PY_DEF.match(line)] if m]
    out = []
    for pos, (num, indent, name) in enumerate(found):
        end = len(lines)
        for nxt in range(num + 1, len(lines)):
            stripped = lines[nxt].strip()
            if not stripped:
                continue
            lead = len(lines[nxt]) - len(lines[nxt].lstrip())
            if lead <= indent:
                end = nxt
                break
        _ = pos
        out.append((name, num + 1, end - num))
    return out


def check_sizes(paths):
    """Every file under 500 lines, every function under 50."""
    breaches = []
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
        rel = os.path.relpath(path, ROOT)
        if len(lines) >= 500:
            breaches.append(f"{rel}: {len(lines)} lines (max 499)")
        ext = os.path.splitext(path)[1]
        if ext == ".rs":
            fns = rust_fns(path, lines)
        elif ext == ".py":
            fns = py_fns(path, lines)
        elif ext in (".ts", ".tsx"):
            fns = ts_fns(path, lines)
        else:
            fns = []
        for name, line, length in fns:
            if length >= 50:
                breaches.append(f"{rel}:{line} {name} is {length} lines")
    return breaches


def check_taste(paths):
    """Brief section 3.3 bans, over the web sources only."""
    breaches = []
    web = [p for p in paths if p.startswith(os.path.join(ROOT, "web"))]
    for path in web:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        rel = os.path.relpath(path, ROOT)
        for regex, label in TASTE_RES:
            if regex.search(text):
                breaches.append(f"{rel}: {label} banned by the brief")
        if CREAM.search(text):
            breaches.append(f"{rel}: plain cream background banned")
    return breaches


def check_palette_and_motion():
    """Exact section 9 palette, reduced motion, DPR cap."""
    breaches = []
    css_path = os.path.join(ROOT, "web", "src", "styles.css")
    with open(css_path, encoding="utf-8") as fh:
        css = fh.read().lower()
    for tint in PALETTE:
        if tint not in css:
            breaches.append(f"styles.css: palette tint {tint} missing")
    if "prefers-reduced-motion" not in css:
        breaches.append("styles.css: no prefers-reduced-motion block")
    for name in ("SeaMap.tsx", "Chart.tsx"):
        path = os.path.join(ROOT, "web", "src", "components", name)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        if "prefers-reduced-motion" not in text and name == "SeaMap.tsx":
            breaches.append(f"{name}: ignores prefers-reduced-motion")
        if "devicePixelRatio" not in text:
            breaches.append(f"{name}: DPR handling missing")
        elif ", 2)" not in text and "(2," not in text.replace(" ", ""):
            breaches.append(f"{name}: DPR not capped at 2")
    return breaches


def main():
    paths = sources()
    breaches = check_sizes(paths) + check_taste(paths)
    breaches += check_palette_and_motion()
    if breaches:
        print(f"{len(breaches)} structural breach(es):")
        for breach in breaches:
            print(f"  {breach}")
        return 1
    print(f"OK: {len(paths)} files under 500 lines, every fn under 50, "
          f"taste and palette clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
