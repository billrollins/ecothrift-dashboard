<!-- Last updated: 2026-04-10T12:00:00-05:00 -->
# Protocol: Refresh docs and collect consultant handoff files

Run when the user **explicitly** asks to prepare a **consultant handoff** (e.g. after a build phase). Ensures docs are not obviously stale and copies a **bundle** of files into **`workspace/notes/to_consultant/files-update/`** for easy sharing.

**Typical order:** **`session_close.md`** should already have updated what shipped; this protocol **spot-checks** and **collects**.

---

## Part A: Verify docs are current

1. Identify the **initiative(s)** in scope (from the user or **`.ai/initiatives/_index.md`**).
2. Read the relevant **`.ai/initiatives/<name>.md`** file(s) and **`.ai/consultant_context.md`**.
3. Skim **`.ai/context.md`** “Current State” for anything contradicting reality.
4. If the initiative touches a domain, spot-check the matching **`.ai/extended/<domain>.md`** (from the initiative’s **See also** or your knowledge of what changed).
5. Fix obvious staleness; update **`<!-- Last updated: ... -->`** on every file you edit.

**Bright line:** Update **`.ai/consultant_context.md`** when a **phase acceptance box** is checked or **initiative status** changes (same rule as **`session_close.md`** Part 2). For a pure handoff pass with no new shipping, Part A is a **consistency check**, not a full rewrite.

---

## Part B: Collect files

1. Create the output directory if needed:

   `workspace/notes/to_consultant/files-update/`

2. **Always copy** these core files:

   - `.ai/context.md`
   - `.ai/consultant_context.md`
   - `.ai/initiatives/_index.md`
   - `.version`
   - `CHANGELOG.md`
   - `.ai/protocols/startup.md`
   - `.ai/protocols/session_close.md`
   - `.ai/protocols/get_bearing.md`

3. **Copy initiative file(s)** for the work in scope (e.g. `.ai/initiatives/bstock_auction_intelligence.md`).

4. **Copy extended docs** that the initiative depends on — choose from **`.ai/extended/*.md`** based on the initiative (e.g. `backend.md`, `frontend.md`, `bstock.md`, `databases.md`). Do not copy all extended files by default.

5. **Optional:** solution designs under **`workspace/notes/from_consultant/`**, notebook READMEs, taxonomy JSON — only if relevant to the handoff.

6. List the directory with file sizes so the user can confirm the bundle.

---

## Part C: Report

Summarize what you changed in Part A (which files, what was stale). List any Part B paths that were missing or skipped. Flag anything you were unsure about and did not change.
