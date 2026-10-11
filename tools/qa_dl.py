import asyncio
from playwright.async_api import async_playwright
import os
URL="file://"+os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"dist","index.html")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        errs=[]
        for w,h,t,sch in [(1100,900,'d','light'),(390,844,'m','dark')]:
            pg=await b.new_page(viewport={"width":w,"height":h},color_scheme=sch)
            pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(500)
            await pg.evaluate("document.getElementById('plan-deadlines').scrollIntoView()"); await pg.wait_for_timeout(200)
            await pg.screenshot(path=f'tools/shots/dl_{t}.png')
            print(t,'hscroll',await pg.evaluate("document.documentElement.scrollWidth>innerWidth"),'rows',await pg.evaluate("document.querySelectorAll('.dl-row').length"))
            await pg.evaluate("document.querySelector('#plan-dl .btn').click()"); await pg.wait_for_timeout(100)
            print('all rows',await pg.evaluate("document.querySelectorAll('.dl-row').length"))
            await pg.close()
        print(errs); await b.close()
asyncio.run(main())
