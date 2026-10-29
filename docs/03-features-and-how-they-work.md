# 03. Features and how they work

Logic is in `build/shell/app.js` (one file, wrapped in an IIFE). Markup for the Plan tab is `shell/plan.html`; overlays are `shell/overlays.html`; the top bar is written inside `build/build.py`.

## Data model
Each `.q` question in a panel is read on load into the `Q` array with an id (`<course>-<week>-<n>`), its panel key (`course:week`), type, level and topic tag.

Progress is `S.prog[questionId] = { b, n, e, t, s, c, m, sw }`:

| Key | Meaning |
|---|---|
| `b` | Leitner box (0 to 5) |
| `n` | times answered |
| `e` | ever answered correctly |
| `t` | time of last answer |
| `s` | last grade: `ok`, `part` or wrong |
| `c` | last confidence tap (sure / guess / no idea) |
| `m` | times missed |
| `sw` | times "sure and wrong" |

Saved to localStorage `s5v2-prog`. Notes are in `s5v2-notes`. Last course and chapter are remembered in `s5-course` and `s5-week-<course>`.

## Spaced review
`BOX = [0,1,3,7,14,30]` days. A correct answer moves a question up a box; a miss drops it back. A question is "due" when its last answer time plus the box interval has passed. "Due for review" in the Plan tab and in Exam mode uses this.

## Mastery and readiness
`mastery(q)`: 0.55 + 0.09 x box when last answer was right, 0.3 when partly right, 0.1 when wrong; drops by up to 0.25 when the question is overdue; never below 0.05. `readiness(keys)` is the average mastery of all questions in the listed chapters (unanswered counts 0). `band(p)`: Just starting, Building, Getting there, Solid, Test ready (cuts at 25, 50, 75, 90%).
It is a study guide, not a grade prediction.

## Next tests
`TESTS` array in `app.js`: course, title, date, chapters covered. Drives the countdown cards, Today and Practice buttons. Update this when a test date or scope changes.

## Today
Looks at tests within 14 days (or the next one), scores each chapter by `(1 - readiness) / days left`, picks up to 3 chapters (max 2 per course), then adds due reviews and missed questions. Shows an estimated number of minutes.

## Deadlines and exams
`DEADLINES` array in `app.js`: `{d: start date, e: end date (optional), c: course, t: title, w: weight %, ex: 1 if exam, est: 1 if the date is estimated, lab: custom date label}`. Shows items that are not past yet, 7 by default with a Show all toggle. Rows within 3 days turn amber. Edit this array when D2L dates are confirmed.

## Weak spots
Topics ranked by misses and "sure and wrong" answers, with a button to drill only those questions (Exam mode with `opts.misses`).

## Exam mode
Pulls questions from chosen courses and chapters and mixes them. Modes: mixed, due for review, missed only, new only. You can pick the number of questions, turn on an optional timer, and limit to multiple choice or written questions.

## Cheat sheet
`openSheet(course, week)` opens a full-screen sheet built from the panels, with chips for Formulas and rules, Exam traps, Memory tricks, Definitions and Key terms, plus chapter chips. Opening from a chapter selects that chapter; from the Plan or Info tab it opens the course.

## Course picker and navigation
`go(course, week)` switches tab. The picker is a popup menu (`#coursetabs`). On a fresh device the default landing tab is Plan. Each course has an "Info & grades" tab built by `buildInfo`, which moves the grading and key dates out of the hero.

## Jump buttons
One fixed button (`#jump-up`) smooth-scrolls back to the top and fades when you are near the top. The scroll-to-bottom button was removed on request.

## Artifact sync
`initDb()` only runs if `window.claude` exists (the Claude artifact runtime). It loads and saves progress to the artifact database so phone and laptop match. On a normal website it is skipped and localStorage is used.
