# Build your own version (for a new person with their own courses)

This is for someone who got this folder from Ben and wants the same study app for their own courses and slides. Give this whole folder to a Claude that can run code and publish an artifact (Claude Code, or the Claude app with file tools).

## What you need before you start
1. This folder, unzipped.
2. Your course slides (PDF or PowerPoint), one folder per course, plus any syllabus or outline PDF.
3. Your Claude must be able to publish an Artifact, and allow the `db`, `user` and `sample` abilities when it publishes (notes and progress sync, and the Ask AI button). Ask AI runs on your own Claude usage.
4. Python 3 and Playwright with Chromium are nice to have for the tests (`pip install playwright`). Without them, skip the test scripts and check the page by eye.

## How long it takes (rough)
About 1 to 2 hours of Claude time per course of 10 to 12 chapters, plus 20 to 40 minutes for the setup. Reading slides and writing the notes is almost all of the work. Do one course first, check it, then do the rest.

## Paste this into your Claude
```
I am giving you a finished study app (a single-file HTML page that I publish as a Claude artifact). It was built for someone else's courses. I want my own version with MY courses and MY slides.

Read these first, in this order: docs/ai-handoff/00-START-HERE.md, 01-architecture.md, 02-features.md, 05-build-your-own.md (this file), then docs/compact-format.md, docs/panel-authoring-spec.md and docs/05-adding-content.md. Ignore the parts of the docs that are about the original owner's own week-by-week work.

My courses (name, code, colour if I have a preference): <LIST YOUR COURSES HERE>
My slides are in: <FOLDER PATHS>
My school and term for the page title: <E.G. "Fall 2026 Study Maps, My College">

Do it in this order, and stop to show me the result after step 3 for ONE course before doing the rest:
1. Run the existing build once (python3 build/build.py && python3 tools/add_addons.py) so we know the toolchain works. Do not publish this one.
2. Set up my courses using the checklist in 05-build-your-own.md ("Swap the courses").
3. For the first course only: extract the slide text, then write each chapter panel as a compact text file (build/new/<course>/<week>.txt, format in docs/compact-format.md, template docs/examples/mini-panel.txt) following the content rules in docs/panel-authoring-spec.md. Build, check with build/check_panel.py, take screenshots (light, dark, 390 px wide), and show me. Wait for my OK.
4. After my OK, repeat for the other courses.
5. Publish build/out-addons.html as an artifact with capabilities {"db":{},"user":{},"sample":{}}. Do not publish the original owner's content.

Rules: keep it one self-contained file with no outside libraries. Notes must be plain, student-level, with real examples, and cover every slide. Never invent facts or numbers and present them as slide content. Never edit generated files (build/out*.html, dist/*). Remove the original owner's course content from my version before publishing.
```

## Swap the courses (the checklist for the AI)
The five original courses are `micro`, `mkt`, `hr`, `sa`, `phl`. Replace them everywhere below with your own short keys (2 to 4 lowercase letters). Keep the key `plan` as it is.

1. `build/build.py`
   - `order=[...]`: your course keys, in menu order.
   - The top bar block: one `<button class="coursetab" data-course="KEY" style="--tc:var(--COLOUR)">Course name</button>` per course, and the first picker label `<span class="pn">`.
   - The brand line `Semester 5 / Study Maps · George Brown College`, and the footer sentence.
   - For each course, put these in `build/new/KEY/` (copy the ones in `build/old/micro/` and edit): `_head.html` (course hero, info line, grading panel), `_tail.html` (sources), `tabs.json` (list of `["ch1","Ch. 1 — Title"]`), one panel file per chapter (`ch1.txt` in the compact format; `ch1.html` also works), and optionally `links.html`. You can delete `build/old/` and the original `build/new/` course folders once yours are in.
2. `build/shell/app.js`
   - `COURSES` map at the top (name and colour variable per key).
   - `TESTS` (test dates and which panels they cover), `DEADLINES` (every graded item with a date; mark guessed dates as estimates), and the `SHORT` names map near line 124.
   - The question bank is read from the panels, so no separate list to edit. Self-test sections inside each panel become the Exam mode questions.
3. `addons/find.js` and `addons/find.css`: the `COURSES` map in find.js, and the per-course colour variables near the end of find.css (light and dark). Keep the five colours clearly different from each other in both modes.
4. `tools/add_addons.py`: it rewrites course colours and asserts hooks match exactly once. Update its course list and colour swaps to match, then run it. If an assertion fails, that is the check doing its job: fix the hook, do not delete the assert.
5. `build/shell/theme.css`: colour variables for any new course colour.
6. Tests: `tools/qa_all.py` (the `P` list of panels), `tools/qa_addons.py`, `tools/qa_devices.py`, `tools/make_screenshots.py` use course keys and a few labels. Update them to your keys.
7. Rebuild and test:
```bash
python3 build/build.py && python3 tools/add_addons.py && python3 tools/make_index.py
python3 tools/qa_addons.py        # must print "Add-ons OK"
python3 tools/qa_devices.py       # phone and iPad sizes
python3 tools/qa_all.py           # slow, run it in the background
```

## What not to touch
`build/shell/overlays.html`, `apple.css`, `v2.css` and the logic in `app.js` (exam, cheat sheet, sketch, readiness, sync). Those work for any course. Only the lists named above change.

## Before you publish or share
The panels are study notes written from the original owner's lecture slides, and some questions are written like textbook end-of-chapter questions. Use your own slides for your own version, and do not republish the original owner's course content.
