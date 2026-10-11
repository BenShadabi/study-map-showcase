import json
def bez(p0,p1,p2,p3,t):
    x=(1-t)**3*p0[0]+3*(1-t)**2*t*p1[0]+3*(1-t)*t**2*p2[0]+t**3*p3[0]
    y=(1-t)**3*p0[1]+3*(1-t)**2*t*p1[1]+3*(1-t)*t**2*p2[1]+t**3*p3[1]
    return round(x,1),round(y,1)
out={}
# ---------- budget line
X=lambda p:50+p*340/24
Y=lambda r:260-r*230/12
def pt(p,r): return round(X(p),1),round(Y(r),1)
s=['<svg viewBox="0 0 420 310" width="100%" role="img" aria-label="Budget line: roads on the vertical axis, bike paths on the horizontal axis">']
s.append('<rect x="50" y="30" width="340" height="230" fill="none" stroke="var(--line)"/>')
# attainable fill
s.append('<polygon points="%s,%s %s,%s %s,%s" fill="var(--aqua)" opacity="0.12"/>'%(50,260,50,30,390,260))
for p in range(0,25,3):
    x=X(p); s.append('<line x1="%.1f" y1="260" x2="%.1f" y2="265" stroke="var(--muted)"/><text x="%.1f" y="278" text-anchor="middle" font-size="10" fill="var(--ink-2)">%d</text>'%(x,x,x,p))
for r in range(0,13,3):
    y=Y(r); s.append('<line x1="45" y1="%.1f" x2="50" y2="%.1f" stroke="var(--muted)"/><text x="40" y="%.1f" text-anchor="end" font-size="10" fill="var(--ink-2)">%d</text>'%(y,y,y+3.5,r))
s.append('<line x1="50" y1="30" x2="390" y2="260" stroke="var(--aqua)" stroke-width="2.5"/>')
s.append('<text x="262" y="132" font-size="11" fill="var(--aqua)" font-weight="700" transform="rotate(34 262 132)" text-anchor="middle">Budget line ($12m)</text>')
pts={'a':(15,9,'var(--red)','outside'),'c':(6,9,'var(--ink)','on'),'b':(12,6,'var(--ink)','on')}
for k,(p,r,col,_) in pts.items():
    x,y=pt(p,r); s.append('<circle cx="%s" cy="%s" r="5" fill="%s"/>'%(x,y,col))
xa,ya=pt(15,9); xc,yc=pt(6,9); xb,yb=pt(12,6)
s.append('<text x="%s" y="%s" font-size="12" font-weight="700" fill="var(--red)">a</text>'%(xa+9,ya+4))
s.append('<text x="%s" y="%s" font-size="12" font-weight="700" fill="var(--ink)">c</text>'%(xc-4,yc-9))
s.append('<text x="%s" y="%s" font-size="12" font-weight="700" fill="var(--ink)">b</text>'%(xb+8,yb-6))
s.append('<text x="%s" y="%s" font-size="10.5" fill="var(--red)">can\'t afford</text>'%(xa+9,ya+18))
s.append('<text x="220" y="300" text-anchor="middle" font-size="11" fill="var(--ink-2)">Kilometres of new bike paths ($0.5m per km)</text>')
s.append('<text x="12" y="145" text-anchor="middle" font-size="11" fill="var(--ink-2)" transform="rotate(-90 12 145)">Kilometres of road repair ($1m per km)</text>')
s.append('</svg>')
out['budget']=''.join(s)
# ---------- PPB
P0,P1,P2,P3=(60,45),(240,45),(350,110),(360,258)
curve='M%s,%s C%s,%s %s,%s %s,%s'%(P0+P1+P2+P3)
s=['<svg viewBox="0 0 420 310" width="100%" role="img" aria-label="Production possibilities boundary with attainable, inefficient and unattainable points">']
s.append('<rect x="50" y="30" width="340" height="230" fill="none" stroke="var(--line)"/>')
s.append('<path d="%s L 60,258 Z" fill="var(--yellow)" opacity="0.13"/>'%curve)
s.append('<path d="%s" fill="none" stroke="var(--yellow)" stroke-width="3"/>'%curve)
A=bez(P0,P1,P2,P3,0.22); B=bez(P0,P1,P2,P3,0.55); C=bez(P0,P1,P2,P3,0.9)
D=(150,175)
E0=bez(P0,P1,P2,P3,0.38); F0=bez(P0,P1,P2,P3,0.8)
E=(round(E0[0]+10,1),round(E0[1]-30,1)); F=(round(F0[0]+30,1),round(F0[1]-14,1))
for nm,(x,y),col in [('a',A,'var(--ink)'),('b',B,'var(--ink)'),('c',C,'var(--ink)'),('d',D,'var(--orange)'),('e',E,'var(--red)'),('f',F,'var(--red)')]:
    s.append('<circle cx="%s" cy="%s" r="5" fill="%s"/><text x="%s" y="%s" font-size="12" font-weight="700" fill="%s">%s</text>'%(x,y,col,x+9,y-7,col,nm))
s.append('<text x="262" y="195" font-size="11" fill="var(--yellow)" font-weight="700" text-anchor="middle">PPB</text>')
s.append('<text x="130" y="238" text-anchor="middle" font-size="11" fill="var(--ink-2)">attainable</text>')
s.append('<text x="330" y="58" text-anchor="middle" font-size="11" fill="var(--red)">unattainable</text>')
s.append('<text x="220" y="300" text-anchor="middle" font-size="11" fill="var(--ink-2)">Quantity of consumption goods</text>')
s.append('<text x="12" y="145" text-anchor="middle" font-size="11" fill="var(--ink-2)" transform="rotate(-90 12 145)">Quantity of investment goods</text>')
s.append('</svg>')
out['ppb']=''.join(s)
# ---------- growth shift
Q0,Q1,Q2,Q3=(60,70),(220,70),(300,130),(310,258)
R0,R1,R2,R3=(60,40),(280,40),(370,100),(380,258)
c1='M%s,%s C%s,%s %s,%s %s,%s'%(Q0+Q1+Q2+Q3)
c2='M%s,%s C%s,%s %s,%s %s,%s'%(R0+R1+R2+R3)
s=['<svg viewBox="0 0 420 310" width="100%" role="img" aria-label="Economic growth shifts the production possibilities boundary outward">']
s.append('<rect x="50" y="30" width="340" height="230" fill="none" stroke="var(--line)"/>')
s.append('<path d="%s" fill="none" stroke="var(--yellow)" stroke-width="2.5"/>'%c1)
s.append('<path d="%s" fill="none" stroke="var(--aqua)" stroke-width="2.5" stroke-dasharray="7 4"/>'%c2)
a=bez(Q0,Q1,Q2,Q3,0.35); b=bez(Q0,Q1,Q2,Q3,0.7); e=bez(R0,R1,R2,R3,0.52); f=bez(R0,R1,R2,R3,0.82)
for nm,(x,y),col in [('a',a,'var(--ink)'),('b',b,'var(--ink)'),('e',e,'var(--aqua)'),('f',f,'var(--aqua)')]:
    s.append('<circle cx="%s" cy="%s" r="5" fill="%s"/><text x="%s" y="%s" font-size="12" font-weight="700" fill="%s">%s</text>'%(x,y,col,x+9,y-7,col,nm))
s.append('<text x="148" y="170" text-anchor="middle" font-size="11" fill="var(--yellow)" font-weight="700">PPB before</text>')
s.append('<text x="318" y="215" text-anchor="middle" font-size="11" fill="var(--aqua)" font-weight="700">PPB after</text>')
s.append('<text x="220" y="300" text-anchor="middle" font-size="11" fill="var(--ink-2)">Quantity of product X</text>')
s.append('<text x="12" y="145" text-anchor="middle" font-size="11" fill="var(--ink-2)" transform="rotate(-90 12 145)">Quantity of product Y</text>')
s.append('</svg>')
out['growth']=''.join(s)
# ---------- circular flow
s=['<svg viewBox="0 0 460 300" width="100%" role="img" aria-label="Circular flow of income and expenditure between households, firms, goods markets and factor markets">']
s.append('<defs><marker id="cfa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--red)"/></marker><marker id="cfb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--blue)"/></marker></defs>')
def box(x,y,w,h,t,sub):
    return '<rect x="%d" y="%d" width="%d" height="%d" rx="12" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/><text x="%d" y="%d" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">%s</text><text x="%d" y="%d" text-anchor="middle" font-size="10.5" fill="var(--ink-2)">%s</text>'%(x,y,w,h,x+w/2,y+h/2-1,t,x+w/2,y+h/2+15,sub)
s.append(box(170,18,120,46,'Goods markets','buy &amp; sell products'))
s.append(box(170,236,120,46,'Factor markets','buy &amp; sell resources'))
s.append(box(14,127,118,46,'Households','consumers'))
s.append(box(328,127,118,46,'Firms','producers'))
# red = goods & services / resources flow (real flows), blue = money
# goods market -> households (goods)  red
s.append('<path d="M188,66 Q120,80 92,125" fill="none" stroke="var(--red)" stroke-width="2.2" marker-end="url(#cfa)"/>')
# firms -> goods market (goods)  red
s.append('<path d="M386,125 Q360,80 292,50" fill="none" stroke="var(--red)" stroke-width="2.2" marker-end="url(#cfa)"/>')
# households -> factor markets (labour etc)  red
s.append('<path d="M72,175 Q100,225 168,252" fill="none" stroke="var(--red)" stroke-width="2.2" marker-end="url(#cfa)"/>')
# factor markets -> firms (factor services) red
s.append('<path d="M292,262 Q380,240 400,176" fill="none" stroke="var(--red)" stroke-width="2.2" marker-end="url(#cfa)"/>')
# blue money: households -> goods market (spending)
s.append('<path d="M60,125 Q90,50 168,38" fill="none" stroke="var(--blue)" stroke-width="2.2" marker-end="url(#cfb)"/>')
# goods market -> firms (revenue)
s.append('<path d="M292,36 Q410,50 420,125" fill="none" stroke="var(--blue)" stroke-width="2.2" marker-end="url(#cfb)"/>')
# firms -> factor markets (pay for resources)
s.append('<path d="M424,176 Q420,260 292,274" fill="none" stroke="var(--blue)" stroke-width="2.2" marker-end="url(#cfb)"/>')
# factor markets -> households (income)
s.append('<path d="M168,272 Q60,262 44,176" fill="none" stroke="var(--blue)" stroke-width="2.2" marker-end="url(#cfb)"/>')
s.append('<text x="230" y="136" text-anchor="middle" font-size="10.5" fill="var(--red)" font-weight="700">red = goods, services,</text>')
s.append('<text x="230" y="150" text-anchor="middle" font-size="10.5" fill="var(--red)" font-weight="700">and resources</text>')
s.append('<text x="230" y="172" text-anchor="middle" font-size="10.5" fill="var(--blue)" font-weight="700">blue = money payments</text>')
s.append('</svg>')
out['circular']=''.join(s)
json.dump(out,open('pilot_svgs.json','w'))
print({k:len(v) for k,v in out.items()}, A,B,C)
