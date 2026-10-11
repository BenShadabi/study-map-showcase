"""usage: python3 check_panel.py <course> <week>  -> static checks on new/<course>/<week>.html"""
import re,sys,os,collections
B=os.path.dirname(os.path.abspath(__file__))
c,w=sys.argv[1],sys.argv[2]
s=open(f'{B}/new/{c}/{w}.html',encoding='utf-8').read()
bad=0
def err(m):
    global bad; bad+=1; print('FAIL',m)
for t in ['div','section','svg','details','ol','ul','table','tr','td','th','thead','tbody','g','defs','text','marker','pre','li','p','b','i','span']:
    o=len(re.findall(r'<%s[\s>]'%t,s)); cl=len(re.findall(r'</%s>'%t,s))
    # self-closing svg children not counted for g/text
    if o!=cl: err(f'tag <{t}> open {o} close {cl}')
ids=re.findall(r'\bid="([^"]+)"',s)
for k,v in collections.Counter(ids).items():
    if v>1: err('duplicate id '+k)
pref=f'{c}-{w}-'
for m in re.finditer(r'<(section|div|svg|marker|g)[^>]*\bid="([^"]+)"',s):
    if not m.group(2).startswith(pref) and not m.group(2).startswith(c+'-'+w): err('id not prefixed with %s : %s'%(pref,m.group(2)))
if not re.search(r'<div class="week-panel[^"]*" data-week="%s"'%w,s): err('missing week-panel root with data-week="%s"'%w)
qs=re.findall(r'<div class="q"[^>]*>.*?(?=<div class="q"|</section>)',s,flags=re.S)
kinds=collections.Counter()
for q in qs:
    k=re.search(r'data-kind="(\w+)"',q); k=k.group(1) if k else '?'
    kinds[k]+=1
    if k=='mcq':
        n=len(re.findall(r'<li[^>]*data-correct',q)); no=len(re.findall(r'<li',q))
        if n!=1: err('mcq with %d correct: %s'%(n,re.sub(r'<[^>]+>','',q)[:70]))
        if no<3 or no>5: err('mcq has %d options'%no)
    if '<div class="q-exp"' not in q: err('question without q-exp')
    if '<div class="q-text"' not in q: err('question without q-text')
print('questions',len(qs),dict(kinds),'| worked',s.count('class="worked"'),'| co callouts',len(re.findall(r'class="co ',s)),'| svgs',s.count('<svg')+s.count('{{svg:'),'| bytes',len(s))
for m in re.findall(r'\{\{svg:([\w-]+)\}\}',s):
    if not os.path.exists(f'{B}/new/svg/{m}.svg') and m not in __import__('json').load(open(B+'/pilot_svgs.json')): err('missing svg file '+m)
if '<script' in s: err('no <script> allowed')
if re.search(r'localStorage|sessionStorage',s): err('no storage use in panels')
print('OK' if not bad else 'PROBLEMS: %d'%bad)
