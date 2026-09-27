#!/usr/bin/env python3
"""One-time HTML upgrade for The Patio Edit (patio-edit).

For each page (index.html, disclosure.html, articles/*.html):
  1. Insert a no-flash theme boot snippet in <head> (reads localStorage /
     prefers-color-scheme and sets data-theme before first paint).
  2. Add header actions (search box + dark-mode toggle) after the site nav.
  3. Replace the inline mobile-nav script with <script src="assets/site.js">.

Idempotent: skips files that already contain the markers.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = [ROOT / "index.html", ROOT / "disclosure.html"] + sorted((ROOT / "articles").glob("*.html"))

BOOT_SNIPPET = """  <script>
  /* Set theme before first paint: stored choice, else OS preference. */
  (function(){try{var t=localStorage.getItem('patioedit-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
  </script>
"""

HEADER_ACTIONS = """    <div class="header-actions">
      <div class="site-search" data-search>
        <label class="visually-hidden" for="siteSearchInput">Search articles</label>
        <input class="site-search-input" id="siteSearchInput" type="search" placeholder="Search articles&hellip;" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="siteSearchResults" aria-autocomplete="list">
        <div class="site-search-results" id="siteSearchResults" role="listbox" aria-label="Search results" hidden></div>
      </div>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to dark mode" aria-pressed="false">
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
    </div>
"""

INLINE_NAV_RE = re.compile(
    r"<script>\n\(function \(\) \{\n  var toggle = document\.getElementById\('navToggle'\);.*?\n</script>",
    re.DOTALL,
)
HEADER_ANCHOR = "</nav>\n  </div>\n</header>"
STYLESHEET_RE = re.compile(r'(<link rel="stylesheet" href="[^"]*styles\.css">)')


def upgrade(path: Path):
    rel = path.relative_to(ROOT)
    is_article = path.parent.name == "articles"
    js_src = "../assets/site.js" if is_article else "assets/site.js"
    s = path.read_text(encoding="utf-8")
    changed = []

    if "patioedit-theme" not in s:
        s, n = STYLESHEET_RE.subn(lambda m: m.group(1) + "\n" + BOOT_SNIPPET.rstrip("\n"), s, count=1)
        assert n == 1, f"{rel}: stylesheet link not found"
        changed.append("boot-snippet")
    if 'data-search' not in s:
        assert s.count(HEADER_ANCHOR) == 1, f"{rel}: header anchor not unique"
        s = s.replace(HEADER_ANCHOR, "</nav>\n" + HEADER_ACTIONS.rstrip("\n") + "\n  </div>\n</header>")
        changed.append("header-actions")
    if js_src not in s:
        s, n = INLINE_NAV_RE.subn(f'<script src="{js_src}"></script>', s)
        assert n == 1, f"{rel}: inline nav script not found exactly once (found {n})"
        changed.append("site.js")

    path.write_text(s, encoding="utf-8")
    return changed


def main():
    for page in PAGES:
        changed = upgrade(page)
        print(f"{page.relative_to(ROOT)}: {', '.join(changed) or 'already up to date'}")


if __name__ == "__main__":
    main()
