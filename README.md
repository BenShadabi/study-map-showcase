# Study Maps

A single-page study app I built with Claude for my Semester 5 courses at George Brown College (Honours BBA, Business Analytics). It started as chapter summaries and grew into a small study system: self-tests, spaced review, exam mode, a weak-spot report and a plan tab with deadlines.

![Plan tab](docs/img/new_plan_today.png)

## What it does

- **22 chapter panels** across 5 courses (Microeconomics, Marketing, HR Management, Search Analytics, Philosophy). Each has learning goals, definitions, examples, exam traps, worked examples with hidden steps, flashcards and SVG diagrams.
- **373 self-test questions** plus an Exam mode. Multiple choice is auto-graded. Short and apply questions are self-graded against a model answer.
- **Spaced review.** Answers come back on a schedule (0, 1, 3, 7, 14 and 30 days). Tapping "Sure" or "Guessing" before each answer flags the dangerous case: sure but wrong.
- **Plan tab.** What to do today, deadlines and exams, readiness per test, due for review, weak spots and progress by chapter.
- **Cheat sheet** for each chapter, built from the panel content.
- **Notes drawer**, light and dark themes, and a layout that works at phone width.

| Dark mode quiz | Cheat sheet | Phone |
|---|---|---|
| ![Quiz](docs/img/new_look_dark_quiz.png) | ![Cheat sheet](docs/img/new_cheat_sheet.png) | ![Mobile](docs/img/new_mobile_today.png) |

## How it is built

- **Plain HTML, CSS and JavaScript.** No framework. Progress is saved in the browser (localStorage).
- **A Python build script** (`build/build.py`) stitches the page shell and the chapter fragments into one self-contained HTML file.
- **SVG diagrams** are generated and dropped into the panels at build time.
- **Playwright scripts** in `tools/` check the finished page (downloads, jump buttons, all panels).
- Design notes are in [docs/02-design-system.md](docs/02-design-system.md). The logic behind each feature is in [docs/03-features-and-how-they-work.md](docs/03-features-and-how-they-work.md).

## What is in this repo

```
build/shell/   the app: app.js, CSS, plan tab and overlays
build/         build script and authoring helpers
tools/         page checks and the index builder
docs/          design system, feature notes and screenshots
```

The chapter content comes from my lecture slides and a course textbook, so it is not in this public repo. That means this copy shows the app and how it works, but it does not build on its own.
