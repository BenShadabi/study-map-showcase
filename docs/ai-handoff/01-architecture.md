# Architecture

## One page, three layers
1. **Base page.** Built by `build/build.py` from `build/shell/*` (app.js, CSS, plan.html, overlays.html) and the course panels in `build/new/<course>/<week>.html`. Output: `build/out.html` (an artifact fragment). `tools/make_index.py` wraps it as `dist/index.html`. See `docs/04-build-run-publish.md`.
2. **Add-ons** (`addons/find.css`, `addons/find.html`, `addons/find.js`). Written to stay separate: the add-on script reads the DOM and only calls one function of the base page, `window.__s5.go(course, week)`.
3. **`tools/add_addons.py`** joins them. Input `build/out.html`. Output `build/out-addons.html` (publish this with the Artifact tool) and `dist/index-addons.html` (normal full page). Verified: the output is byte-identical to what was published as artifact Version 40.

## add_addons.py does, in order
- Inserts `find.css` before the first `</style>`.
- Inserts three top-bar buttons before `<span class="spacer"></span>`: Search `#open-search`, Clean view `#toggle-clean`, Ask AI `#open-ask`.
- Inserts the Help row `#open-help` as the last child of the course menu `<nav id="coursetabs">` (after the Philosophy button).
- Inserts `find.html` (overlays) before the main `<script>`.
- Appends `addons/find.js` after the main script.
- Swaps the HR and Philosophy colour variables (see colours below).
- Every insert and swap is asserted to match exactly once, so a base-page change that breaks a hook fails loudly instead of silently dropping a feature.
- The full-page wrapper adds `[hidden]{display:none!important}`. The Claude artifact skeleton already has that rule; a plain page does not, and without it the hidden overlays cover the page.

## DOM contract the add-ons depend on
- `.viz-root` wraps the app. All colour variables live on it. The add-on moves its overlays (`#hlbar #sx #ask #ask-fab #kb`) inside `.viz-root` so they get the variables.
- `.course-panel[data-course]` holds a course; `.week-panel[data-week]` holds a chapter/week; `.weektabs[data-scope=<course>] .weektab[data-week]` are its tabs; `.weektab.active` marks the current one.
- Courses: `micro, mkt, hr, sa, phl` (plus `plan`). Week ids: micro `ch1-ch4`, mkt `w1-w4`, hr `ch1-ch6`, sa `w1-w4`, phl `w12, w3, w4, w5`. Each course also has an `info` tab.
- `window.__s5 = { S, Q, go, openExam, openSheet, renderPlan, panelStats, readiness }`. Add-ons use `go(course, week, qid?)`.
- Course menu: `.picker#course-pick` opens `nav#coursetabs` (always a dropdown). Course buttons are `.coursetab[data-course]`; the Help row is `.hp-row#open-help`, deliberately NOT `.coursetab` so the base page's course-switch code ignores it.
- Other overlays and their z-index: notes drawer `#notes-drawer` 70 (FAB `#notes-fab`), exam and cheat sheet 80, Ask panel 75, search 90, highlight bar 95, Help `#kb` 99.

## Colours
Tokens are CSS custom properties on `.viz-root`, redefined for dark mode twice (the `prefers-color-scheme: dark` media query guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`). Both blocks must be edited together.
Course identity colour is `--tc` on the course tab and `.course-panel[data-course=...]`:
micro blue, mkt orange, sa teal-green, hr `--hrc` (pink, light `#c02a86`, dark `#ef72b8`), phl `--phl` (purple, light `#7a3fb0`, dark `#c39af0`).
`--hrc` and `--phl` are defined at the end of `find.css`. Green (`--aqua`) still means "correct answer" in quizzes, so it was not changed.
The same colours are repeated in three JS maps: `COURSES` in the main script, `COURSES` in `addons/find.js`, and inline `style="--tc:..."` on the course buttons. tools/add_addons.py rewrites all of them.

## Where data is kept
**Synced (base page, via the artifact `user` and `db` capabilities):** notes and practice progress. The base page's `initDb()` reads `data/users/<uid>/notes` and `data/users/<uid>/progress` (private per-user docs), merges them with the local copy, pushes anything only the browser has, and listens for changes so a second device updates. If `claude.use('user')` or `claude.use('db')` is null (standalone file, signed out), the page just stays local.

**This browser only (add-ons and base):** the keys below in localStorage, always wrapped in try/catch.
| Key | Holds |
|---|---|
| `s5v2-notes` | Notepad notes (local copy; also synced as above) |
| `s5v2-prog` | Practice progress (local copy; also synced as above) |
| `s5-course`, `s5-week-<course>` | Last course and chapter opened |
| `s5-grading-open-<id>` | Grading panel open state |
| `s5v3-hl` | Highlights (character offsets with head/tail text for re-alignment) |
| `s5v3-clean` | Clean view on/off |

## Claude artifact runtime
The page declares capabilities `sample; db; user` (carried forward on each publish). The base page uses `user` + `db` for the sync above; the add-ons only use `sample`:
`const sample = await window.claude.use('sample')`. If it resolves null, Ask AI buttons stay hidden. Outside claude.ai there is no
`window.claude`, so Ask AI is hidden; `run/ask-stub.js` fakes it.
