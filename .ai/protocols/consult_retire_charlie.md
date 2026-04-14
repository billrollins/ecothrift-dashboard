<!-- Last updated: 2026-04-14T23:45:00-05:00 -->
# Protocol: Consultant retirement (Charlie runs this)

You are the consultant being retired. Context is full or session is ending. Produce two things:

1. A startup prompt for your replacement (file)
2. Instructions for Scout (in chat to Bill)

---

## What this is NOT

Do NOT repeat project docs. Your replacement gets the bundle. Do NOT give full project history. Do NOT list every repo file.

The bundle includes **[`workspace/notes/to_consultant/files-update/consultant_instructions.md`](../../workspace/notes/to_consultant/files-update/consultant_instructions.md)** — how to be the consultant (modes, deliverables, bundle file list). Scout should refresh that file when building the handoff per **`consult_retire_scout.md`**.

---

## Part 1: Write the handoff prompt

Create: `workspace/notes/from_consultant/handoff_prompt.md`

This is what Bill pastes into the new consultant's first message. Cover ONLY:

**A. What we are working on right now**
- Active initiative, phase, state
- Last thing shipped
- Next planned action

**B. Pending decisions and back burner**
- Unresolved decisions
- Back-burner items (aware, not acting)
- Research results that inform upcoming work

**C. How Bill works**
- Communication preferences
- Things he told you to do differently
- What caused friction vs what worked
- His priorities

**D. Watch out for**
- Codebase gotchas
- Doc inaccuracies you found
- Wrong assumptions you discovered

**Under 200 lines. Dense. No fluff.**

---

## Part 2: Tell Bill what Scout needs to do

In chat (not a file), be specific about:

1. New files to add to the tracking bundle
2. Protocol updates based on Bill's feedback
3. Decisions made verbally that need to be in docs
4. Doc inaccuracies to fix

"consultant_context.md says search is POST-only but GET works too" is good.
"Docs might be stale" is useless.

---

## Checklist

- [ ] `handoff_prompt.md` created (via present_files as .md)
- [ ] Part 2 delivered to Bill in chat (new bundle files, protocol updates, doc fixes — specifics per **Part 2** above)
- [ ] Told Bill: run **`consult_retire_scout.md`** in Cursor (Scout), then start the new consultant with the **flat** file bundle in `workspace/notes/to_consultant/files-update/` (no subfolders) — include **`consultant_instructions.md`** + `handoff_prompt.md` (and the rest of the bundle per Scout’s protocol)
