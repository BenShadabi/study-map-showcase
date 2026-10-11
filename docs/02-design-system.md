# 02. Design system

All styling lives in `build/shell/`. `build.py` joins the CSS in this order, so later files win:

1. `v2.css`: the base layout and components (the original structure).
2. `theme.css`: colour tokens and dark mode.
3. `apple.css`: the Apple-style layer on top (last, so it overrides). New styling goes here.

## Tokens
Everything is scoped to `.viz-root`. Colours are CSS variables (`--blue`, `--orange`, `--aqua`, `--grn`, `--yellow` (violet, used for Philosophy), `--red`, `--amber`, `--gold`, `-soft` versions, `--ink`, `--ink-2`, `--muted`, `--line`, `--surface`, `--glass`, `--fill`, `--shadow`). Rule: never hard-code a colour in a component or SVG, always use a token, or dark mode breaks.

Dark mode comes from three places: `prefers-color-scheme: dark` (guarded with `:root:not([data-theme="light"])`), and `:root[data-theme="dark"]`.

## Course colours
Microeconomics blue, Marketing orange, HR aqua, Search Analytics green, Philosophy violet. Each course panel sets `--tc` so section numbers, rails and chips pick up the course colour.

## Fonts
`--f-head`: New York / ui-serif / Georgia. `--f-body`: -apple-system / SF Pro / Segoe UI / system-ui. System fonts only (no downloads). On a non-Apple device you get the fallbacks.

## Main components
- **Top bar**: brand, course picker (`#course-pick`), Cheat sheet, Exam mode. Frosted glass, sticky.
- **Chapter tabs** (`.weektabs`): segmented pill control; the first tab is "Info & grades".
- **Card** (`.card`): white rounded surface with soft shadow.
- **Callouts** (`.co .co-def|ex|trap|mem|biz|say|tip|math`): tinted boxes with a coloured label, no side bar.
- **Learning goals** (`.lo`): numbered dots (CSS counter).
- **Worked example** (`.worked`): problem, hidden steps, answer, "try it" question.
- **Flashcards**: `details.flash` in `.cards-grid`.
- **Question** (`.q`): types mcq / short / apply / explain; confidence row on MCQ.
- **Plan rows**: `.tstep` (today), `.dl-row` (deadlines), `.weak-row` (weak spots).
- **Overlays**: Exam mode (`.exam`), Cheat sheet (`#sheet`), Notes drawer, course menu.
- **Jump buttons** (`.jump`): fixed, above the Notes button.

## Responsive rules
- 16px side gutter, no horizontal page scroll at 390px.
- Wide tables and diagrams scroll inside their own container.
- Short labels on mobile ("Sheet", "Exam").

## Screenshots
See `docs/img/`.
