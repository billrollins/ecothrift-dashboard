<!-- Last updated: 2026-03-28T23:30:00-05:00 -->
# Protocol: `move_initiative_to_pending`

If you are given **this protocol**, the user wants an initiative **off the main active index** and **parked** under **`.ai/initiatives/_archived/_pending/`**. Work is **paused**, not finished — record what would **resume** it.

Drop this protocol into chat **with** the initiative to move (path or filename, e.g. `my_initiative.md`). If the target is ambiguous, **ask** before moving.

**Bucket meaning:** See [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md) — *On hold (root) vs `_archived/_pending/`*.

---

## Steps

1. **Confirm the source file** — `.ai/initiatives/<name>.md` at the initiatives root (not already under `_archived/`).

2. **Move** — `git mv .ai/initiatives/<name>.md .ai/initiatives/_archived/_pending/<name>.md`

3. **Update the moved `.md`**
   - Archive line: `<!-- Archived YYYY-MM-DD: disposition=pending paused off main index (<short reason>) -->`
   - Optional: `<!-- initiative: slug=... status=pending updated=YYYY-MM-DD -->`
   - **Status** section: **Pending** + resume conditions.
   - **Fix relative links** after the path depth change.

4. **Update [`.ai/initiatives/_index.md`](../../_index.md)** — remove the row from Active / On hold / Backlog; bump timestamp.

5. **Update [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md)** — add a row under **TOC — `_pending/`**; bump timestamp.

6. **[`.ai/protocols/session_close.md`](../../../protocols/session_close.md)** — align **`.ai/context.md`**, **`CHANGELOG.md`** `[Unreleased]` (Steering), and extended docs where relevant; **no** repo semver bump for initiative-only moves.

---

## See also

- [README](./README.md) — all lifecycle protocols.  
- [`activate_initiative.md`](./activate_initiative.md) — reverse path (archive → active).
