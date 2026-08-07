#!/usr/bin/env python3
"""Render a markdown doc to PDF, with mermaid diagrams drawn.

    python3 scripts/md2pdf.py docs/HOW_IT_WORKS.md ~/Downloads/out.pdf

Needs `google-chrome-stable` (headless print) and python-markdown. The mermaid
bundle is cached under scripts/.cache on first run and then inlined, so renders
are deterministic and work offline.

Why not pandoc: it does not draw mermaid, and these docs are mostly diagrams.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import markdown

CACHE = Path(__file__).parent / ".cache"
MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"


def _mermaid() -> str:
    CACHE.mkdir(exist_ok=True)
    bundle = CACHE / "mermaid.min.js"
    if not bundle.exists():
        import urllib.request

        print(f"fetching {MERMAID_URL} -> {bundle}")
        with urllib.request.urlopen(MERMAID_URL, timeout=120) as r:  # noqa: S310
            bundle.write_bytes(r.read())
    return bundle.read_text()

CSS = """
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.55; color: #1a1d21; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 { font-size: 21pt; margin: 0 0 4pt; letter-spacing: -0.4pt; color: #0d1b2a;
     border-bottom: 2.5pt solid #c9a227; padding-bottom: 6pt; }
h2 { font-size: 14pt; margin: 20pt 0 7pt; color: #0d1b2a; letter-spacing: -0.2pt;
     border-bottom: 0.6pt solid #d8dde3; padding-bottom: 3pt;
     break-after: avoid; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 13pt 0 5pt; color: #1e3a5f;
     break-after: avoid; page-break-after: avoid; }
p { margin: 0 0 7pt; }
strong { color: #0d1b2a; }
a { color: #1e5f9f; text-decoration: none; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt;
       background: #f1f3f6; padding: 1pt 3.5pt; border-radius: 2.5pt; color: #7a2020; }
pre { background: #f6f8fa; border: 0.6pt solid #dde2e8; border-radius: 4pt;
      padding: 8pt; overflow-x: auto; font-size: 8.5pt; }
pre code { background: none; padding: 0; color: #1a1d21; }
blockquote { margin: 8pt 0; padding: 7pt 11pt; border-left: 3pt solid #c9a227;
             background: #fdfaf1; color: #3a3f45; }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0 11pt; font-size: 9pt;
        break-inside: avoid; page-break-inside: avoid; }
th { background: #0d1b2a; color: #fff; text-align: left; padding: 5pt 7pt;
     font-weight: 600; font-size: 8.5pt; }
td { border-bottom: 0.5pt solid #e2e6ea; padding: 5pt 7pt; vertical-align: top; }
tr:nth-child(even) td { background: #fafbfc; }
/* A trailing empty column is a write-in field on a printed worksheet — give it
   room and a rule to write on, rather than squeezing it to the header width. */
table.writein th:last-child, table.writein td:last-child { width: 26%; }
table.writein td:last-child { border-left: 0.5pt solid #e2e6ea; }
table.writein td { height: 26pt; }
ul, ol { margin: 0 0 8pt; padding-left: 17pt; }
li { margin-bottom: 3.5pt; }
hr { border: none; border-top: 0.6pt solid #d8dde3; margin: 16pt 0; }
/* The diagram container must NOT inherit the code-block chrome, or every
   diagram sits in a grey box sized to the un-rendered source. */
pre.mermaid, .mermaid {
  background: none !important; border: none !important; padding: 0 !important;
  text-align: center; margin: 14pt 0 18pt;
  break-inside: avoid; page-break-inside: avoid;
}
/* Width fills the column so labels are legible; max-height keeps a tall
   top-to-bottom diagram from spilling across three pages. With the viewBox
   intact the browser shrinks proportionally when the height limit binds. */
.mermaid svg {
  width: 100% !important; height: auto !important;
  max-height: 205mm !important; display: block; margin: 0 auto;
}
h2, h3 { break-before: auto; }
"""

TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>{css}</style></head>
<body>
{body}
<script>{mermaid}</script>
<script>
  const m = (window.mermaid) || (window.__esbuild_esm_mermaid_nm && window.__esbuild_esm_mermaid_nm.mermaid);
  m.initialize({{
    startOnLoad: false,
    theme: 'base',
    flowchart: {{ useMaxWidth: true, htmlLabels: true, padding: 8 }},
    stateDiagram: {{ useMaxWidth: true }},
    timeline: {{ useMaxWidth: true }},
    themeVariables: {{
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      fontSize: '17px',
      primaryColor: '#eef2f7',
      primaryTextColor: '#0d1b2a',
      primaryBorderColor: '#1e3a5f',
      lineColor: '#45525f',
      tertiaryColor: '#fdfaf1'
    }}
  }});

  // Mermaid stamps its own width/height and an inline max-width on each svg,
  // which is what made one diagram illegibly small and another overflow three
  // pages. Strip them and let the CSS above do the sizing from the viewBox.
  function normalize() {{
    document.querySelectorAll('.mermaid svg').forEach(svg => {{
      if (!svg.getAttribute('viewBox')) {{
        const w = parseFloat(svg.getAttribute('width')) || 800;
        const h = parseFloat(svg.getAttribute('height')) || 600;
        svg.setAttribute('viewBox', `0 0 ${{w}} ${{h}}`);
      }}
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.maxWidth = 'none';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }});
  }}

  m.run({{ querySelector: '.mermaid' }})
   .then(() => {{ normalize(); document.title += ' [ready]'; window.__done = true; }})
   .catch(e => {{ console.error('mermaid failed', e); normalize(); window.__done = true; }});
</script>
</body></html>
"""

# python-markdown emits <pre><code class="language-mermaid">…; mermaid needs
# a bare <pre class="mermaid"> holding the un-escaped source.
FENCE = re.compile(
    r'<pre><code class="language-mermaid">(.*?)</code></pre>', re.DOTALL
)


def convert(src: Path, out: Path) -> None:
    text = src.read_text()
    title = next(
        (ln.lstrip("# ").strip() for ln in text.splitlines() if ln.startswith("# ")),
        src.stem,
    )
    body = markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "sane_lists", "attr_list"],
    )
    body = FENCE.sub(
        lambda m: f'<pre class="mermaid">{html.unescape(m.group(1))}</pre>', body
    )
    # Tables whose last column is blank are worksheets to be filled in by hand.
    body = re.sub(
        r"<table>(?=(?:(?!</table>).)*?<th[^>]*>\s*They call it\s*</th>)",
        '<table class="writein">',
        body,
        flags=re.DOTALL,
    )
    out.write_text(
        TEMPLATE.format(
            title=html.escape(title), css=CSS, body=body, mermaid=_mermaid()
        )
    )
    print(f"{out}  ({len(FENCE.findall(markdown.markdown(text, extensions=['fenced_code'])))} diagrams)")


def to_pdf(src: Path, pdf: Path) -> None:
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        convert(src, page)
        pdf.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(  # noqa: S603
            [
                "google-chrome-stable",
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--no-pdf-header-footer",
                # Mermaid renders asynchronously; without a virtual-time budget
                # Chrome prints the page before any diagram exists.
                "--virtual-time-budget=45000",
                f"--print-to-pdf={pdf}",
                page.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
    print(f"wrote {pdf}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: md2pdf.py <input.md> <output.pdf>")
    to_pdf(Path(sys.argv[1]), Path(sys.argv[2]))
