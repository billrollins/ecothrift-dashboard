<!-- Last updated: 2026-04-14T23:45:00-05:00 -->
# Protocol: Consultant retirement (Scout runs this)

Run when Bill says the consultant session is ending. Update docs, collect a FLAT bundle, and prep for the new consultant.

**Who runs this:** Scout (Cursor Agent mode).
**Trigger:** Bill says "retire the consultant," "new consultant session," or similar.

---

## Step 1: Run session_checkpoint.md

Update initiative files, CHANGELOG [Unreleased], extended docs. Do not skip.

---

## Step 2: Update core context files

| File | Verify/update |
|------|---------------|
| `.ai/context.md` | Version matches `.version`. Known Issues current. Working section accurate. |
| `.ai/consultant_context.md` | Phase statuses match initiatives. Open questions current. New decisions captured. |
| `.ai/initiatives/_index.md` | Active table accurate. Phase and Notes columns current. |
| Each active initiative `.md` | Latest session has accurate Result or updates. |

Bump `<!-- Last updated -->` on every file you edit.

---

## Step 3: Collect the handoff bundle

**Destination:** `workspace/notes/to_consultant/files-update/`

**CRITICAL: ALL FILES FLAT. No subdirectories. No folder structure. Just files in one folder.**

**Always include:**
- `context.md`
- `consultant_context.md`
- `_index.md`
- `.version` (rename to `version.txt` if needed for clarity)
- `CHANGELOG.md`
- `startup.md`
- `session_close.md`
- `session_checkpoint.md`
- `get_bearing.md`
- `consult_retire_scout.md` (this file)
- `consult_retire_charlie.md`
- `consultant_instructions.md` — how to be the consultant; primary instruction doc for the bundle ([`workspace/notes/to_consultant/files-update/consultant_instructions.md`](../../workspace/notes/to_consultant/files-update/consultant_instructions.md) in repo)

**Active initiatives (check _index.md):**
- Every `.md` file listed as active

**If relevant to active work:**
- `backend.md`
- `frontend.md`
- `bstock.md`
- `bstock_api_research.md`
- `status_board.md`
- `handoff_prompt.md` (from outgoing consultant)

**If in doubt, include it. Flat. No directories.**

---

## Step 4: Update `consultant_instructions.md`

Update **[`workspace/notes/to_consultant/files-update/consultant_instructions.md`](../../workspace/notes/to_consultant/files-update/consultant_instructions.md)** (same folder as the flat bundle). It is the consultant-facing guide; keep it aligned with what is actually in the bundle.

1. **Bundle files** table — list every file in `files-update/` with one-line description
2. Current version
3. Active initiatives and current phase
4. Pending decisions
5. Back-burner items
6. Conventions to carry forward
7. Anything the outgoing consultant flagged (from their `consult_retire_charlie.md` output)

---

## Step 5: Check for new needs

Did Bill give new instructions this session? New files to track? Frustrations to codify? Update relevant docs and note changes.

---

## Step 6: Report to Bill

List: files updated, files collected (with count), anything flagged. Confirm bundle is ready.
