<!-- Last updated: 2026-02-13T10:53:00-06:00 -->
# Procedure: Session Handoff

How to hand off context between AI sessions or conversations.

---

## Before Ending a Session

1. **Summarize what was done.**
   - List the changes made (files created, modified, deleted).
   - Note any bugs found and fixed.
   - Note any decisions made and why.

2. **Update `.ai/context.md` current state.**
   - Update the "Working", "Known Issues", and "Not Yet Implemented" sections.
   - Update the timestamp.

3. **Update relevant extended context files.**
   - If you changed models, update `.ai/extended/backend.md`.
   - If you changed routes/pages, update `.ai/extended/frontend.md`.
   - If you changed auth, update `.ai/extended/auth-and-roles.md`.
   - Update timestamps on any files changed.

4. **Update the changelog if a version was bumped.**
   - Add a new entry to `.ai/changelog.md`.
   - Update `.ai/version.json`.

5. **Note any pending work.**
   - If there are unfinished tasks, note them clearly in `context.md` under "Known Issues" or a "Pending" section so the next session knows what to pick up.

---

## What the Next Session Should Do

The next session should follow `.ai/procedures/startup.md`, which will read the updated context and changelog to understand where things stand.
