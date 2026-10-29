# 04. Build, run, publish

## Requirements
Python 3. For tests: `pip install playwright` and `playwright install chromium`.

## Build
```bash
python3 build/build.py        # inputs: build/ -> output: build/out.html  (artifact fragment)
python3 tools/make_index.py   # wraps it as a full page: dist/index.html
```
`build.py` order: `old_head_and_script.html` (page head and base styles), then CSS (`v2.css`, `theme.css`, `apple.css`), then the top bar, Plan tab (`shell/plan.html`), each course (`old/<c>/_head.html`, panels from `new/<c>/<week>.html`, falling back to `old/<c>/<week>.html`, then `_tail.html`), overlays, and `shell/app.js`. `{{svg:name}}` placeholders are replaced with files from `new/svg/` (and `pilot_svgs.json`). Set `S5_OUT=somefile.html` to write somewhere else without touching `out.html`.

## Test
```bash
python3 tools/qa_all.py   # all 22 panels at 1200px and 390px: horizontal overflow + console errors
python3 tools/qa_new.py   # Plan tab features
python3 tools/qa_dl.py    # deadlines list and Show all toggle (writes screenshots to tools/shots/)
python3 tools/qa_jump.py  # jump buttons
python3 build/check_panel.py micro ch1   # static check of one panel (prints OK)
python3 build/preview.py micro ch1       # screenshots of one panel (add `dark` as a third argument)
```
The QA scripts open `dist/index.html`, so build and run `make_index.py` first. Create `tools/shots/` before running scripts that save screenshots.

## Add-ons (highlighter, search, Clean view, Ask AI, Help)
```bash
python3 tools/add_addons.py   # after build.py. writes build/out-addons.html and dist/index-addons.html
python3 tools/qa_addons.py    # checks the add-ons with a fake Ask AI (tools/ask-stub.js)
```
The artifact version is `build/out-addons.html`. `dist/index.html` is the base page without the add-ons.

## Open locally
Open `dist/index.html` in any browser. Progress is saved in that browser.

## Publish as a Claude artifact (what we used)
Publish `build/out.html` (the fragment, not `dist/index.html`) with the Artifact tool, same URL each time so the link stays the same, with capabilities `{"db":{},"user":{},"sample":{}}`: `db` and `user` so progress syncs, `sample` for Ask AI. For the version with the add-ons publish `build/out-addons.html` instead. Do not add doctype/html/body tags; the tool adds them. The page title must stay "Semester 5 Study Maps".

## Put it on GitHub
1. github.com, New repository, name `semester5-study-map`, **Private** (the panels contain lecture material), no README.
2. In a terminal inside this folder:
```bash
git init
git add .
git commit -m "Semester 5 study map: source, build and docs"
git branch -M main
git remote add origin https://github.com/<your-username>/semester5-study-map.git
git push -u origin main
```
3. No terminal? On the empty repo page click "uploading an existing file", drag in the folder contents, and commit.

## Optional: GitHub Pages
Repo Settings, Pages, deploy from branch `main`, folder `/dist` (or move `dist/index.html` to the repo root). Free private Pages needs a paid plan; a public repo gets it free. Progress then saves only in each browser (no cross-device sync).

## Add to phone home screen
Open the page in Safari (iPhone) or Chrome (Android), tap Share or the menu, then Add to Home Screen. It opens like an app. Not verified: whether the shortcut keeps your artifact sign-in and sync, so check that progress shows up on both devices.
