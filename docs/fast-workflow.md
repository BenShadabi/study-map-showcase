# Fast workflow for new slides (less time, fewer tokens)

Written for me (Claude) and for anyone building on this repo. Ben asked for this on Oct 15, 2026.

## Per chapter
1. **Triage the slides** (reads everything once, shows only what needs a look):
   `python3 tools/slides_triage.py deck.pdf|deck.pptx build/src/<course>/<week>`
   Read `text.txt`. Look only at the `s-NN.jpg` pictures it made (thin slides, figures, tables, charts). Never describe a figure you have not looked at.
2. **Write the chapter once** as `build/new/<course>/<week>.txt` (`docs/compact-format.md`). One pass, no outline step to approve. Start each `@def` with `**Term**` and end the cards section with `@flash auto`.
3. **Lint** it: `python3 tools/panelc.py lint build/new/<course>/<week>.txt --slides <N>`. Fix errors; fix warnings that matter (a missed slide is a real gap).
4. **Release**: `python3 tools/release.py "Marketing Week 7"` (checks every chapter, builds, runs the add-on and phone/iPad tests, commits, pushes). Then publish `build/out-addons.html` to the artifact URL.

## Several chapters at once
Write them in parallel (one helper per chapter, each writing only its own `.txt` and its own `build/src` folder), then run steps 3 and 4 once for all of them. Helpers must not edit `build/shell/`, `build.py` or each other's files. Deadlines, tabs and docs are done once by the main session after the chapters are in.

## What is skipped by default (content-only updates)
Versions table, update-log entry, README "what's new", refreshed screenshots, the `Published versions/vNN` folder and the Mac copy. After the task, ask Ben one short line ("Update README, screenshots and the Mac copy too?") and do them only if he says yes. Design or feature changes are different: those still get the full routine in `docs/12-update-log.md`.
