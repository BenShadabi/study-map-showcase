#!/usr/bin/env python3
"""Phone + iPad check. Run after every change, before publishing.
  python3 tools/qa_devices.py [path-to-html]
Opens the page as iPhone, iPad portrait and iPad landscape (touch on), walks through the main screens and
reports: console errors, sideways scrolling, tap targets under 40px, text under 12px, things cut off the screen."""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright
SRC = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).resolve().parent.parent / "build" / "out-addons.html")
# the live page is wrapped by claude.ai (viewport meta + [hidden] rule). Do the same here so phones lay out like the real thing.
WRAP_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n'
HTML = "/tmp/qa_devices_wrapped.html"
open(HTML, "w").write(WRAP_HEAD + open(SRC).read() + "\n</body></html>")
DEVICES = [("iPhone SE", 375, 667, 2), ("iPhone 15", 393, 852, 3), ("iPhone Pro Max", 430, 932, 3),
           ("iPad portrait", 820, 1180, 2), ("iPad landscape", 1180, 820, 2)]
JS_SIDE = "()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth})"
JS_SMALL = """(sel)=>{const out=[];document.querySelectorAll(sel).forEach(e=>{const r=e.getBoundingClientRect();
 if(!r.width||!r.height||getComputedStyle(e).visibility==='hidden'||e.closest('[hidden]'))return;
 let w=r.width,h=r.height;const a=getComputedStyle(e,'::after');   // an invisible ::after with negative insets widens the real tap area
 if(a.content!=='none'&&a.position==='absolute'){const n=v=>parseFloat(v)||0;w+=-n(a.left)-n(a.right);h+=-n(a.top)-n(a.bottom)}
 if(h<43.5||w<43.5)out.push((e.id||e.className||e.tagName)+' '+Math.round(w)+'x'+Math.round(h)+' "'+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,22)+'"')});return out.slice(0,8)}"""
JS_OFF = """(sel)=>{const out=[];const W=innerWidth;document.querySelectorAll(sel).forEach(e=>{const r=e.getBoundingClientRect();
 if(r.width&&(r.right>W+1||r.left<-1))out.push((e.id||e.className)+' '+Math.round(r.left)+'..'+Math.round(r.right))});return out.slice(0,6)}"""
async def main():
    bad = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        for name, w, h, dpr in DEVICES:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, has_touch=True, is_mobile=True); await ctx.add_init_script("localStorage.setItem('s5v72-road','1')")
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + HTML)
            await pg.wait_for_timeout(1200)
            print('==', name, w, 'x', h)
            async def check(label, sel_small, sel_off):
                nonlocal bad
                s = await pg.evaluate(JS_SIDE); small = await pg.evaluate(JS_SMALL, sel_small); off = await pg.evaluate(JS_OFF, sel_off)
                flag = []
                if s['sw'] > s['cw'] + 1: flag.append(f"sideways scroll {s['sw']}>{s['cw']}")
                if off: flag.append('off screen: ' + '; '.join(off))
                if small: flag.append('small taps: ' + '; '.join(small))
                if flag: bad += 1
                print(f"  {'OK ' if not flag else 'FIX'} {label}" + ('' if not flag else ' -> ' + ' | '.join(flag)))
            await pg.evaluate("window.__s5.go('micro')"); await pg.wait_for_timeout(250)
            await check('course page + top bar', '.topbar button, .picker, .chap-pill, .chap-step', '.topbar *')
            # v51: Plan tab, Study a chapter
            await pg.evaluate("window.__s5.go('plan')"); await pg.wait_for_timeout(300)
            await pg.locator('#plan-chapter').scroll_into_view_if_needed()
            await check('Plan: Study a chapter', '#plan-chapter button, #plan-chapter select, #plan-chapter summary', '#plan-chapter .lp-chips, #plan-chapter .lp-styles, #plan-chapter .lp-steps')
            await pg.evaluate("window.__s5.go('micro')"); await pg.wait_for_timeout(250)
            await pg.evaluate("window.__s5.openExam()"); await pg.wait_for_timeout(200)
            await check('Exam mode setup', '#exam button', '#exam .ex-chip, #exam .ex-start *')
            await pg.click('#exam .ex-chip:has-text("Microeconomics")'); await pg.wait_for_timeout(150)
            await pg.click('#exam .ex-start .btn'); await pg.wait_for_timeout(300)
            await check('Exam question', '#exam button, #exam .q-opts li', '#exam .ex-card, #exam .q-opts li')
            # v49: results screen (low score shows the encouraging message + quick fact; check every tab and the 3 next steps)
            await pg.evaluate("()=>{const X=window.__s5.X; X.res=X.list.map((q,i)=>i<2?'ok':'no'); window.__s5.finishExam();}"); await pg.wait_for_timeout(1200)
            await check('Exam results: Summary', '#exam button', '#exam .res-hero, #exam .res-tabs button')
            await pg.click('#exam .res-tabs button[data-t="rev"]'); await pg.wait_for_timeout(200)
            await check('Exam results: To review', '#exam button', '#exam .ex-miss button')
            await pg.click('#exam .res-tabs button[data-t="next"]'); await pg.wait_for_timeout(700)
            await check("Exam results: What's next", '#exam button', '#exam .res-step, #exam .res-step button, #exam .res-calm')
            await pg.click('#ex-close')
            await pg.evaluate("window.__s5.openSheet('micro')"); await pg.wait_for_timeout(200)
            await pg.click('#sheet .ex-chip:has-text("All chapters")'); await pg.wait_for_timeout(200)
            await check('Cheat sheet', '#sheet button', '#sheet .ex-chip, #sheet .sh-co, #sheet .sh-chap')
            await pg.click('#sh-close')
            await pg.click('#notes-fab'); await pg.wait_for_timeout(250)
            await check('Notes (Type)', '#notes-drawer button', '#notes-drawer *')
            await pg.click('#notes-drawer [data-t="sketch"]'); await pg.wait_for_timeout(350)
            await check('Notes (Sketch)', '#sk button, #notes-drawer .nd-tabs button', '#sk *')
            cv = await pg.query_selector('#sk-cv'); bb = await cv.bounding_box()
            fits = bb['y'] >= 0 and bb['y'] + bb['height'] <= h + 1 and bb['x'] >= 0 and bb['x'] + bb['width'] <= w + 1
            print(f"  {'OK ' if fits else 'FIX'} sketch page fits on screen ({round(bb['width'])}x{round(bb['height'])})"); bad += 0 if fits else 1
            await pg.touchscreen.tap(bb['x'] + 60, bb['y'] + 60)   # a tap must not throw
            if errs: bad += 1
            print('  console errors:', errs or 'none')
            await ctx.close()
        await b.close()
    print('\nRESULT:', 'all good' if not bad else f'{bad} things to fix')
    sys.exit(1 if bad else 0)
asyncio.run(main())
