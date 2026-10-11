import asyncio
from playwright.async_api import async_playwright
import os
URL="file://"+os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"dist","index.html")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={"width":1200,"height":900})
        errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.screenshot(path='tools/shots/new_plan_empty.png',full_page=True)
        # answer some questions with confidence in micro ch1
        await pg.evaluate("window.__s5.go('micro','ch1')"); await pg.wait_for_timeout(200)
        for i in range(6):
            q=pg.locator('.week-panel[data-key="micro:ch1"] .q').nth(i)
            await q.scroll_into_view_if_needed()
            if await q.locator('.q-opts').count():
                if i%2==0: await q.locator('.cf').nth(0).click()
                else: await q.locator('.cf').nth(1).click()
                await q.locator('li').nth(0 if i<4 else 1).click()
        await pg.screenshot(path='tools/shots/new_conf.png')
        await pg.evaluate("window.__s5.go('plan')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='tools/shots/new_plan_full.png',full_page=True)
        await pg.evaluate("window.__s5.go('hr','ch3')"); await pg.wait_for_timeout(200)
        await pg.click('#open-sheet'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='tools/shots/new_sheet.png')
        await pg.click('#sh-close')
        print('errs',errs)
        m=await b.new_page(viewport={"width":390,"height":844})
        await m.goto(URL); await m.wait_for_timeout(600)
        await m.screenshot(path='tools/shots/new_m_plan.png')
        await m.evaluate("window.__s5.go('hr','ch1')"); await m.wait_for_timeout(200)
        await m.click('#open-sheet'); await m.wait_for_timeout(300)
        await m.screenshot(path='tools/shots/new_m_sheet.png')
        print('hscroll', await m.evaluate("document.documentElement.scrollWidth>innerWidth"))
        await b.close()
asyncio.run(main())
