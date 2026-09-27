#!/usr/bin/env python3
"""Generate search-index.json for The Patio Edit from article HTML.

Extracts per article: title (h1, falling back to <title>), url
("articles/<slug>.html"), excerpt (first ~160 chars of the first paragraph
inside <article>), and the list of h2 headings. Then validates the result:
JSON must parse, contain every article, and every URL must resolve to a
real local file.

Usage: python3 build-search-index.py
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARTICLES_DIR = ROOT / "articles"
OUT = ROOT / "search-index.json"


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_article = False
        self.in_header = False
        self.capture = None  # "title_tag" | "h1" | "p" | "h2" | None
        self.buf = []
        self.title_tag = ""
        self.h1 = ""
        self.first_p = ""
        self.h2s = []
        self.got_p = False

    def handle_starttag(self, tag, attrs):
        if tag == "article":
            self.in_article = True
        elif self.in_article and tag == "header":
            self.in_header = True
        elif tag == "title":
            self.capture = "title_tag"
            self.buf = []
        elif self.in_article and tag == "h1" and not self.h1:
            self.capture = "h1"
            self.buf = []
        elif self.in_article and not self.in_header and tag == "p" and not self.got_p:
            self.capture = "p"
            self.buf = []
        elif self.in_article and tag == "h2":
            self.capture = "h2"
            self.buf = []

    def handle_endtag(self, tag):
        text = "".join(self.buf).strip()
        if tag == "title" and self.capture == "title_tag":
            self.title_tag = re.sub(r"\s+", " ", text)
            self.capture = None
        elif tag == "article":
            self.in_article = False
            self.capture = None
        elif tag == "header":
            self.in_header = False
        elif self.in_article and tag == "h1" and self.capture == "h1":
            self.h1 = re.sub(r"\s+", " ", text)
            self.capture = None
        elif self.in_article and tag == "p" and self.capture == "p":
            self.first_p = re.sub(r"\s+", " ", text)
            self.got_p = True
            self.capture = None
        elif self.in_article and tag == "h2" and self.capture == "h2":
            self.h2s.append(re.sub(r"\s+", " ", text))
            self.capture = None

    def handle_data(self, data):
        if self.capture:
            self.buf.append(data)


def excerpt(text, limit=160):
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut + "…"


def main():
    files = sorted(ARTICLES_DIR.glob("*.html"))
    if not files:
        print("ERROR: no article files found in", ARTICLES_DIR, file=sys.stderr)
        sys.exit(1)

    entries = []
    for path in files:
        parser = ArticleParser()
        parser.feed(path.read_text(encoding="utf-8"))
        title = parser.h1 or re.sub(r"\s*\|\s*The Patio Edit\s*$", "", parser.title_tag)
        entries.append({
            "title": title,
            "url": f"articles/{path.stem}.html",
            "excerpt": excerpt(parser.first_p),
            "headings": parser.h2s,
        })

    OUT.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # ---- validation ----
    data = json.loads(OUT.read_text(encoding="utf-8"))  # must parse
    assert isinstance(data, list) and len(data) == len(files), "entry count mismatch"
    for e in data:
        assert e["title"], f"empty title for {e['url']}"
        assert e["excerpt"], f"empty excerpt for {e['url']}"
        target = ROOT / e["url"]
        assert target.is_file(), f"URL does not resolve to a real file: {e['url']}"
    print(f"Wrote {OUT} with {len(data)} entries; all URLs resolve to real files.")
    for e in data:
        print(f"  - {e['title'][:60]} ({e['url']})")


if __name__ == "__main__":
    main()
