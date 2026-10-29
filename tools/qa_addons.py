"""Smoke test for the add-ons (needs: pip install playwright && playwright install chromium).
Run after: python3 build/build.py && python3 tools/add_addons.py
Usage: python3 tools/qa_addons.py
Opens dist/index-addons.html with tools/ask-stub.js injected (a fake Ask AI, not real AI).
Set CHROMIUM=/path/to/chrome if Playwright's own browser is not installed."""
import asyncio, os
from playwright.async_api import async_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(R, 'dist', 'index-addons.html')
STUB = os.path.join(R, 'tools', 'ask-stub.js')
async def main():
    async with async_playwright() as p:
        kw = {}
        if os.environ.get('CHROMIUM'): kw = {'executable_path': os.environ['CHROMIUM'], 'args': ['--no-sandbox']}
        b = await p.chromium.launch(**kw)
        for w, h in ((1280, 820), (390, 800)):
            ctx = await b.new_context(viewport={'width': w, 'height': h}); await ctx.add_init_script(path=STUB); await ctx.add_init_script("localStorage.setItem('s5v72-road','1')")
            pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(800)
            await pg.evaluate("window.__s5.go('micro','ch1')")
            dots = await pg.evaluate("[...document.querySelectorAll('.coursetab:not(.plan) .dot')].map(d=>getComputedStyle(d).backgroundColor)")
            assert len(set(dots)) == 5, dots
            await pg.click('#course-pick'); await pg.click('#open-help'); assert await pg.is_visible('#kb')
            await pg.keyboard.press('Escape')
            assert not await pg.evaluate("document.documentElement.scrollWidth>innerWidth"), 'horizontal scroll at %d' % w
            if w > 600:
                await pg.keyboard.press('/'); await pg.fill('#sx-in', 'opportunity cost'); await pg.wait_for_timeout(300)
                assert await pg.locator('#sx-list li').count() > 0; await pg.keyboard.press('Escape')
                await pg.evaluate("document.querySelector('#toggle-clean').click()"); assert await pg.evaluate("document.querySelector('.viz-root').classList.contains('clean')")
                await pg.click('#ask-fab'); await pg.fill('#ask-q', 'what is opportunity cost?'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1200)
                assert await pg.locator('.ask-m.a').count() == 1; await pg.keyboard.press('Escape')
                await pg.wait_for_timeout(500); await pg.keyboard.press(']'); await pg.wait_for_timeout(400)
                print('week after ]:', await pg.evaluate("document.querySelector('.week-panel:not([hidden])').dataset.week")); assert await pg.evaluate("document.querySelector('.week-panel:not([hidden])').dataset.week") == 'ch2'
            await pg.evaluate("window.__s5.go('plan')"); await pg.evaluate("document.querySelector('#open-sheet').click()"); await pg.wait_for_timeout(400)
            assert await pg.locator('.op-card').count() > 0, 'one-pager picker missing on Plan'
            await pg.evaluate("[...document.querySelectorAll('.op-tool')].find(b=>b.textContent==='Select all').click()"); await pg.wait_for_timeout(300)
            assert await pg.locator('.op-page .op-col').count() > 0, 'one-pager page empty'
            await pg.evaluate("document.querySelector('#sh-close').click()")
            assert not errs, errs
            print('OK at %d px' % w)
        print('Add-ons OK: 5 distinct course colours, Help, Search, Clean view, Ask AI (stub), chapter keys, no horizontal scroll, no errors')
        await b.close()
asyncio.run(main())
