# 01. What we built, stage by stage

## The starting point
Five courses in Semester 5 (BBUS 1006 Microeconomics, BBUS 1002 Marketing, BFSM 4101 HR Management, BBUS 3000 Search Analytics, Liberal Studies Philosophy). The first version was one HTML page with a tab per course and short week summaries made from the lecture slides. It worked, but the panels were thin: not enough detail, not enough examples, and some slide content was skipped.

## Stage 1: rebuild every panel from the slides
- Wrote a spec (`panel-authoring-spec.md`) so every chapter would have the same structure and quality bar.
- Rebuilt 22 chapter panels (Micro 4, Marketing 4, HR 6, Search Analytics 4, Philosophy 4) from the actual slide text and images.
- Each panel got learning goals, sections with callouts, worked examples, flashcards, SVG diagrams and a self-test.
- Added a static checker (`check_panel.py`) and a visual preview script (`preview.py`) to catch broken markup and overflow.
- Result: 373 self-test questions across the panels.

## Stage 2: make it a study system, not only notes
- Self-tests with instant feedback and model answers.
- **Exam mode**: mixes questions across chapters for a test.
- **Spaced review** with Leitner boxes so old questions come back when due.
- **Notes** drawer saved in the browser.
- Next-tests cards with a days-left counter and readiness %.

## Stage 3: Apple-style look
- Switched to a clean Apple look: system fonts, white rounded cards, frosted top bar, pill buttons, segmented chapter tabs, tinted callouts. Light and dark mode.
- Fixed small design problems as they showed up (callout side bars looked like crescents, so they became plain tints).

## Stage 4: smarter Plan tab
- **Today** screen: the 3 most useful things to do now, based on days left and readiness.
- **Weak-spot report**: topics where answers are missed or "sure and wrong".
- **Readiness score** per test and per chapter.
- **Confidence tap** on multiple choice (Sure / Guess / No idea).
- **Cheat sheet** per course and per chapter.

## Stage 5: tidy navigation and info
- **Course picker** in the top bar (replaced a crowded row of tabs).
- Course tops are now just a title plus short line; grading and key dates moved into an **"Info & grades"** tab per course.
- Hero shows live date pills instead of stale static chips.
- Cheat sheet opens on the current chapter, with an "All chapters" chip.

## Stage 6: latest additions
- **Deadlines and exams** list in the Plan tab (next 7, "Show all 20"), exams tagged, estimated dates marked "est.".
- **Jump to top / bottom** buttons above the Notes button.
- Learning-goal lists now use numbered dots instead of empty checkbox-looking squares (the squares looked clickable but did nothing).
- Phone: open the page in the phone browser and use Share, then Add to Home Screen (see `04-build-run-publish.md`). Not yet verified that a home-screen shortcut keeps syncing progress.

## Stage 7: artifact add-ons (Oct 12)
- Personal **highlighter** (4 colours), **Search** across all courses, **Clean view** (fewer boxes), **Ask AI** chapter helper, **Help** panel and **keyboard shortcuts**.
- Course colours made clearly different (HR pink, Philosophy purple).
- Built as separate add-ons (`addons/`) that `tools/add_addons.py` joins to the base page. Full story in `10-artifact-addons.md`.

## How it was published
The page is published as a private Claude Artifact (the version history reached 40). Progress syncs through the artifact database there. This repo holds the same page plus all the source so it can be rebuilt, versioned and reused.

## Lessons from the build (worth knowing)
- A CSS class name can collide with another part of the page. A deadline row class `exam` clashed with the Exam-mode overlay class `.exam` and blew the rows up to full height. Check class names before reusing them.
- A sticky top bar with `backdrop-filter` becomes the containing block for fixed or absolute children. Keep fixed UI outside the top bar.
- Always test at 1200px and 390px width and check for horizontal scroll (`tools/qa_all.py` does this for all 22 panels).
- Show screenshots of design changes before publishing.
