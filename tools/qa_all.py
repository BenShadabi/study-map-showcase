import asyncio,json
from playwright.async_api import async_playwright
import os
URL="file://"+os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"dist","index.html")
P=[('micro',w) for w in ['ch1','ch2','ch3','ch4']]+[('mkt',w) for w in ['w1','w2','w3','w4']]+[('hr',w) for w in ['ch1','ch2','ch3','ch4','ch5','ch6']]+[('sa',w) for w in ['w1','w2','w3','w4']]+[('phl',w) for w in ['w12','w3','w4','w5']]+[(c,'links') for c in ['micro','mkt','hr','sa','phl']]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for vw in (1200,390):
            pg=await b.new_page(viewport={"width":vw,"height":900})
            errs=[]
            pg.on('pageerror',lambda e:errs.append('PAGEERROR '+str(e)))
            pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text and 'Failed to load' not in m.text else None)
            await pg.goto(URL); await pg.wait_for_timeout(800)
            for c,w in P:
                await pg.click('#course-pick'); await pg.click(f'button.coursetab[data-course="{c}"]')
                await pg.click(f'.course-panel[data-course="{c}"] button.weektab[data-week="{w}"]')
                await pg.wait_for_timeout(120)
                sel=f'.week-panel[data-week="{w}"]'
                for x in await pg.query_selector_all(f'.course-panel[data-course="{c}"] '+sel+' .worked-bar .btn:not(.solid)'):
                    try: await x.click()
                    except: pass
                for x in await pg.query_selector_all(f'.course-panel[data-course="{c}"] '+sel+' details.flash'): await x.evaluate('e=>e.open=true')
                r=await pg.evaluate("""([c,sel])=>{const P=document.querySelector('.course-panel[data-course="'+c+'"] '+sel),W=innerWidth,o=[];P.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>W+1){let p=e.parentElement,clip=false;while(p&&p!==P){if(getComputedStyle(p).overflowX!=='visible'){clip=true;break}p=p.parentElement}if(!clip)o.push(e.tagName+'.'+e.className+'@'+Math.round(r.right))}});return {o:o.slice(0,4),hs:document.documentElement.scrollWidth>innerWidth, q:P.querySelectorAll('.q').length, rail:P.parentElement.querySelectorAll('.wp-rail a').length}}""",[c,sel])
                if r['o'] or r['hs']: print(vw,c,w,r)
            print(vw,'done errs',errs[:5])
        await b.close()
asyncio.run(main())
