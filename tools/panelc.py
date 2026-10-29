#!/usr/bin/env python3
"""panelc: compact panel format  <->  panel HTML.

  python3 tools/panelc.py compile  in.txt  out.html
  python3 tools/panelc.py decompile in.html out.txt     (also reports coverage)
  python3 tools/panelc.py check    in.html              (round-trip test)

Anything the compact format has no short form for is kept as a raw
'@html ... @end' block, so nothing is ever lost.
"""
import re, sys, copy, html as H
from bs4 import BeautifulSoup, NavigableString, Comment

DEF_TAG = {'def': 'Definition', 'ex': 'Example', 'trap': 'Exam trap', 'mem': 'Memory trick',
           'biz': 'Business angle', 'tip': 'Tip', 'math': 'Check the math', 'say': 'Quote'}
KINDS = set(DEF_TAG)

# ---------- inline: **bold**  *italic*  <-> <b> <i> ----------
def inl_in(s):
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'(?<![\*\w])\*(?=\S)(.+?)(?<=\S)\*(?![\*\w])', r'<i>\1</i>', s)
    return s

def inl_out(s):
    s = s.strip()
    s = re.sub(r'<b>(.*?)</b>', r'**\1**', s)
    s = re.sub(r'<i>(.*?)</i>', r'*\1*', s)
    return re.sub(r'\s*\n\s*', ' ', s)

def inner(el):
    return ''.join(str(c) for c in el.contents)

def sp(a):  # space-collapse
    return re.sub(r'\s+', ' ', a).strip()

# ---------- compile ----------
def c_call(kind, tag, body):
    tag = inl_in(tag) if tag else DEF_TAG[kind]
    return f'<div class="co co-{kind}"><span class="co-tag">{tag}</span>{inl_in(body)}</div>'

def c_q(lines):
    head = [x.strip() for x in lines[0][1:].split('|')]
    kind, lvl, tag = head[0], head[1], head[2]
    extra = dict(x.split('=', 1) for x in head[3:])
    attrs = f'class="q" data-kind="{kind}" data-lvl="{lvl}" data-tag="{tag}"'
    for k in ('src', 'answer', 'tol', 'unit'):
        if k in extra:
            attrs += f' data-{k}="{extra[k]}"'
    text, opts, exp, ref = [], [], [], None
    for ln in lines[1:]:
        if ln.startswith('~ '): ref = ln[2:]
        elif ln.startswith('- ') : opts.append((False, ln[2:]))
        elif ln.startswith('+ ') : opts.append((True, ln[2:]))
        elif ln.startswith('>> '): exp.append(('LOOSE', ln[3:]))
        elif ln.startswith('> '): exp.append(ln[2:])
        elif ln.startswith('<'): (exp if exp else text).append(('RAW', ln))
        else: text.append(ln)
    def para(x):
        if isinstance(x, tuple): return inl_in(x[1]) if x[0] == 'LOOSE' else x[1]
        return f'<p>{inl_in(x)}</p>'
    t = ''.join(para(x) for x in text)
    if ref: t = f'<p class="q-ref">{ref}</p>' + t
    out = f'<div {attrs}><div class="q-text">{t}</div>'
    if opts:
        out += '<ol class="q-opts">' + ''.join(
            f'<li{" data-correct" if ok else ""}>{inl_in(o)}</li>' for ok, o in opts) + '</ol>'
    out += '<div class="q-exp">' + ''.join(para(x) for x in exp) + '</div></div>'
    return out

def c_worked(lines):
    title = lines[0][len('@worked'):].strip()
    prob, steps, ans, why, tq, ta = '', [], '', '', '', ''
    for ln in lines[1:]:
        if ln.startswith('prob:'): prob = ln[5:].strip()
        elif re.match(r'\d+\. ', ln):
            t, _, b = ln.split(' ', 1)[1].partition(' :: ')
            steps.append((t, b))
        elif ln.startswith('ans:'):
            a, _, w = ln[4:].partition(' || why: ')
            ans, why = a.strip(), w.strip()
        elif ln.startswith('try:'):
            tq, _, ta = ln[4:].strip().partition(' || ')
    o = f'<div class="worked"><div class="worked-top"><span class="co-tag">Worked example</span><h3>{title}</h3></div>'
    o += f'<div class="worked-prob">{inl_in(prob)}</div><ol class="worked-steps">'
    o += ''.join(f'<li><span class="ws-t">{inl_in(t)}</span>{inl_in(b)}</li>' for t, b in steps) + '</ol>'
    o += f'<div class="worked-ans">{inl_in(ans)}' + (f'<span class="ws-why">{inl_in(why)}</span>' if why else '') + '</div>'
    if tq:
        o += f'<div class="worked-try"><div class="try-q">{inl_in(tq)}</div><div class="try-a">{inl_in(ta)}</div></div>'
    return o + '</div>'

def c_table(lines):
    rows = [[c.strip() for c in l.strip().strip('|').split('|')] for l in lines[1:] if not re.match(r'^\|[-| :]+\|?$', l.strip())]
    wcol = 'w' in lines[0].split()
    mw = re.search(r'\bmin=(\d+)', lines[0])
    o = '<div class="tbl"><table class="wt"' + (f' style="min-width:{mw.group(1)}px"' if mw else '') + '><thead><tr>' + ''.join(f'<th>{inl_in(c)}</th>' for c in rows[0]) + '</tr></thead><tbody>'
    for r in rows[1:]:
        o += '<tr>' + ''.join('<td' + (' class="w"' if (wcol and i == 0) else '') + '>' + inl_in(c) + '</td>' for i, c in enumerate(r)) + '</tr>'
    return o + '</tbody></table></div>'

def mt_style(head):
    m = re.search(r'\bmt=(\d+)', head)
    return f' style="margin-top:{m.group(1)}px"' if m else ''

def groups(lines):
    cards, cur = [], None
    for ln in lines[1:]:
        if ln.startswith('### '): cur = [ln[4:], []]; cards.append(cur)
        elif ln.startswith('- '): cur[1].append(ln[2:])
    return cards

def c_cards(lines):
    out = ''
    for t, its in groups(lines):
        m = re.match(r'\[(\w+): (.*?)\] (.*)$', t)
        badge = ''
        if m:
            badge = f'<span class="icn">{m.group(2)}</span>' if m.group(1) == 'icn' else f'<span class="tag {m.group(1)}">{m.group(2)}</span>'
            t = m.group(3)
        out += f'<div class="info-card">{badge}<h3>{inl_in(t)}</h3><ul>' + ''.join(f'<li>{inl_in(i)}</li>' for i in its) + '</ul></div>'
    return f'<div class="info-grid"{mt_style(lines[0])}>' + out + '</div>'

def c_compare(lines):
    out = ''
    for t, its in groups(lines):
        m = re.match(r'\[(\w+)\] (.*)$', t)
        out += (f'<div class="compare-col"><h3><span class="sw" style="background:var(--{m.group(1)})"></span>{inl_in(m.group(2))}</h3><ul>'
                + ''.join('<li>' + re.sub(r'\*\*(.+?)\*\*', r'<b style="color:var(--ink)">\1</b>', i) .replace('<b>', '<b>') + '</li>' for i in its) + '</ul></div>')
    return f'<div class="compare card"{mt_style(lines[0])}>' + out + '</div>'

def c_flow(lines):
    arrow = 'noarrow' not in lines[0].split()
    nodes = []
    for ln in lines[1:]:
        k, t, b = [x.strip() for x in ln.split(' | ', 2)]
        nodes.append(f'<div class="flow-node"><span class="k">{k}</span><h3>{inl_in(t)}</h3><p>{inl_in(b)}</p></div>')
    sep = ('<div class="flow-arrow">→</div>' if 'css' not in lines[0].split() else '<div class="flow-arrow"></div>') if arrow else ''
    return f'<div class="flow{"" if arrow else " no-arrow"}">' + sep.join(nodes) + '</div>'

def auto_cards(txt):
    """(term, definition) for every @def whose text starts with **Term**: the card back is the first sentence."""
    cards = []
    for ln in txt.split('\n'):
        m = re.match(r'@def(?:\[[^\]]*\])?:\s*\*\*(.+?)\*\*\s*(.*)$', ln)
        if not m: continue
        term, rest = m.group(1), m.group(2)
        rest = re.sub(r'^(is|are|means|refers to|:|-|–)\s+', '', rest.strip(), flags=re.I)
        sent = re.match(r'(.+?[.!?])(?:\s|$)', rest)
        back = (sent.group(1) if sent else rest).strip()
        if len(back) < 12: continue
        cards.append((term.strip(), back[0].upper() + back[1:]))
    return cards

def c_flash(lines, auto=()):
    lines = ['@flash'] + lines[1:]
    have = {l.partition(' :: ')[0].strip().lower() for l in lines[1:] if ' :: ' in l}
    extra = [f'{t} :: {d}' for t, d in auto if t.lower() not in have]
    lines = lines[:1] + extra + lines[1:]
    return '<div class="cards-grid">' + ''.join(
        f'<details class="flash"><summary>{t}</summary><p>{inl_in(d)}</p></details>'
        for t, _, d in (l.partition(' :: ') for l in lines[1:] if ' :: ' in l)) + '</div>'

def c_fig(line):
    p = line.split()
    name = p[1]; st = ''
    kv = dict(x.split('=') for x in p[2:])
    parts = []
    if 'max' in kv: parts.append(f'max-width:{kv["max"]}px')
    if 'mt' in kv: parts.append(f'margin-top:{kv["mt"]}px')
    if parts: st = f' style="{";".join(parts)}"'
    return f'<div class="card viz-chart"{st}>{{{{svg:{name}}}}}</div>'

def compile_text(txt):
    lines = txt.split('\n')
    i, out, prefix, in_sec = 0, [], '', False
    def close():
        nonlocal in_sec
        if in_sec: out.append('</section>'); in_sec = False
    while i < len(lines):
        ln = lines[i]
        if not ln.strip() or ln.startswith('//'): i += 1; continue
        if ln.startswith('# '):
            course, wk = ln[2:].split()
            prefix = f'{course}-{wk}-'
            out.append(f'<div class="week-panel active" data-week="{wk}">'); i += 1; continue
        if ln.startswith('## '):
            close()
            sid, _, title = ln[3:].partition(' | ')
            sid, _, scl = sid.strip().partition('.')
            scl = f' class="{scl}"' if scl else ''
            out.append(f'<section{scl} id="{prefix}{sid.strip()}"><div class="section-head"><h2>{inl_in(title.strip())}</h2></div>')
            in_sec = True; i += 1; continue
        if ln.strip() == '@close': close(); i += 1; continue
        if ln.startswith('@html'):
            j = i + 1
            while lines[j].strip() != '@end': j += 1
            out.append('\n'.join(lines[i + 1:j])); i = j + 1; continue
        # gather block = consecutive non-blank lines
        j = i
        while j < len(lines) and lines[j].strip(): j += 1
        blk = lines[i:j]; i = j
        h = blk[0]
        m = re.match(r'@(\w+)(?:\[(.*?)\])?:\s?(.*)$', h)
        if m and m.group(1) in KINDS:
            out.append(c_call(m.group(1), m.group(2), m.group(3)))
        elif h.startswith('sub:'):
            out.append(f'<p class="section-sub">{inl_in(h[4:].strip())}</p>')
        elif h.startswith('sub-late:'):
            out.append(f'<p class="section-sub" style="margin-top:22px">{inl_in(h[9:].strip())}</p>')
        elif h.startswith('? '):
            out.append(c_q(blk))
        elif h.startswith('@worked'): out.append(c_worked(blk))
        elif h.startswith('@table'): out.append(c_table(blk))
        elif h.startswith('@cards'): out.append(c_cards(blk))
        elif h.startswith('@compare'): out.append(c_compare(blk))
        elif h.startswith('@flow'): out.append(c_flow(blk))
        elif h.startswith('@h3'):
            mm = re.match(r'@h3(?: mt=(\d+))?: (.*)$', h)
            st = (' style="margin-top:' + mm.group(1) + 'px"') if mm.group(1) else ''
            out.append('<h3' + st + '>' + inl_in(mm.group(2)) + '</h3>')
        elif h.startswith('@note:'):
            out.append(f'<p style="font-size:0.9rem;color:var(--ink-2)">{inl_in(h[6:].strip())}</p>')
        elif h.startswith('@flash'): out.append(c_flash(blk, auto_cards(txt) if 'auto' in h.split() else ()))
        elif h.startswith('@fig'): out.append(c_fig(h))
        elif h.startswith('@lo'):
            lis = ''.join(f'<li>{inl_in(x[2:])}</li>' for x in blk[1:] if x.startswith('- '))
            meta = ''
            out.append(f'<div class="wp-intro"><div class="card lo"><h3>By the end of this chapter you can…</h3><ul>{lis}</ul></div>@@META@@</div>')
        elif h.startswith('@meta'):
            sp_ = ''.join(f'<span><b>{a}</b> {inl_in(b)}</span>' for a, _, b in (x.partition(' :: ') for x in blk[1:]))
            for k in range(len(out) - 1, -1, -1):
                if '@@META@@' in out[k]:
                    out[k] = out[k].replace('@@META@@', f'<div class="wp-meta">{sp_}</div>'); break
        else:
            out.append(f'<p>{inl_in(" ".join(blk))}</p>')
    close()
    out.append('</div>')
    res = '\n'.join(out).replace('@@META@@', '')
    # keep a line break between block elements, like hand-written HTML, so textContent
    # (search, Ask AI, cheat sheet) never glues two list items or cells into one word
    return re.sub(r'(</(?:li|p|tr|td|th|h2|h3|ol|ul|summary|details|div|section)>)(?=<)', r'\1\n', res)

# ---------- decompile ----------
def canon(el):
    if isinstance(el, Comment): return ('#c', str(el).strip())
    if isinstance(el, NavigableString): return sp(str(el))
    kids = [canon(c) for c in el.children]
    kids = [k for k in kids if k != '']
    # merge adjacent strings
    m = []
    for k in kids:
        if isinstance(k, str) and m and isinstance(m[-1], str): m[-1] = sp(m[-1] + ' ' + k)
        else: m.append(k)
    return (el.name, tuple(sorted((k, ' '.join(v) if isinstance(v, list) else v) for k, v in el.attrs.items())), tuple(m))

def canon_html(h):
    s = BeautifulSoup(h, 'html.parser')
    return [canon(c) for c in s.children if not (isinstance(c, NavigableString) and not str(c).strip())]

def d_call(el):
    kind = el['class'][1][3:]
    if kind not in KINDS or el.find('span', class_='co-tag') is None: return None
    tag = el.find('span', class_='co-tag')
    t = sp(tag.get_text())
    tl = inl_out(inner(tag))
    tag.extract()
    body = inl_out(inner(el))
    return f'@{kind}' + ('' if t == DEF_TAG[kind] else f'[{tl}]') + f': {body}'

def d_q(el):
    a = el.attrs
    head = f'? {a["data-kind"]} | {a["data-lvl"]} | {a["data-tag"]}'
    for k in ('src', 'answer', 'tol', 'unit'):
        if f'data-{k}' in a: head += f' | {k}={a["data-"+k]}'
    L = [head]
    qt = el.find(class_='q-text')
    for ch in qt.children:
        if getattr(ch, 'name', None) == 'p' and ch.get('class') == ['q-ref']: L.append('~ ' + sp(ch.get_text()))
        elif getattr(ch, 'name', None) == 'p' and not ch.attrs: L.append(inl_out(inner(ch)))
        elif isinstance(ch, NavigableString) and not str(ch).strip(): pass
        else: L.append(sp(str(ch)))
    ol = el.find('ol', class_='q-opts')
    if ol:
        for li in ol.find_all('li', recursive=False):
            L.append(('+ ' if li.has_attr('data-correct') else '- ') + inl_out(inner(li)))
    ex = el.find(class_='q-exp')
    if any(getattr(c, 'name', None) != 'p' and str(c).strip() for c in ex.children):
        L.append('>> ' + inl_out(inner(ex)))
        return '\n'.join(L)
    for ch in ex.children:
        if getattr(ch, 'name', None) == 'p' and not ch.attrs: L.append('> ' + inl_out(inner(ch)))
        elif isinstance(ch, NavigableString) and not str(ch).strip(): pass
        else: L.append(sp(str(ch)))
    return '\n'.join(L)

def d_worked(el):
    L = ['@worked ' + sp(el.select_one('.worked-top h3').get_text())]
    L.append('prob: ' + inl_out(inner(el.select_one('.worked-prob'))))
    for n, li in enumerate(el.select('.worked-steps > li'), 1):
        t = li.select_one('.ws-t'); ts = inl_out(inner(t)); t.extract()
        L.append(f'{n}. {ts} :: {inl_out(inner(li))}')
    a = el.select_one('.worked-ans'); w = a.select_one('.ws-why')
    ws = inl_out(inner(w)) if w else ''
    if w: w.extract()
    L.append('ans: ' + inl_out(inner(a)) + (f' || why: {ws}' if ws else ''))
    ty = el.select_one('.worked-try')
    if ty: L.append('try: ' + inl_out(inner(ty.select_one('.try-q'))) + ' || ' + inl_out(inner(ty.select_one('.try-a'))))
    return '\n'.join(L)

def d_table(el):
    t = el.find('table')
    if el.get('class') != ['tbl'] or t is None or t.get('class') != ['wt']: return None
    mw = re.fullmatch(r'min-width:(\d+)px', t.get('style', '')) if t.get('style') else None
    if t.get('style') and not mw: return None
    rows = t.find_all('tr')
    wcol = all(r.find('td').get('class') == ['w'] for r in rows[1:]) if len(rows) > 1 else False
    L = ['@table' + (' w' if wcol else '') + (f' min={mw.group(1)}' if mw else '')]
    for r in rows:
        L.append('| ' + ' | '.join(inl_out(inner(c)) for c in r.find_all(['th', 'td'])) + ' |')
        if r is rows[0]: L.append('|' + '---|' * len(r.find_all('th')))
    return '\n'.join(L)

def d_mt(el):
    st = el.get('style')
    if st is None: return ''
    m = re.fullmatch(r'margin-top:(\d+)px', st)
    return f' mt={m.group(1)}' if m else None

def d_cards(el):
    mt = d_mt(el)
    if mt is None: return None
    L = ['@cards' + mt]
    for c in el.find_all(class_='info-card', recursive=False):
        badge = ''
        sp_ = c.find('span', recursive=False)
        if sp_ is not None:
            cls = sp_.get('class', [])
            badge = f'[icn: {sp_.get_text()}] ' if cls == ['icn'] else (f'[{cls[1]}: {sp_.get_text()}] ' if cls[:1] == ['tag'] and len(cls) == 2 else None)
            if badge is None: return None
        L.append('### ' + badge + inl_out(inner(c.find('h3'))))
        for li in c.find_all('li'): L.append('- ' + inl_out(inner(li)))
    return '\n'.join(L)

def d_compare(el):
    mt = d_mt(el)
    if mt is None: return None
    L = ['@compare' + mt]
    for c in el.find_all(class_='compare-col', recursive=False):
        sw = c.find('span', class_='sw')
        m = re.fullmatch(r'background:var\(--(\w+)\)', sw.get('style', ''))
        if not m: return None
        sw.extract()
        L.append(f'### [{m.group(1)}] ' + inl_out(inner(c.find('h3'))))
        for li in c.find_all('li'):
            L.append('- ' + inl_out(inner(li).replace('<b style="color:var(--ink)">', '<b>')))
    return '\n'.join(L)

def d_flow(el):
    cl = el.get('class')
    if cl not in (['flow'], ['flow', 'no-arrow']): return None
    ar = [a.get_text() for a in el.find_all(class_='flow-arrow', recursive=False)]
    css = bool(ar) and all(x == '' for x in ar)
    L = ['@flow' + ('' if cl == ['flow'] else ' noarrow') + (' css' if css else '')]
    for n in el.find_all(class_='flow-node', recursive=False):
        L.append(sp(n.find('span', class_='k').get_text()) + ' | ' + inl_out(inner(n.find('h3'))) + ' | ' + inl_out(inner(n.find('p'))))
    return '\n'.join(L)

def d_flash(el):
    L = ['@flash']
    for d in el.find_all('details', recursive=False):
        L.append(sp(d.find('summary').get_text()) + ' :: ' + inl_out(inner(d.find('p'))))
    return '\n'.join(L)

def d_fig(el):
    m = re.fullmatch(r'\s*\{\{svg:([\w-]+)\}\}\s*', inner(el))
    if not m: return None
    st = dict(x.split(':') for x in (el.get('style') or '').split(';') if x)
    o = f'@fig {m.group(1)}'
    if 'max-width' in st: o += f' max={st["max-width"].replace("px","")}'
    if 'margin-top' in st: o += f' mt={st["margin-top"].replace("px","")}'
    return o

def d_block(el):
    """returns compact text or None (-> raw)"""
    if isinstance(el, Comment): return None
    n, cl = el.name, el.get('class', [])
    if n == 'div' and 'q' in cl: return d_q(el)
    if n == 'div' and cl[:1] == ['co']: return d_call(el)
    if n == 'div' and cl == ['worked']: return d_worked(el)
    if n == 'div' and cl == ['tbl']: return d_table(el)
    if n == 'div' and cl == ['info-grid']: return d_cards(el)
    if n == 'div' and cl == ['compare', 'card']: return d_compare(el)
    if n == 'div' and (cl == ['flow'] or cl == ['flow', 'no-arrow']): return d_flow(el)
    if n == 'h3':
        st = el.get('style')
        if st is None: return '@h3: ' + inl_out(inner(el))
        m = re.fullmatch(r'margin-top:(\d+)px', st)
        return f'@h3 mt={m.group(1)}: ' + inl_out(inner(el)) if m else None
    if n == 'p' and el.get('style') == 'font-size:0.9rem;color:var(--ink-2)' and not cl: return '@note: ' + inl_out(inner(el))
    if n == 'div' and cl == ['cards-grid']: return d_flash(el)
    if n == 'div' and cl == ['card', 'viz-chart']: return d_fig(el)
    if n == 'p' and cl == ['section-sub']:
        st = el.get('style')
        return 'sub: ' + inl_out(inner(el)) if not st else ('sub-late: ' + inl_out(inner(el)) if st == 'margin-top:22px' else None)
    if n == 'p' and not el.attrs: return inl_out(inner(el))
    return None

def try_block(el):
    try:
        import copy
        t = d_block(copy.copy(el))
        if t is None or '\n\n' in t: return None
        got = compile_text('# x y\n## s | t\n' + t)
        sec = BeautifulSoup(got, 'html.parser').find('section')
        kids = [c for c in sec.children if not (isinstance(c, NavigableString) and not str(c).strip())]
        cand = kids[1:]
        if len(cand) == 1 and canon(cand[0]) == canon(el): return t
    except Exception:
        return None
    return None

def decompile_html(h):
    soup = BeautifulSoup(h, 'html.parser')
    root = soup.find('div', class_='week-panel')
    wk = root['data-week']
    first_sec = root.find('section')
    course = first_sec['id'].split('-')[0]
    prefix = f'{course}-{wk}-'
    out = [f'# {course} {wk}', '']
    stats = {'compact': 0, 'raw': 0, 'raw_chars': 0}
    def raw(el):
        stats['raw'] += 1; s = ('<!--%s-->' % el) if isinstance(el, Comment) else str(el); stats['raw_chars'] += len(s)
        if el.parent is root: out.append('@close')
        out.append('@html\n' + s + '\n@end'); out.append('')
    for el in root.children:
        if isinstance(el, NavigableString) and not str(el).strip(): continue
        if isinstance(el, Comment): raw(el); continue
        cl = el.get('class', [])
        if el.name == 'div' and cl == ['wp-intro']:
            lo = el.select('.lo li'); me = el.select('.wp-meta > span')
            t1 = '@lo\n' + '\n'.join('- ' + inl_out(inner(li)) for li in lo)
            t2 = '@meta\n' + '\n'.join(sp(s.find('b').get_text()) + ' :: ' + inl_out(inner(s).split('</b>', 1)[1]) for s in me)
            test = compile_text('# x y\n' + t1 + '\n\n' + t2)
            if canon_html(test)[0][2][0] == canon(el):
                out += [t1, '', t2, '']; stats['compact'] += 1
            else: raw(el)
        elif el.name == 'section':
            sid = el['id'][len(prefix):]
            scl = ('.' + ' '.join(el['class'])) if el.get('class') else ''
            out.append(f'## {sid}{scl} | {inl_out(inner(el.find("h2")))}'); out.append('')
            for ch in el.children:
                if isinstance(ch, NavigableString) and not str(ch).strip(): continue
                if getattr(ch, 'name', None) == 'div' and ch.get('class') == ['section-head']: continue
                t = try_block(ch) if not isinstance(ch, Comment) else None
                if t: out.append(t); out.append(''); stats['compact'] += 1
                else: raw(ch)
        else:
            out.append('@close')
            t = try_block(el)
            if t: out.append(t); out.append(''); stats['compact'] += 1
            else: raw(el)
    return '\n'.join(out), stats

# ---------- lint ----------
def slide_numbers(text):
    """slide numbers mentioned like 'Slides 6 to 10', 'Slide 4', 'slides 8 and 9', '(slide 15)'."""
    got = set()
    for m in re.finditer(r'[Ss]lides?\s+((?:\d+(?:\s*(?:,|and|to|-|\u2013)\s*)?)+)', text):
        nums = re.findall(r'\d+|to|-|\u2013', m.group(1))
        i = 0
        while i < len(nums):
            if nums[i].isdigit():
                a = int(nums[i])
                if i + 2 < len(nums) and nums[i + 1] in ('to', '-', '\u2013') and nums[i + 2].isdigit():
                    got.update(range(a, int(nums[i + 2]) + 1)); i += 3; continue
                got.add(a)
            i += 1
    return got

def lint(txt, slides=0):
    """returns (errors, warnings). Errors would give a broken or wrong question; warnings are style/coverage."""
    err, warn = [], []
    try: html = compile_text(txt)
    except Exception as e: return ['does not compile: %r' % e], []
    s = BeautifulSoup(html, 'html.parser')
    ids = [x.get('id') for x in s.find_all('section')]
    for i in {x for x in ids if ids.count(x) > 1}: err.append('duplicate section id ' + str(i))
    qs = s.select('.q')
    for n, q in enumerate(qs, 1):
        a = q.attrs; k = a.get('data-kind'); tag = a.get('data-tag', '')
        name = 'question %d (%s, "%s")' % (n, k, tag[:30])
        if k not in ('mcq', 'multi', 'num', 'apply', 'short', 'explain'): err.append(name + ': unknown kind')
        if a.get('data-lvl') not in ('1', '2', '3'): err.append(name + ': level must be 1, 2 or 3')
        if not tag.strip(): err.append(name + ': empty tag')
        opts = q.select('.q-opts > li'); ok = q.select('.q-opts > li[data-correct]')
        if k == 'mcq' and (len(opts) < 3 or len(ok) != 1): err.append(name + ': needs 3+ options and exactly one + (has %d options, %d correct)' % (len(opts), len(ok)))
        if k == 'multi' and (len(ok) < 2 or len(ok) == len(opts)): err.append(name + ': needs 2+ correct options and at least one wrong one')
        if k in ('short', 'apply', 'explain') and opts: err.append(name + ': has options, use mcq or multi')
        if k == 'num':
            try: float(a.get('data-answer', '')); float(a.get('data-tol', ''))
            except ValueError: err.append(name + ': answer= and tol= must be numbers')
        ex = q.select_one('.q-exp')
        if ex is None or not ex.get_text(strip=True): err.append(name + ': no explanation')
        elif k in ('short', 'explain') and 'model answer' not in ex.get_text().lower(): warn.append(name + ': no "Model answer:" in the explanation')
    nq = len(qs)
    st = s.select('section.selftest .q') or qs
    if st and not (12 <= len(st) <= 40): warn.append('%d self-test questions (usual: 12 to 18 per chapter)' % len(st))
    if sum(1 for q in qs if q.get('data-lvl') == '3') < 4: warn.append('fewer than 4 level-3 questions')
    nsec = len(ids)
    if nsec < 5: warn.append('only %d sections (usual: 8 to 14)' % nsec)
    if not s.select('.worked'): warn.append('no worked example')
    if len(s.select('details.flash')) < 8: warn.append('only %d flash cards (usual: 12 to 25; use @flash auto and start @def with **Term**)' % len(s.select('details.flash')))
    if not s.select('.lo li'): warn.append('no learning goals (@lo)')
    body = s.get_text(' ')
    for w in ('genuinely', 'honestly', 'straightforward', 'lorem ipsum'):
        if re.search(r'\b' + w + r'\b', body, re.I): warn.append('contains "%s"' % w)
    if body.count('\u2014') > 3: warn.append('%d em dashes (reads as AI writing; use commas, colons or full stops)' % body.count('\u2014'))
    if re.search('[\U0001F300-\U0001FAFF\u2600-\u27BF]', body.replace('\u2713', '').replace('\u2717', '')): warn.append('emoji found')
    if slides:
        miss = sorted(set(range(1, slides + 1)) - slide_numbers(txt))
        if miss: warn.append('slides not mentioned anywhere (cover them or list them as skipped at the end): ' + ', '.join(map(str, miss)))
    return err, warn

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'compile':
        open(sys.argv[3], 'w').write(compile_text(open(sys.argv[2]).read()))
    elif cmd == 'decompile':
        t, st = decompile_html(open(sys.argv[2]).read())
        open(sys.argv[3], 'w').write(t); print(st)
    elif cmd == 'lint':
        slides = int(sys.argv[sys.argv.index('--slides') + 1]) if '--slides' in sys.argv else 0
        e, w = lint(open(sys.argv[2]).read(), slides)
        for x in e: print('ERROR  ', x)
        for x in w: print('warning', x)
        print('LINT', 'FAILED' if e else 'OK', '(%d errors, %d warnings)' % (len(e), len(w))); sys.exit(1 if e else 0)
    elif cmd == 'check':
        src = open(sys.argv[2]).read()
        t, st = decompile_html(src)
        back = compile_text(t)
        same = canon_html(src)[0] == canon_html(back)[0]
        print('round-trip identical:', same, st, 'bytes', len(src), '->', len(t))
