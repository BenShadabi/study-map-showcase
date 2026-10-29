#!/usr/bin/env python3
"""Rebuild the README screenshots from the current build, so they never go out of date.
  python3 tools/make_screenshots.py            # writes docs/img/current_*.png
Run it after every change that touches how the page looks, then check the pictures and commit them."""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "out-addons.html"; OUT = ROOT / "docs" / "img"
WRAP = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n'
HTML = "/tmp/shots_wrapped.html"; open(HTML, "w").write(WRAP + SRC.read_text() + "\n</body></html>")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        _nc = b.new_context
        async def _ctx(*a, **kw):
            c = await _nc(*a, **kw); await c.add_init_script("localStorage.setItem('s5v72-road','1')"); return c
        b.new_context = _ctx
        # desktop
        ctx = await b.new_context(viewport={'width': 1280, 'height': 820}, device_scale_factor=1.5, color_scheme='light'); await ctx.add_init_script("localStorage.setItem('s5v72-road','1')")
        pg = await ctx.new_page(); await pg.goto('file://' + HTML); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.__s5.go('plan')"); await pg.wait_for_timeout(500); await pg.screenshot(path=str(OUT / 'current_plan.png'))
        await pg.evaluate("window.__s5.go('micro')"); await pg.wait_for_timeout(500); await pg.screenshot(path=str(OUT / 'current_chapter.png'))
        await pg.evaluate("window.__s5.openExam()"); await pg.wait_for_timeout(300); await pg.screenshot(path=str(OUT / 'current_exam.png'))
        await pg.click('#ex-close')
        await pg.evaluate("window.__s5.openSheet('micro')"); await pg.wait_for_timeout(200)
        await pg.click('#sheet .ex-chip:has-text("Ch. 1")'); await pg.wait_for_timeout(300); await pg.screenshot(path=str(OUT / 'current_cheatsheet.png'))
        await pg.evaluate("[...document.querySelectorAll('#sheet .op-seg button')].find(b=>b.textContent.includes('One-pager')).click()"); await pg.wait_for_timeout(300)
        await pg.evaluate("[...document.querySelectorAll('.op-tool')].find(b=>b.textContent==='Select all').click()"); await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelector('.op-sc').scrollIntoView()"); await pg.wait_for_timeout(200); await pg.screenshot(path=str(OUT / 'current_onepager.png'))
        await ctx.close()
        # iPad: notes sketch
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=1.5, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); await pg.goto('file://' + HTML); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.__s5.go('micro')"); await pg.wait_for_timeout(300)
        await pg.click('#notes-fab'); await pg.click('#notes-drawer [data-t="sketch"]'); await pg.wait_for_timeout(400)
        # a supply and demand sketch with simulated Apple Pencil strokes (pressure changes the line width)
        await pg.evaluate("""()=>{const c=document.getElementById('sk-cv'),r=c.getBoundingClientRect();
          const stroke=(pts)=>{const ev=(t,x,y,p)=>c.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'pen',isPrimary:true,clientX:r.left+x*r.width/1000,clientY:r.top+y*r.height/750,pressure:p,bubbles:true,buttons:t==='pointerup'?0:1}));
            ev('pointerdown',...pts[0]);for(let i=1;i<pts.length;i++)ev('pointermove',...pts[i]);ev('pointerup',pts[pts.length-1][0],pts[pts.length-1][1],0)};
          const line=(f,n)=>Array.from({length:n+1},(_,i)=>f(i/n));
          stroke(line(t=>[180,90+t*520,.5],12)); stroke(line(t=>[180+t*600,610,.5],12));
          stroke(line(t=>[230+t*430,130+t*400+Math.sin(t*3)*8,.15+.8*Math.sin(t*Math.PI)],50));
          document.getElementById('sk-col')?.click(); document.querySelector('.sk-c[data-c="2"]')?.click(); document.getElementById('sk-col')?.click();
          stroke(line(t=>[230+t*430,520-t*390+Math.sin(t*4)*6,.2+.75*Math.sin(t*Math.PI)],50))}""")
        await pg.wait_for_timeout(300); await pg.screenshot(path=str(OUT / 'current_ipad_sketch.png')); await ctx.close()
        # phone
        ctx = await b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); await pg.goto('file://' + HTML); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.__s5.go('micro')"); await pg.wait_for_timeout(500); await pg.screenshot(path=str(OUT / 'current_phone.png'))
        await pg.evaluate("window.__s5.openExam()"); await pg.wait_for_timeout(300); await pg.screenshot(path=str(OUT / 'current_phone_exam.png'))
        n = await pg.evaluate("window.__s5.Q.length")
        await ctx.close()
        # results screen: a good score on desktop, a low score (encouraging) on a phone
        async def results(w, h, mobile, frac, tab, out):
            c = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile)
            q = await c.new_page(); await q.goto('file://' + HTML); await q.wait_for_timeout(1200)
            await q.evaluate("window.__s5.go('micro')"); await q.evaluate("window.__s5.openExam()")
            await q.click('#exam .ex-chip:has-text("Microeconomics")'); await q.click('#exam .ex-chip:text-is("10")'); await q.click('#exam .ex-start .btn'); await q.wait_for_timeout(250)
            await q.evaluate("([f])=>{const X=window.__s5.X, k=Math.round(f*X.list.length); X.res=X.list.map((x,i)=>i<k?'ok':'no'); window.__s5.finishExam();}", [frac])
            await q.wait_for_timeout(1500)
            if tab != 'sum': await q.click('#exam .res-tabs button[data-t="%s"]' % tab); await q.wait_for_timeout(900)
            await q.screenshot(path=str(OUT / out)); await c.close()
        # Plan tab, "Study a chapter"
        c = await b.new_context(viewport={'width': 1100, 'height': 900}); q = await c.new_page(); await q.goto('file://' + HTML); await q.wait_for_timeout(1200)
        await q.evaluate("window.__s5.go('plan')"); await q.wait_for_timeout(400)
        await q.locator('#plan-chapter').screenshot(path=str(OUT / 'current_study_chapter.png')); await c.close()
        await results(1280, 820, False, 0.75, 'sum', 'current_results.png')
        await results(390, 800, True, 0.2, 'next', 'current_phone_results.png')
        await b.close()
    print("questions:", n); print("wrote", sorted(f.name for f in OUT.glob('current_*.png')))
asyncio.run(main())
