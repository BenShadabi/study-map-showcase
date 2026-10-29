# 05. Adding content (the routine)

## A. New lecture slides (each week)
Goal: a new chapter or week panel in the right course, same quality as the others.

**Short version:** `docs/fast-workflow.md` (triage the slides, write one compact `.txt`, lint, `tools/release.py`). The long steps below are the detail behind it.

1. Put the slides (PDF or text) under `build/src/<course>/<week>/`. Extract the text (`pdftotext -layout slides.pdf text.txt`) and, if figures matter, export slide images.
2. Write `build/new/<course>/<week>.txt` in the compact format (`docs/compact-format.md`, example in `docs/examples/mini-panel.txt`) following the content rules in `docs/panel-authoring-spec.md`. (A hand-written `<week>.html` still works; the `.txt` wins if both exist.) Copy `docs/examples/mini-panel.txt` as the template (it has every block type). Section ids must start with `<course>-<week>-`. Aim for: learning goals, 8 to 14 sections, callouts, worked examples, 12 to 25 flashcards, 12 to 18 self-test questions (about 60% MCQ, at least 4 at level 3), diagrams where a picture helps.
3. Add the tab: tab lists come from `build/old/manifest.json`. For a new week, create `build/new/<course>/tabs.json` that lists ALL the course's week tabs as `[["ch1","Ch. 1 — Title"], ["ch2","Ch. 2 — Title"], ...]` (it replaces the manifest list for that course). The "Info & grades" tab is added automatically by `app.js`.
4. Check and build:
```bash
python3 build/check_panel.py <course> <week>     # must print OK
python3 build/preview.py <course> <week>         # look at the screenshots (add dark too)
python3 build/build.py && python3 tools/make_index.py && python3 tools/qa_all.py
```
   If you add a new week to `qa_all.py`, add it to its `P` list at the top.
5. Add the new panel key (`course:week`) to the right entry in the `TESTS` array in `app.js` if it will be on a test.
6. Republish (see `04-build-run-publish.md`).

Writing style rules for the content: plain, student-level, natural, a bit informal. No buzzwords, no em dashes, no "genuinely/honestly/straightforward". Some courses run AI detection, so the notes should read like a real student wrote them. Facts must come from the slides. Mark made-up numbers as "illustrative".

## B. Syllabus or schedule PDF
Extract the grading breakdown and weekly topics into that course's `build/old/<course>/_head.html` (the Info and grades tab reads it) and add every weighted evaluation to `DEADLINES` in `app.js`. If a date is not given, estimate it from the weekly class day and set `est:1` so it shows "date est.". Tell the student which ones are estimates.

## C. A date, quiz or assignment is mentioned
Add or change the entry in `DEADLINES`. If it is a test, also check `TESTS` (countdown cards and Today) and the course `infoline` in `_head.html` (`data-d` dates drive the hero pills).

## D. Real quiz questions from another chat
1. In a separate chat, use `docs/quiz-analysis-prompt.md` (upload past quizzes, outline, mistakes).
2. Questions come back in this format:
```
Q#: question text
Type: mcq | short | apply | explain
Level: 1 | 2 | 3
Chapter: Ch. 3
Topic: one or two words
A) ...  B) ...  C) ...  D) ...
Correct: B
Why: explanation
```
3. Convert each into the panel markup and append to that chapter's self-test section:
```html
<div class="q" data-kind="mcq" data-lvl="2" data-tag="topic words">
  <div class="q-text"><p>Question text</p></div>
  <ol class="q-opts">
    <li>Option A</li>
    <li data-correct>Option B</li>
    <li>Option C</li>
    <li>Option D</li>
  </ol>
  <div class="q-exp"><p>Why B is right and why the tempting wrong one is wrong.</p></div>
</div>
```
Exactly one `data-correct` per MCQ. For short, apply and explain questions leave out `q-opts`; `q-exp` holds the model answer plus key words. Rebuild and run `tools/qa_all.py`.

Tip: tag real past questions with `data-tag="real quiz"` so they can be told apart from practice questions.

## E. Small edits
- Text fix in a chapter: edit the panel file in `build/new/`, rebuild.
- Styling: add rules at the bottom of `build/shell/apple.css`.
- Behaviour: `build/shell/app.js`. Back up first.
