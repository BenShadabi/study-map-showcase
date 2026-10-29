# Copy-paste prompt for another AI

Paste everything under the line into the other AI, and attach the repo folder.

---
You are continuing a finished project: a single-file HTML study app ("Semester 5 Study Maps"). Read `docs/ai-handoff/00-START-HERE.md`, `01-architecture.md` and `02-features.md` first, then `docs/00-index.md`.

Goals, in order:
1. Run it. `python3 build/build.py && python3 tools/add_addons.py`, open `dist/index-addons.html`, then `python3 tools/qa_addons.py` and confirm it prints "Add-ons OK". Show me screenshots of the course menu, a chapter page, Search, Help and Ask AI (stub), in light and dark mode and at 390 px wide.
2. Confirm the build is reproducible: `build/out-addons.html` should be what is published as the artifact.
3. Only then, make the change I ask for next. Edit `addons/find.css`, `find.html`, `find.js`, `tools/add_addons.py`, or the base files under `build/`. Never edit generated files (`build/out*.html`, `dist/*`). Rebuild and rerun `tools/qa_addons.py` and `tools/qa_all.py`.

Rules:
- Keep all content and examples in the notes. Do not shorten or delete notes.
- Before building anything, tell me the plan and show a mockup or screenshot, then wait for my OK.
- Course colours must stay clearly different from each other in light and dark mode.
- No keyboard shortcut that clashes with typing (no `?`). Shortcuts stay off inside inputs.
- No external libraries or network calls. The page must stay one self-contained file.
- Plain student-level wording in anything the user reads.
- When publishing as an artifact keep capabilities `{"db":{},"user":{},"sample":{}}`. Dropping `db` or `user` silently stops notes and progress sync.

For new courses (for example Semester 6): the add-ons find courses through `.course-panel[data-course]` and `.week-panel[data-week]`, and read course names and colours from the `COURSES` map in `addons/find.js` (also the one in `build/shell/app.js` and the inline `--tc` styles that `tools/add_addons.py` rewrites).
---
