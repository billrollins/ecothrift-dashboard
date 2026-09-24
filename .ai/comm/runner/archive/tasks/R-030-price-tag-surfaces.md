> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-030 · Where names print today (price tag, POS, listings)

- **Type:** recon (code only) · **Time box:** 30 min
- **Why:** the new `short_name` (28 characters or fewer, `.ai/extended/product-taxonomy.md`) replaces the name on the price tag and elsewhere. Find every surface and its limit.

## Do
For each of these, find the code that picks the name text. Give `path:line`, which field it reads (item title, product title, other), and any length cut or wrap:
- the price tag or label: the labels app, print server templates, ZPL or HTML;
- the POS cart line and receipt;
- the processing and preprocessing screens;
- online listing titles (webstore);
- reports: store report, item stats.

Also say how many characters fit on one line of the current price-tag layout, if the template makes it clear.

## Hand back
A table: surface, file:line, field used, cut or limit, and notes. Then list the places where a single change would switch the surface to `short_name`.
