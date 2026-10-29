# Compact panel format (use this for new chapters)

![Today's HTML vs the compact format](img/compact_source_compare.png)

Write a chapter as a short text file, `build/new/<course>/<week>.txt`, instead of raw HTML. The build turns it into exactly the same panel HTML (`tools/panelc.py`). About 40% fewer tokens to write and to edit. Nothing in the app changes.

- A `.txt` file wins over a `.html` file with the same name. Old chapters stay as `.html`; leave them.
- Full working example with every block type: `docs/examples/mini-panel.txt`. Copy its shape.
- Content rules (what to cover, tone, no invented facts, every slide accounted for) are still in `docs/panel-authoring-spec.md`. Only the typing format changed.
- Check and build as before: `python3 build/check_panel.py <course> <week>` then the usual build. Both read `.txt` files.

## Blocks
Blocks are separated by a blank line. Inline: `**bold**`, `*italic*`; any other inline HTML (`<sub>`, `<a>`, `<br>`) is fine.

| Write this | You get |
|---|---|
| `# course week` (first line, e.g. `# micro ch1`) | the panel; section ids become `course-week-<id>` |
| `@lo` + `- bullet` lines, then `@meta` + `Label :: text` lines | the "By the end of this chapter" card and the Source / On Test / Time line |
| `## id \| Title` (or `## id.class \| Title`, e.g. `selftest.selftest`) | a section |
| `sub: text` | the grey line under a section title (`sub-late:` = the one with extra top margin, used at the very end) |
| plain line(s) | a paragraph |
| `@def: text`, `@ex:`, `@trap:`, `@mem:`, `@tip:`, `@biz:`, `@math:`, `@say:` | a coloured callout. The tag word is the default (Definition, Example, Exam trap, Memory trick, Tip, Business angle, Check the math, Quote). Custom tag: `@ex[Class example]: text` |
| `@h3: text` / `@h3 mt=22: text`, `@note: text` | small heading, small grey figure note |
| `@table w` then `\| a \| b \|` rows (header, `\|---\|---\|`, rows) | table; `w` bolds the first column |
| `@cards mt=14`, `### Title` or `### [icn: C] Title` or `### [micro: Tag] Title`, `- bullet` | grid of info cards (icon or tag badge optional) |
| `@compare mt=16`, `### [blue] Title`, `- bullet` | two-column compare card; colour = a token name (blue, orange...) |
| `@flow` (or `@flow noarrow`), then `Kicker \| Title \| text` per step | step boxes with arrows |
| `@worked Title`, `prob:`, `1. Step title :: text`, `ans: text \|\| why: text`, `try: question \|\| answer` | worked example |
| `@fig name max=560 mt=12` | an SVG from `build/new/svg/` (`{{svg:name}}`) |
| `@flash auto`, then optional `Term :: definition` lines | the flip cards. `auto` makes a card from every `@def` that starts with `**Term**` (back = its first sentence), so start definitions that way and skip writing the cards twice |
| `@html` ... `@end` | raw HTML, for anything with no short form |

## Questions
```
? kind | level | tag [| src=... | answer=... | tol=... | unit=...]
~ small reference line (optional, becomes the q-ref line)
Question text (each line is a paragraph)
- wrong option
+ correct option (more than one + for "multi")
> explanation (each line is a paragraph)
```
Kinds: `mcq`, `multi`, `num` (needs `answer`, `tol`, `unit`), `apply`, `short`, `explain`. Questions with no options (short, apply, explain) have only the `>` model answer. `>> text` is for an old-style explanation that is not in a paragraph (one line, HTML allowed).

## Convert an existing HTML chapter
```bash
python3 tools/panelc.py decompile build/new/micro/ch1.html build/new/micro/ch1.txt   # then delete ch1.html
python3 tools/panelc.py check build/new/micro/ch1.html                                # round-trip test, must say True
```
Every chapter in the repo (25 of them) converts and round-trips exactly. Only two HTML comments stay as `@html`.

## Check it before you build
```bash
python3 tools/panelc.py lint build/new/<course>/<week>.txt [--slides 24]
```
Errors (a multiple-choice question with no or two correct answers, a numeric answer that is not a number, no explanation, a bad level, duplicate section ids) stop the release. Warnings are style and coverage: too few questions or cards, no worked example, AI-sounding words, em dashes, and with `--slides N` any slide number that is not mentioned anywhere.
