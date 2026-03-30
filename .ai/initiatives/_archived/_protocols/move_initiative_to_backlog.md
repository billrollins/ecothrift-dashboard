<!-- Last updated: 2026-03-28T23:30:00-05:00 -->
# Protocol: `move_initiative_to_backlog`

If you are given **this protocol**, the user wants an initiative **off the main index** and stored under **`.ai/initiatives/_archived/_backlog/`** — **future** work, **not started**, or intentionally **not** listed in the main backlog table.

Drop this protocol into chat **with** the initiative to move (path or filename). If ambiguous, **ask**.

**Bucket meaning:** [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md) — `_backlog/` row in *Choose a disposition*.

---

## Steps

1. **Confirm the source file** — `.ai/initiatives/<name>.md` at the initiatives root.

2. **Move** — `git mv .ai/initiatives/<name>.md .ai/initiatives/_archived/_backlog/<name>.md`

3. **Update the moved `.md`**
   - Archive line: `<!-- Archived YYYY-MM-DD: disposition=backlog (<short reason>) -->`
   - Optional: `status=backlog` in the machine-readable comment.
   - **Status** — clarify it is **backlog** (future / parked).
   - **Fix relative links.**

4. **Update [`.ai/initiatives/_index.md`](../../_index.md)** — remove from Active / On hold / Backlog table as applicable; bump timestamp.

5. **Update [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md)** — add a row under **TOC — `_backlog/`**; bump timestamp.

6. **[`.ai/protocols/review_bump.md`](../../../protocols/review_bump.md)** — align **`.ai/context.md`**, **`CHANGELOG.md`** `[Unreleased]`, and extended docs where relevant; no semver-only bump for steering-only initiative moves.

---

## See also

- [README](./README.md) — all lifecycle protocols.
