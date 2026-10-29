#!/usr/bin/env python3
"""Record the short demo GIFs in docs/img from the built page (needs the private build, see README).
  python3 tools/make_demo_gif.py     # needs: pip install playwright pillow   (uses your installed Chrome)
Shows only the app's own screens (plan, exam setup, results), not chapter text."""
import io, pathlib
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "out-addons.html"; OUT = ROOT / "docs" / "img"
src = (ROOT / "tools" / "make_screenshots.py").read_text()
WRAP = src.split("WRAP = '", 1)[1].split("'\n", 1)[0]
HTML = pathlib.Path("/tmp/demo_wrapped.html"); HTML.write_text(WRAP + SRC.read_text() + "\n</body></html>")

def grab(page, frames, ms, scale, canvas, sel=None):
    """One frame: the viewport, or just the element `sel`, centred on a fixed canvas so every frame has the same size."""
    page.wait_for_timeout(ms)
    raw = page.locator(sel).first.screenshot() if sel else page.screenshot()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im = im.resize((int(im.width * scale), int(im.height * scale)))
    im.thumbnail(canvas)
    bg = Image.new("RGB", canvas, (245, 245, 247))
    bg.paste(im, ((canvas[0] - im.width) // 2, 0))
    frames.append(bg)

def results(page, frac):
    page.evaluate("window.__s5.go('micro')"); page.evaluate("window.__s5.openExam()")
    page.click('#exam .ex-chip:has-text("Microeconomics")'); page.click('#exam .ex-chip:text-is("10")')

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    def run(w, h, mobile, name, scale):
        canvas = (int(w * scale), int(h * scale))
        c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, has_touch=mobile, is_mobile=mobile)
        c.add_init_script("localStorage.setItem('s5v72-road','1')")
        pg = c.new_page(); pg.goto("file://" + str(HTML)); pg.wait_for_timeout(1500)
        f = []
        pg.evaluate("window.__s5.go('plan')"); grab(pg, f, 700, scale, canvas)
        pg.evaluate("window.__s5.go('micro')"); pg.evaluate("window.__s5.openExam()"); grab(pg, f, 700, scale, canvas, '#exam')
        pg.click('#exam .ex-chip:has-text("Microeconomics")'); pg.click('#exam .ex-chip:text-is("10")'); grab(pg, f, 500, scale, canvas, '#exam')
        pg.click('#exam .ex-start .btn'); pg.wait_for_timeout(250)
        pg.evaluate("([x])=>{const X=window.__s5.X,k=Math.round(x*X.list.length);X.res=X.list.map((q,i)=>i<k?'ok':'no');window.__s5.finishExam();}", [0.8])
        grab(pg, f, 400, scale, canvas, '#exam'); grab(pg, f, 1400, scale, canvas, '#exam')
        pg.click('#exam .res-tabs button[data-t="next"]'); grab(pg, f, 900, scale, canvas, '#exam')
        f[0].save(OUT / name, save_all=True, append_images=f[1:], duration=1400, loop=0, optimize=True); c.close()
    run(1100, 760, False, "demo_desktop.gif", 0.7)
    run(390, 800, True, "demo_phone.gif", 0.6)
    b.close()
print("wrote demo_desktop.gif and demo_phone.gif")
