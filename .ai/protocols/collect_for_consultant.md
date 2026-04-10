<!-- Last updated: 2026-04-10T19:00:00-05:00 -->
# Protocol: Refresh docs and collect consultant handoff files

Run when the user **explicitly** asks to prepare a **consultant handoff** (e.g. after a build phase). Ensures docs are not obviously stale and copies a **bundle** of files into **`workspace/notes/to_consultant/files-update/`** for easy sharing.

**Typical order:** **`session_close.md`** should already have updated what shipped; this protocol **spot-checks** and **collects**.

---

## Part A: Verify docs are current

1. Check **`.ai/initiatives/_index.md`** for the current **active initiatives**.
2. Read the relevant **`.ai/initiatives/<name>.md`** file(s) for each active initiative in scope.
3. Read **`.ai/consultant_context.md`**.
4. Skim **`.ai/context.md`** "Current State" for anything contradicting reality.
5. If the initiative touches a domain, spot-check the matching **`.ai/extended/<domain>.md`** (from the initiative's **See also** or your knowledge of what changed).
6. Fix obvious staleness; update **`<!-- Last updated: ... -->`** on every file you edit.

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

3. **Copy active initiative file(s)** — check **`.ai/initiatives/_index.md`** for the current list and copy each active initiative `.md` file.

4. **Copy extended docs** that the active initiatives depend on — use the **Extended docs TOC** in **`.ai/context.md`** to pick the right files. Do not copy all extended files by default.

5. **Optional:** solution designs under **`workspace/notes/from_consultant/`**, notebook READMEs, taxonomy JSON — only if relevant to the handoff.

6. List the directory with file sizes so the user can confirm the bundle.

---

## Part C: Update consultant instructions

After collecting files, update **`workspace/notes/to_consultant/files-update/consultant_instructions.txt`**:

1. Ensure the **`## Documentation hierarchy`** section lists **every file** that was just copied into the bundle (core files, initiative files, extended docs).
2. Update any references to **initiative names**, **phases**, or **status** that have changed since the last handoff.
3. Do **not** rewrite sections that are still accurate — only update what changed.

---

## Part D: Report

Summarize what you changed in Part A (which files, what was stale). List any Part B paths that were missing or skipped. Confirm Part C updates. Flag anything you were unsure about and did not change.
