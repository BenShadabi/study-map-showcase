"""Wrap build/out.html (an artifact fragment) into a normal full page: dist/index.html.
Run after build/build.py.  Usage:  python3 tools/make_index.py"""
import os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(R, 'build', 'out.html'), encoding='utf-8').read()
m = re.search(r'<title>.*?</title>', s, re.S)
title = m.group(0) if m else '<title>Semester 5 Study Maps</title>'
s = s.replace(title, '', 1)
page = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        + title + '<style>html,body{margin:0}body{background:#f2f4f1}'
        '@media (prefers-color-scheme:dark){body{background:#000}}</style></head><body>'
        + s + '</body></html>')
os.makedirs(os.path.join(R, 'dist'), exist_ok=True)
open(os.path.join(R, 'dist', 'index.html'), 'w', encoding='utf-8').write(page)
print('wrote dist/index.html', len(page), 'bytes')
