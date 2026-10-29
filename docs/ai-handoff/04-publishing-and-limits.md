# Publishing and known limits

## Publishing as a Claude artifact
- Publish `build/out-addons.html` (a fragment; the tool adds the doctype, head and body wrapper) to the artifact URL to update in place.
- Omit `capabilities` on a republish to keep `sample; db; user`. `db` + `user` are used by the base page for notes and progress sync; `sample` is used by Ask AI. Removing `db` or `user` would silently stop the sync, so never clear them.
- A publish is refused if the live version was not viewed first; reading the artifact (or the refusal's diff) counts, then publish again.
- Published versions so far: 36 (Ask AI + shortcuts), 37 (Help + colours), 38 (Help in menu, Ask AI chapter helper), 39 (no `?` shortcut), 40 (Help text corrected: notes and progress sync, highlights stay local).

## Tested
Plain Chromium (Playwright) with a stubbed `sample`: desktop 1280, phone 390, light and dark. Checks: five distinct course colours, Help, Search, Clean view, Ask AI flow, chapter keys, no console errors, no horizontal scroll on a phone.

## NOT tested
- Real Haiku answers (only a stub). Answers beyond the notes can be wrong; the UI says so.
- Whether claude.ai or the Claude Mac app intercepts any Option+key combination.
- iOS Safari behaviour of the bottom sheet and the keyboard.
- Whether classmates without a Claude account can open the shared artifact (Ask AI needs a Claude account and consent).
- The standalone file has no Ask AI and no cross-device sync (both need the artifact runtime).
- Notes/progress sync was not re-tested in this work; the add-ons do not touch it.

## Content and copyright
The notes summarise instructor slides and a textbook. Check with the instructors before sharing outside the class.
