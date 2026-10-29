"""Adds the artifact add-ons (highlighter, search, Clean view, Ask AI, Help, course colours) on top of the built page.

Run after build/build.py:
    python3 build/build.py
    python3 tools/add_addons.py

Reads   build/out.html  (artifact fragment from build.py) and addons/find.css, find.html, find.js
Writes  build/out-addons.html   artifact fragment: publish THIS with the Artifact tool
        dist/index-addons.html  the same thing as a normal full page (double-click to open; Ask AI stays hidden)
Every swap below is asserted to match exactly once, so a base-page change that breaks a hook fails loudly.
"""
import os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda *p: open(os.path.join(R, *p), encoding='utf-8').read()
body = rd('build', 'out.html').rstrip()
css, html, js = rd('addons', 'find.css'), rd('addons', 'find.html'), rd('addons', 'find.js')

def once(old, new=None, where=''):
    global body
    assert body.count(old) == 1, 'expected exactly one match for: ' + old[:70]
    body = body.replace(old, new if new is not None else old)

# 1) CSS goes before the first </style>
i = body.index('</style>'); body = body[:i] + css + body[i:]

# 2) top-bar buttons go before the spacer: Search, Clean view, Ask AI
search_btn = ('<button class="tb-btn sx-btn" id="open-search" type="button" aria-label="Search the notes" aria-haspopup="dialog">'
  '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/>'
  '<path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sx-lbl">Search</span><kbd>/</kbd></button>\n      ')
clean_btn = ('<button class="tb-btn cv-btn" id="toggle-clean" type="button" aria-pressed="false" title="Fewer boxes" aria-label="Clean view, fewer boxes">'
  '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>'
  '<path d="M6.5 8h7M6.5 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="cv-lbl">Clean view</span></button>\n      ')
ask_btn = ('<button class="tb-btn ask-top" id="open-ask" type="button" hidden aria-haspopup="dialog" aria-expanded="false" aria-label="Ask AI" title="Ask AI">'
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l1.7 4.8 4.8 1.7-4.8 1.7L10 15.5l-1.7-4.8L3.5 9l4.8-1.7z" fill="currentColor"/>'
  '<path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor"/></svg><span class="cv-lbl">Ask AI</span></button>\n      ')
sp = '<span class="spacer"></span>'
once(sp, search_btn + clean_btn + ask_btn + sp)

# 3) Help row is the last item of the course menu (not a .coursetab, so course-switch code ignores it)
phl = '<span class="dot"></span>Philosophy</button>'
pg_row = '<div class="pg-row" role="group" aria-label="Page colour"><span class="pg-lab">Page colour<b>Paper</b></span><button class="pg-sw" type="button" data-bg="paper" aria-label="Paper (default)" title="Paper (default)" aria-pressed="true"></button><button class="pg-sw" type="button" data-bg="pink" aria-label="Pink Pop" title="Pink Pop" aria-pressed="false"></button><button class="pg-sw" type="button" data-bg="green" aria-label="Matcha" title="Matcha" aria-pressed="false"></button><button class="pg-sw" type="button" data-bg="sepia" aria-label="Latte" title="Latte" aria-pressed="false"></button><button class="pg-sw" type="button" data-bg="sky" aria-label="Cloud" title="Cloud" aria-pressed="false"></button><button class="pg-sw" type="button" data-bg="bay" aria-label="Bay Street" title="Bay Street" aria-pressed="false"></button></div>'
once(phl, phl + '\n      ' + pg_row + '\n      <button class="hp-row" id="open-help" type="button" aria-haspopup="dialog"><b aria-hidden="true">?</b>Help &amp; shortcuts</button>')

# 4) overlays go before the main script
anchor = "<script>\n(function(){\n  'use strict';\n  var root = document.querySelector('.viz-root');"
once(anchor, html + '\n' + anchor)

# 5) course colours: HR pink (--hrc), Philosophy purple (--phl). Defined at the end of find.css.
for old, new in [
  ('data-course="hr" style="--tc:var(--aqua)"', 'data-course="hr" style="--tc:var(--hrc)"'),
  ('data-course="phl" style="--tc:var(--yellow)"', 'data-course="phl" style="--tc:var(--phl)"'),
  ('.course-panel[data-course="hr"]{ --tc: var(--aqua); }', '.course-panel[data-course="hr"]{ --tc: var(--hrc); }'),
  ('.course-panel[data-course="phl"]{ --tc: var(--yellow); }', '.course-panel[data-course="phl"]{ --tc: var(--phl); }'),
  ("hr:{name:'HR Management', cc:'var(--aqua)'}", "hr:{name:'HR Management', cc:'var(--hrc)'}"),
  ("phl:{name:'Philosophy', cc:'var(--yellow)'}", "phl:{name:'Philosophy', cc:'var(--phl)'}"),
]:
    once(old, new)

# 6) the add-on script goes last
body = body + '\n\n' + js.rstrip() + '\n'
open(os.path.join(R, 'build', 'out-addons.html'), 'w', encoding='utf-8').write(body)

# full page, same wrapper as tools/make_index.py plus [hidden]{display:none!important}
# (the Claude artifact skeleton already has that rule; a plain page does not, and the add-on overlays rely on it)
m = re.search(r'<title>.*?</title>', body, re.S)
title = m.group(0) if m else '<title>Semester 5 Study Maps</title>'
s = body.replace(title, '', 1)
page = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        + title + '<style>html,body{margin:0}body{background:#f2f4f1}[hidden]{display:none!important}'
        '@media (prefers-color-scheme:dark){body{background:#000}}</style></head><body>' + s + '</body></html>')
os.makedirs(os.path.join(R, 'dist'), exist_ok=True)
open(os.path.join(R, 'dist', 'index-addons.html'), 'w', encoding='utf-8').write(page)
print('wrote build/out-addons.html', len(body), 'bytes and dist/index-addons.html', len(page), 'bytes')
