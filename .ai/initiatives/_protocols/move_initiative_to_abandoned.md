<!-- Last updated: 2026-03-28T23:30:00-05:00 -->
# Protocol: `move_initiative_to_abandoned`

If you are given **this protocol**, the user wants to park an initiative under **`.ai/initiatives/_archived/_abandoned/`** — work you **will not** pursue (or will not finish). Keep the file for **archaeology**; the archive TOC should include a **one-line why**.

Drop this protocol into chat **with** the initiative to move. If ambiguous, **ask**. **Human gate:** user should explicitly want abandonment recorded per [ARCHIVE.md](../ARCHIVE.md).

**Bucket meaning:** [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md) — `_abandoned/`.

---

## Steps

1. **Confirm the source file** — `.ai/initiatives/<name>.md` at root, or a move from another `_archived/<bucket>/` folder.

2. **Move** — `git mv` to `.ai/initiatives/_archived/_abandoned/<name>.md` (adjust if coming from another bucket).

3. **Update the moved `.md`**
   - Archive line: `<!-- Archived YYYY-MM-DD: disposition=abandoned (<one-line why>) -->`
   - Optional: `status=abandoned`
   - **Status** — **Abandoned** + short rationale.
   - **Fix relative links.**

4. **Update [`.ai/initiatives/_index.md`](../../_index.md)** — remove from Active / On hold / Backlog if listed; bump timestamp.

5. **Update [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md)** — add a row under **TOC — `_abandoned/`** (summary + **why**); remove from prior bucket TOC if relocating; bump timestamp.

6. **[`.ai/protocols/review_bump.md`](../../../protocols/review_bump.md)** — align **`.ai/context.md`**, **`CHANGELOG.md`** `[Unreleased]` if the steering change should be noted, and extended docs where relevant; no semver-only bump for initiative bookkeeping alone.

---

## See also

- [README](./README.md) — all lifecycle protocols.
