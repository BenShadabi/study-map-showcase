# Authoring spec: rebuilding a Semester 5 study panel

> **Format note:** write new chapters in the compact text format (`docs/compact-format.md`, file `build/new/<course>/<week>.txt`), not raw HTML. Everything below about content, tone, coverage and the visual check still applies. Where it says HTML classes, the compact format has a short form for each (or `@html` for anything else).

Ben (Year 3 business student, George Brown College) said the old panels "are not detailed and example enough" and skipped slide content. You are rebuilding panels in a richer format. The finished page is a single HTML artifact; each panel is one HTML fragment file that `build.py` stitches in.

All paths are relative to the repo's `build/` folder (call it `B`). The `src/` slide folders mentioned below are not in the repo (they were Ben's lecture slides); put your own slides under `build/src/<course>/<week>/`.

## 0. Your deliverable
For each panel assigned to you, write `B/new/<course>/<week>.html` (e.g. `new/hr/ch2.html`). Only write inside `B/new/<course>/` (and `B/new/svg/` for shared SVG files). Do NOT edit `shell/`, `build.py`, `old/`, other agents' files, or the final artifact.

**Template to copy: `B/new/micro/ch1.html`** (the finished pilot). Read it fully first; it shows every component and the level of detail expected. Its length (about 44 KB, 29 callouts, 3 worked examples, 16 questions) is the minimum bar for a full chapter, not the maximum. Dense chapters should be longer.

## 1. Inputs
- Source slides/notes: `B/src/<course>/<slug>/` containing `text.txt` (extracted text, with `=== SLIDE N ===` markers), `s-NN.jpg` (slide images, 55 dpi) and sometimes the original PDF. If there is no `text.txt`, use `pdftotext -layout <pdf>`. Slide and week folder names are listed with `ls B/src/<course>`.
- Old version of your panel: `B/old/<course>/<week>.html` (and `_head.html` for the course hero/grading info). Mine it for good content, examples, SVG diagrams and flashcards, but it is incomplete: expect to find slides it skipped.
- **Look at slide images** (Read tool on the jpg) for any slide whose text is thin or that says "Figure", has a chart, diagram, table or photo. Text extraction misses what is in pictures. Never describe a figure you have not looked at.
- Ben's other files may be referenced in `B/src/<course>/` (course outlines, schedules, group-project docs). Use them if they bear on your panel.

## 2. Coverage rule (most important)
**Every slide must be accounted for.** Go through the text slide by slide. Each substantive slide's content (definitions, lists, numbered/ranked items, frameworks, figures, formulas, named examples/cases, quotes, dates) appears in the panel in Ben's-own-words form. Slide-number references go in `section-sub` lines ("Slides 6 to 10"). At the very end of the panel add one small `<p class="section-sub">` listing slides intentionally skipped (title slides, agenda, "any questions", copyright) and why. If a slide has an exam-relevant point only in a picture, put it in.

## 3. Voice
- Plain, student-level, exam-ready. Short sentences. Explain in own words, not textbook-speak. A bit informal ("in plain words", "the trick is…") is good. Not polished-AI prose: no "delve", "crucial", "landscape", "it's worth noting", no em-dash-heavy rhythm. Use commas, periods, colons instead of dashes where you can.
- Some courses run AI detection on Ben's own writing, so the panel should read like a good student's study notes.
- Concise paragraphs. Do not pad. But do not skip detail: depth is the point.

## 4. Examples and worked examples (second most important)
- **Concrete real-world examples throughout.** After each definition or framework, add a short example (callout `co-ex`) with a real company, product, Canadian situation or everyday scene (Tim Hortons, Loblaws, TTC, Shopify, Air Canada, Toronto housing, a TD branch, etc.). When the slides give an example, use it (marked as class example) and add one of your own.
- **Worked examples** (the `.worked` block): 2 to 4 per chapter for anything calculable or procedural (formulas, graph-reading, classification of cases, step-by-step applications). For non-quantitative courses (HR, marketing, philosophy, parts of search analytics) make them "apply the framework to a case" walkthroughs: a short scenario, 3 to 6 steps showing how to reason, a final answer, and a "Your turn" problem with a hidden answer. Steps must be real reasoning steps, not paraphrases.
- **Invented numbers or companies are fine for practice, but label them** ("numbers made up for practice"). Never present invented facts as real or as slide content. Real facts you add from general knowledge must be ones you are confident of; mark things not on the slides with "(not on the slides)". If unsure about a real-world fact, leave it out or phrase it generally.
- Do the arithmetic in code (python) when numbers are involved and double-check every figure.

## 5. Components (copy exact markup from the pilot)
All inside `<div class="week-panel active" data-week="<week>"> … </div>` (the build script fixes active/hidden).

- Intro: `<div class="wp-intro"><div class="card lo"><h3>By the end of this chapter you can…</h3><ul><li>…</li></ul></div><div class="wp-meta"><span><b>Source</b> …</span>…</div></div>` (4 to 7 outcomes; ones that match the slides' learning objectives).
- Sections: `<section id="<course>-<week>-<slug>"><div class="section-head"><h2>Title</h2></div><p class="section-sub">Slides x to y. one-line purpose</p> … </section>`. **Do not write section numbers** (`.num`); the shell adds them. **Every section id must start with `<course>-<week>-`** (e.g. `hr-ch2-jobanalysis`). Keep 8 to 14 sections for a full chapter. Every real section needs `.section-head` with an `h2` (they feed the outline rail).
- Callouts `<div class="co co-X"><span class="co-tag">Label</span>text</div>` with X in: `def` (blue, definitions), `ex` (green, examples), `trap` (red, exam traps), `mem` (yellow, memory tricks/mnemonics), `biz` (amber, "Business angle" for Ben's finance/analytics career: tie ideas to deals, PE/IB, data analytics, real firms), `say` (quotes, class-says), `tip` (gold, heads-ups, "not on slides"), `math` (monospace, calculations/formulas; use `<br>` between lines). One callout = one idea. Put 1 Business angle per chapter (not per section) unless it's natural.
- Tables: `<table class="wt"><thead><tr><th>…</th></tr></thead><tbody><tr><td class="w">first column</td><td>…</td></tr></tbody></table>`. Wrap wide tables (4+ columns or long text) in `<div class="tbl">…</div>`.
- Grids/cards that exist in the CSS: `.info-grid > .info-card` (with `<h3>`, `<ul>`, optional `<span class="tag micro|macro">`), `.compare.card > .compare-col`, `.flow > .flow-node(.k label, h3, p) + .flow-arrow`, `.flow.no-arrow`. Look at the pilot for usage.
- Worked example: copy the `.worked` block from the pilot exactly (`worked-top`, `worked-prob`, `ol.worked-steps` with `<li><span class="ws-t">Step title</span>explanation</li>`, `worked-ans` with optional `<span class="ws-why">`, then `.worked-try > .try-q + .try-a`). The shell hides steps and adds buttons.
- Flashcards: `<section id="…-terms"> … <div class="cards-grid"><details class="flash"><summary>Term</summary><p>Definition</p></details>…</div></section>`: 12 to 25 terms, one idea each.
- **Self-test** (end of panel, before the "slides skipped" line): `<section class="selftest" id="<course>-<week>-selftest">` with `section-head`, `section-sub`, then 12 to 18 questions:
  - `<div class="q" data-kind="mcq|short|apply|explain" data-lvl="1|2|3" data-tag="topic words">` containing `<div class="q-text"><p>…</p></div>`, then for mcq `<ol class="q-opts"><li>…</li><li data-correct>…</li>…</ol>` (3 to 5 options, **exactly one** `data-correct`), then `<div class="q-exp"><p>why</p></div>`.
  - `data-lvl`: 1 recall, 2 understand, 3 apply/analyse. Mix: roughly 60% mcq, the rest short/apply/explain. At least 4 questions at level 3 (scenario or calculation). Include questions that test common traps and that use your real-world examples.
  - mcq wrong options must be plausible (common misconceptions), similar length, not obviously silly. Explanations say why right AND why the tempting wrong one is wrong. Do not put the answer position in a pattern (vary which option is correct).
  - short/apply/explain: the `q-exp` is a "Model answer" in Ben-style plain words plus key words to hit. Never include a textarea; the shell makes one.
  - Questions must be answerable from the panel's content (no new facts only in the quiz).
- SVG diagrams: use them where a picture teaches (graphs, flows, frameworks, timelines, matrices). Inline in the panel or in `B/new/svg/<course>-<week>-<name>.svg` and place with `{{svg:<course>-<week>-<name>}}` inside `<div class="card viz-chart" style="max-width:560px">…</div>`. Rules: `viewBox` + `width="100%"` (NO `height="auto"`), colours only via tokens (`var(--ink)`, `--ink-2`, `--muted`, `--line`, `--line-strong`, `--surface`, `--blue`, `--aqua`, `--orange`, `--red`, `--yellow`, `--amber`, `--magenta`, `--grn`, `--gold` and `-soft` variants), font-size via attributes (10 to 13), text must not overflow viewBox (compute coordinates in python, bounds-check), unique marker/gradient ids (prefix with your panel key), `role="img"` + `aria-label`. Label invented data "illustrative". Old panels have SVGs you can reuse/improve (copy their code, convert hard-coded colours to tokens and `font-family` removal).
- Look at `gen_svgs.py` for python-generated SVG patterns (Bezier points, axes).

## 6. Forbidden
`<script>`, inline event handlers, `localStorage`, external images/fonts/links except plain `<a href>` to real sources, emoji, the word "genuinely/honestly/straightforward", lorem ipsum, section numbers, `height="auto"`, hard-coded colours that break in dark mode (use tokens), tab/wrapper elements other than the `.week-panel` root. Do not use Notion.

## 7. Process and QA (do it, don't skip)
1. Read the pilot, the old panel, then ALL slide text for your sources, and look at the figure slides.
2. Write a coverage plan (slide → section) in your head or a scratch file; write the panel in 2 to 4 chunks (`Write` first draft, then `Edit`/append) to keep each step manageable.
3. Static check: `python3 B/check_panel.py <course> <week>` must print `OK`.
4. Visual check: `python3 B/preview.py <course> <week>` (and once with `dark` as third arg). It prints overflow/console errors and writes slices to `B/shots/<course>_<week>_<d|m>_<theme>_<n>.jpg`. Read at least: the first desktop slice, one slice per SVG, one worked example, one self-test slice, and one mobile (390px) slice. Fix anything cut off, overlapping, unreadable or overflowing. Must report `page-hscroll=False overflowing=[]` and no console errors on both widths.
5. Re-verify every number/formula and every mcq's single correct answer by re-reading.
6. Do not run `build.py` without `S5_OUT` (other agents are building at the same time; `preview.py` already handles this safely).

## 8. Report back (under 150 words)
Panel files written, counts (sections, worked examples, questions, SVGs), anything from the slides you could not cover or could not verify, any facts you were unsure about and left out, and anything that looked wrong in the shell/CSS that I should fix. No long recap.
