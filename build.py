#!/usr/bin/env python3
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

CSS_ORDER = ["theme.css", "layout.css", "print.css"]
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
]


def read(path):
    return path.read_text(encoding="utf-8")


def build():
    shell = read(SRC / "index.html")

    css_blocks = [read(SRC / "css" / name) for name in CSS_ORDER if (SRC / "css" / name).exists()]
    js_blocks = [read(SRC / "js" / name) for name in JS_ORDER if (SRC / "js" / name).exists()]

    css = "\n".join(css_blocks)
    js = "\n".join(js_blocks)

    if "/*__CSS__*/" not in shell:
        raise ValueError("src/index.html missing /*__CSS__*/ marker")
    if "/*__JS__*/" not in shell:
        raise ValueError("src/index.html missing /*__JS__*/ marker")

    output = shell.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)

    DIST.mkdir(exist_ok=True)
    out_path = DIST / "ProjectPlanner.html"
    out_path.write_text(output, encoding="utf-8")
    return out_path


if __name__ == "__main__":
    result = build()
    print(f"Built {result}")
