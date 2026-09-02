<!-- Last updated: 2026-08-27 -->
# Protocol: Create initiative

The initiative file **is** the design, start to finish. Later phases may stay high-level until earlier ones are built.

**Pass A — IF** this file is `@`-mentioned **OR** the user says create initiative / initiative-create
**THEN** collect the fields below from their message. Ask only what is still missing, in one numbered list. **STOP.** Do not write the file yet.

**Pass B — IF** they answer that list (or already gave every field in the first message)
**THEN** write the files. **IF** anything required is still missing **THEN** ask only those and STOP again.

Do not start coding. Do not ship. Do not archive anything.

---

## Required fields

| # | Field | Enough when |
|---|--------|-------------|
| 1 | **Title** | A human name. Slug = `descriptive_snake_name` from the title unless they give a slug. |
| 2 | **Compass** | Yes or no: does this take over `context.md` **Active work**? |
| 3 | **Objective** | One paragraph: who can do what that they cannot do now. |
| 4 | **Finish line** | Observable done. A person on a named screen can do X. |
| 5 | **Out of scope** | At least one bullet of what this will **not** do. |
| 6 | **Phase count** | Integer ≥ 1. |
| 7 | **Each phase** | Name + one-line outcome + **gated by** (`none` or `phase N`). |
| 8 | **Detail now** | Phase 1 always gets acceptance checkboxes (3+ bullets). A later phase that is gated by an unfinished phase may be one line plus `Detail when Phase N is built.` Do not invent checkboxes for gated later phases. |

Ask 6–8 together if they did not give phases: how many phases, name and outcome of each, which are gated by which, and acceptance only for phases they want specified now.

Optional (use if they said it; do not block on it): related initiatives, domain files, who it is for.

---

## Pass B — write

1. Create `.ai/initiatives/<slug>.md` using the template below. Today's date is `YYYY-MM-DD` America/Chicago.
2. Add an **Active** row on [`.ai/initiatives/_index.md`](../initiatives/_index.md). Bump its `<!-- Last updated -->`.
3. **IF** compass is yes **THEN** point `context.md` **Active work** at this file and bump that stamp.
4. Follow filing rules in [`.ai/extended/initiatives.md`](../extended/initiatives.md).
5. **STOP.** Give the path and a one-line summary. Do not implement Phase 1 unless they asked in the same message.

### Template

```md
<!-- initiative: slug=<kebab-from-slug> status=active updated=YYYY-MM-DD -->
<!-- Last updated: YYYY-MM-DD -->

# Initiative: <Title>

**Status:** **Active** — Phase 1.

**Objective:** <objective>

**Compass:** <this file is the compass | this file is not the compass; <other> stays the compass>.

---

## Finish line

<finish line>

---

## Out of scope

- <bullets>

---

## Phases

### Phase 1 — <name>
<outcome>
**Gated by:** none.

Acceptance:
- [ ] …

### Phase N — <name>
<one-line outcome>
**Gated by:** Phase N-1.
Detail when Phase <prior> is built.

---

## Acceptance

- [ ] Phase 1 …
- [ ] … (only phases that already have detail)
- [ ] Out-of-scope items stay out

---

## Record

**YYYY-MM-DD — Opened.** <one sentence>.

---

## See also

- Index: [`_index.md`](./_index.md)
```
