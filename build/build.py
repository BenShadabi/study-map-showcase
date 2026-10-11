import json, re, os, sys
B=os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(B,p),encoding='utf-8').read()
head=rd('old_head_and_script.html')
css=rd('shell/v2.css')+'\n'+rd('shell/theme.css')+'\n'+rd('shell/apple.css')
assert head.count('</style>')==1
head=head.replace('</style>',css+'\n</style>')
man=json.load(open(os.path.join(B,'old/manifest.json')))
# tab labels (can be overridden by new/<course>/tabs.json)
order=['micro','mkt','hr','sa','phl']
parts=[head]
parts.append('''<div class="viz-root">

  <div class="topbar">
    <div class="brand-row">
      <div class="brand">Semester 5<small>Study Maps · George Brown College</small></div>
      <button class="picker" id="course-pick" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="coursetabs"><i class="pd"></i><span class="pn">Microeconomics</span><span class="pc" aria-hidden="true">&#9662;</span></button>
      <span class="spacer"></span>
      <button class="tb-btn" id="open-sheet" type="button"><span class="long">Cheat sheet</span><span class="short">Sheet</span></button>
      <button class="tb-btn primary" id="open-exam" type="button">Exam<span class="long"> mode</span> <span class="badge" id="exam-due" hidden>0</span></button>
    </div>
    <nav class="coursetabs" id="coursetabs" aria-label="Courses">
      <button class="coursetab plan" data-course="plan"><span class="dot"></span>Plan</button>
      <button class="coursetab active" data-course="micro" style="--tc:var(--blue)"><span class="dot"></span>Microeconomics</button>
      <button class="coursetab" data-course="mkt" style="--tc:var(--orange)"><span class="dot"></span>Marketing</button>
      <button class="coursetab" data-course="hr" style="--tc:var(--aqua)"><span class="dot"></span>HR Management</button>
      <button class="coursetab" data-course="sa" style="--tc:var(--grn)"><span class="dot"></span>Search Analytics</button>
      <button class="coursetab" data-course="phl" style="--tc:var(--yellow)"><span class="dot"></span>Philosophy</button>
    </nav>
  </div>

  <main id="panels">
''')
parts.append(rd('shell/plan.html'))
stats={}
for c in order:
    newdir=os.path.join(B,'new',c)
    tabs_new=os.path.join(newdir,'tabs.json')
    if os.path.exists(tabs_new):
        tabs=json.load(open(tabs_new))   # list of [week,label]
    else:
        tabs=man[c]['tabs']
    hd=rd('old/%s/_head.html'%c)
    if os.path.exists(os.path.join(newdir,'_head.html')): hd=open(os.path.join(newdir,'_head.html'),encoding='utf-8').read()
    parts.append('  <!-- ===== %s ===== -->\n  '%c.upper()+hd)
    parts.append('    <nav class="weektabs" data-scope="%s">\n'%c)
    for i,(w,l) in enumerate(tabs):
        parts.append('      <button class="weektab%s" data-week="%s">%s</button>\n'%(' active' if i==0 else '',w,l))
    parts.append('    </nav>\n\n')
    n_new=0
    for i,(w,l) in enumerate(tabs):
        p_new=os.path.join(newdir,w+'.html')
        if os.path.exists(p_new): h=open(p_new,encoding='utf-8').read(); n_new+=1
        else: h=rd('old/%s/%s.html'%(c,w))
        # first panel visible, others hidden
        h=re.sub(r'<div class="week-panel[^"]*" data-week="%s"[^>]*>'%re.escape(w),'<div class="week-panel%s" data-week="%s"%s>'%(' active' if i==0 else '',w,'' if i==0 else ' hidden'),h,count=1)
        parts.append('    '+h.strip()+'\n\n')
    tl=rd('old/%s/_tail.html'%c)
    if os.path.exists(os.path.join(newdir,'_tail.html')): tl=open(os.path.join(newdir,'_tail.html'),encoding='utf-8').read()
    parts.append(tl+'\n')
    stats[c]=(len(tabs),n_new)
parts.append('''  </main>

  <footer class="note">Semester 5 study maps · updated as new lecture slides come in. Sources cited at the bottom of each course tab.</footer>

''')
parts.append(rd('shell/overlays.html'))
parts.append('\n</div>\n\n<script>\n'+rd('shell/app.js')+'\n</script>\n')
out=''.join(parts)
out=out.replace('family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600','family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Inter:wght@400;500;600;700')
out=re.sub(r'font-family:\s*"IBM Plex Mono"[^;}]*','font-family: "Inter", system-ui, sans-serif; font-variant-numeric: tabular-nums',out)
out=re.sub(r'font-family:\s*"Inter"[^;}]*','font-family: var(--f-body)',out)
out=re.sub(r'font-family:\s*"Fraunces"[^;}]*','font-family: var(--f-head)',out)
out=re.sub(r'<link[^>]*fonts\.g(oogleapis|static)\.com[^>]*>\s*','',out)
out=re.sub(r'font-family:\s*"Inter", system-ui, sans-serif','font-family: var(--f-body)',out)
svgs=json.load(open(os.path.join(B,'pilot_svgs.json')))
import glob
for f in glob.glob(os.path.join(B,'new','svg','*.svg')): svgs[os.path.basename(f)[:-4]]=open(f,encoding='utf-8').read().strip()
def _svg(m):
    k=m.group(1)
    if k not in svgs: raise SystemExit('missing svg '+k)
    return svgs[k]
out=out.replace(' height="auto"','')
out=re.sub(r'\{\{svg:([\w-]+)\}\}',_svg,out)
open(os.environ.get('S5_OUT',os.path.join(B,'out.html')),'w',encoding='utf-8').write(out)
print('built',len(out),stats)
