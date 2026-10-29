# AI handoff: Semester 5 Study Maps (artifact add-ons)

You are picking up a finished project. Read this file first, then the others in this folder in order.

## What it is
One self-contained HTML page (about 2.2 MB, no framework, no external requests) that holds a student's study notes for five courses. It was published as a private Claude artifact and shared with classmates. The base page and its content are built by `build/build.py` (see `docs/00-index.md`). The add-ons, built in October 2026, are a personal highlighter, search, Clean view, an Ask AI chapter helper, a Help panel, keyboard shortcuts and clearer course colours. The story of how they came about is in `docs/10-artifact-addons.md`.

## Fastest way to see it
```bash
python3 build/build.py            # base page  -> build/out.html
python3 tools/add_addons.py       # add-ons    -> build/out-addons.html and dist/index-addons.html
# open dist/index-addons.html in a browser (Ask AI stays hidden: it needs the Claude artifact runtime)
pip install playwright && playwright install chromium
python3 tools/qa_addons.py        # injects tools/ask-stub.js (a fake Ask AI) and checks the page
```
Expected last line: `Add-ons OK: 5 distinct course colours, Help, Search, Clean view, Ask AI (stub), chapter keys, no horizontal scroll, no errors`.

## Files in this folder
| File | What it is |
|---|---|
| `01-architecture.md` | How the page is put together, DOM contracts, where data is kept, build pipeline |
| `02-features.md` | Each feature, exact behaviour, shortcuts, design rules |
| `03-rebuild-prompt.md` | A copy-paste prompt to continue or extend this with another AI |
| `04-publishing-and-limits.md` | Claude artifact publishing notes, what was and was not tested |

## Where things are
- `addons/find.css`, `find.html`, `find.js`: the add-ons. `tools/add_addons.py`: joins them to the base page. `tools/qa_addons.py` and `tools/ask-stub.js`: the test and the fake Ask AI.
- `build/`, `dist/`, `docs/`: the existing project (see `README.md` and `docs/00-index.md`).

## Golden rules (from the owner)
- Keep ALL content and examples. Never shorten notes to make the page look cleaner.
- Varied course colours are wanted, but every course colour must stay clearly different from the others.
- Plan first and show a mockup or screenshot, then wait for the go-ahead, before building a change.
- Plain, student-level wording. No em dashes in user-facing text.
- Do not add keyboard shortcuts that clash with typing. He types `?` in notes, so there is no `?` shortcut.

## Standing rule: log every major change
After each major change or feature: add an entry to `docs/12-update-log.md` (`python3 tools/log_update.py "Title" --version NN`), add a row to `docs/11-versions.md` for a new artifact version, refresh screenshots and `README.md` if the look changed, then commit, push to `main` and copy the changed files to the Mac folder (iCloud Drive > Work > Claude files > Study Map). Ben asked for this to happen automatically, without being reminded.

## Always check phone and iPad
Ben uses this on his iPhone and iPad as well as his Mac. Before publishing anything, run `python3 tools/qa_devices.py` and fix whatever it flags (sideways scroll, cut-off parts, tap targets under 44px, console errors). New buttons need at least 44px of tap area on touch.

## Keep GitHub up to date, every time
After every change that is published: update the GitHub README (the intro page) and the screenshots so they match what the page looks like now. Run `python3 tools/make_screenshots.py` (rewrites `docs/img/current_*.png`), update the "What's new" block, version number and counts in `README.md`, then commit and push. Ben does not want the front page or the pictures to be outdated.


## Different person, different courses?
Read `05-build-your-own.md`. It has the prompt to paste and the checklist of places that name the courses.
