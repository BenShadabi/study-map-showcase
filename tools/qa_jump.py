import asyncio
from playwright.async_api import async_playwright
import os
URL="file://"+os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"dist","index.html")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        errs=[]
        for w,h,t,sch in [(1100,800,'d','light'),(390,844,'m','dark')]:
            pg=await b.new_page(viewport={"width":w,"height":h},color_scheme=sch)
            pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(500)
            cls=lambda: pg.evaluate("[document.getElementById('jump-up').className, !!document.getElementById('jump-down')]")
            print(t,'top',await cls())
            await pg.evaluate("window.scrollTo(0, 99999)"); await pg.wait_for_timeout(1500)
            print('after scroll',await pg.evaluate("[scrollY, document.documentElement.scrollHeight-innerHeight]"),await cls())
            await pg.screenshot(path=f'tools/shots/jump_{t}.png')
            await pg.evaluate("document.getElementById('jump-up').click()"); await pg.wait_for_timeout(1500)
            print('after up',await pg.evaluate("scrollY"),await cls())
            print('hscroll',await pg.evaluate("document.documentElement.scrollWidth>innerWidth"))
            await pg.close()
        print(errs); await b.close()
asyncio.run(main())
