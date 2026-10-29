# Features and exact behaviour

## Course menu and colours
Top-left picker opens a dropdown: Plan, five courses, then a divider and "Help & shortcuts". Five coloured dots must be five different hues in light and dark (the smoke test checks this). Hue gaps used: blue 216, orange 16, teal 164, pink 323, purple 271.

## Highlighter
Select text inside a notes page: a floating bar offers yellow, green, pink, blue and Clear. Keys `1 2 3 4` apply, `0` clears (only while the bar is showing). Stored as text offsets inside the block plus a few characters before/after, so it re-finds its place if text shifts a little. Skips quizzes, tabs, buttons and the info line (`HL_SKIP` in find.js). Saved in this browser only.

## Search
Top-bar Search button or `/`. Overlay with a text box, course chips and a result list. Index is built once from block elements of every course panel (`buildIndex`). Enter opens the result: switches course and chapter, opens any collapsed `<details>`, scrolls, and flashes the spot (CSS Custom Highlight API `::highlight(s5-find)` plus a `.sx-flash` fallback). Arrow keys move through results.

## Clean view
Top-bar toggle adds `.clean` to `.viz-root`; rules at the bottom of find.css flatten card boxes, borders and shadows. All content stays. Remembered in `s5v3-clean`.

## Ask AI (chapter helper)
A floating "Ask AI" button at the bottom right, directly above Notes (round on phones). The old top-bar Ask AI button is kept in the DOM but hidden. Side panel on desktop, bottom sheet on phones. Hidden unless the `sample` capability resolves.
- Retrieval: IDF-weighted over stemmed, stopword-free words across all notes, boosted for the chapter being read (x1.2 course, x1.15 chapter). "this chapter", "summarize" and quiz-type questions take a few lines from every section of the current chapter.
- Prompt (`RULES` in find.js): friendly study helper; start from the numbered NOTES passages and cite `[n]`; may use general knowledge; anything not from the notes goes in its own paragraph starting exactly `Beyond your slides:`; under 150 words; never invent numbers; course rules, deadlines and grades only from the notes; quiz one question at a time.
- The user message also carries `READING NOW: <Course · chapter tab text>`.
- UI: `Beyond your slides:` paragraphs render as an amber callout (`.ask-warn`). Cited passages show as tap-to-open source chips (jump + flash). Follow-up chips. The last 6 turns are sent as history. Cancel button while streaming.
- Model: `claude-haiku-5-5` with `modelTier:'quick'`, `cache:false`. Runs on the viewer's own Claude usage and asks consent on first call.
- Error copy is in `errCopy` (not granted, rate limited, signed out, too large).

## Plan tab: Study a chapter (v51)
`renderChapterLoop()` in `build/shell/app.js` replaces the old progress boxes. State is in `LPSTORE` (localStorage `s5v51-loop`: `sel` course/chapter/way, `loops` per chapter, `stats` per way). Four ways in `LPSTYLES` (quiz, read, examples, write); `lpSteps(id, ctx)` returns the 3 steps and their buttons. `lpSuggest` picks the Suggested way. `lpTrack(q, grade)` is called from `record()` and counts the first answer to a question 20 hours to 14 days after a loop was started; "what is working" needs `LP_MIN` (8) answers per way. Design rules from the evidence check: these are ways to study, never "learner types"; every loop must contain a retrieval step and a come-back-tomorrow line; judge by delayed answers, not same-day scores; hide Examples for chapters with no `.worked` blocks.

## Results screen (v49)
`finishExam()` in `build/shell/app.js` draws the hero (ring `--p`, count-up with rAF, confetti only at 70%+), the encouragement by score band (`resBand`: 90 / 70 / 50 / under 50), an optional "Quick fact" box under 50%, three tabs (Summary, To review, What's next) and three numbered steps (`resStep`). Under 50% the ring shows the count of right answers, not a percent, and the first step is small (5 questions max). `stResult()` draws the same card at the end of a chapter self-test (called from `refreshAll`; celebrates only when a test is finished just now). `resCalm()` adds the short breathing card and a rotating motto (`RES_MOTTOS`) under every result. `reducedMotion()` turns every animation off. Wording rules: calm blue, never red, no "failed". Do not claim a miss comes back on day 1/3/7; a miss resets to box 0 and is due straight away. `window.__s5` exposes `X` and `finishExam` so tests can set a score.

## Help
`Help & shortcuts` row in the course menu opens a modal (`#kb`, reused element) with a side list on desktop and a scrolling tab row on phones. Sections: Start here, Plan, Learn, Connections, Highlight, Search, Ask AI, Tools, Keys, Saved. Content is the `SECS` array in find.js. There is no `?` hotkey, on purpose: the owner types `?` in notes.

## Keyboard shortcuts (all off while typing in an input, textarea or contenteditable)
- `/` Search. `[` and `]` previous and next chapter. `1 2 3 4 0` highlight colours and clear.
- Option+C or Option+T course menu (arrows, Enter, Esc inside it), Option+K Search, Option+A Ask AI, Option+N Notes, Option+S Cheat sheet, Option+E Exam mode, Option+V Clean view. (Alt on Windows.)

Clean view is a small icon-only button next to Search in the top bar (a minor tool); the Help panel explains it.
- They use `event.code` (KeyA, etc.) because Option+letter types a symbol on Mac. Cmd+number is the browser's tab switcher, so it is not used.
- `Esc` closes any overlay. Inside Search and Ask: Up and Down move, Enter opens or sends.

## Design rules
Source Serif 4 for headings, Inter for body. One card shape, calm shadows. No horizontal page scroll at 390 px wide. Print hides the overlays.

## Connections tab
Each course has a last tab "Connections" built from `build/new/<course>/links.html` (`data-week="links"`). `build.py` appends it to the tab list when the file exists. Sections: `<course>-links-map` (flow of chapters), `-ideas` (table: idea, first in, where it comes back), `-q` (one case across all chapters). It has no questions, so `app.js` leaves it out of plan mastery, the cheat sheet and chapter keys (`:not([data-week="links"])`). When a new chapter is added, add a row and a flow node here.

## Tables on phones
At 640px and below, tables with a clean header (no row or column span) get class `stack` and `data-label` on every cell (set in `enhancePanel` in `app.js`), and `apple.css` shows each row as a card. Others keep horizontal scroll.


## Sketch tab (v44)
Notes drawer has tabs Type / Sketch / All notes. Sketch is a canvas (`#sk-cv`, logical page 1000 x 750) in `build/shell/app.js` (functions `sk*`, `wireSketch`). Strokes are `[tool, colour, size, [x,y,x,y...]]` kept in `S.notes[key].d.s` next to the text `S.notes[key].t`, so they sync with the notes document. Pointer events: pen always draws, touch only if the Finger switch is on (default on for phones), touches within 1.5 s after a pen event are ignored. Tray look: Apple Markup style, CSS at the end of `addons/find.css`.
