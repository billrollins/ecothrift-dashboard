<!-- Last updated: 2026-03-28T23:30:00-05:00 -->
# Protocol: `move_initiative_to_completed`

If you are given **this protocol**, the user wants to mark an initiative as **delivered** and move it to **`.ai/initiatives/_archived/_completed/`**. Scope should be **~100%** done; tie shipping work to **`CHANGELOG.md`** (`[Unreleased]` and/or release notes) when code actually shipped.

Drop this protocol into chat **with** the initiative to move. If ambiguous, **ask**. **Human gate:** archiving should follow explicit user approval per [ARCHIVE.md](../ARCHIVE.md).

**Bucket meaning:** [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md) — `_completed/`.

---

## Steps

1. **Confirm the source file** — usually `.ai/initiatives/<name>.md` at the initiatives root (could also be **moving between buckets** — e.g. `_pending/` → `_completed/`; adjust paths accordingly).

2. **Move** — `git mv .ai/initiatives/<name>.md .ai/initiatives/_archived/_completed/<name>.md`  
   (If relocating from another bucket: `git mv .ai/initiatives/_archived/_<from>/<name>.md .ai/initiatives/_archived/_completed/<name>.md` — then remove the old TOC row and add to `_completed/`.)

3. **Update the moved `.md`**
   - Archive line: `<!-- Archived YYYY-MM-DD: disposition=completed (<what shipped; optional version>) -->`
   - Optional: `status=completed`
   - **Status** — **Completed**; link to `CHANGELOG` sections or PRs if helpful.
   - **Fix relative links.**

4. **Update [`.ai/initiatives/_index.md`](../../_index.md)** — remove from Active / On hold / Backlog if it was listed; bump timestamp.

5. **Update [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md)** — add a row under **TOC — `_completed/`**; if the file moved from another bucket, remove the old row; bump timestamp.

6. **[`.ai/protocols/review_bump.md`](../../../protocols/review_bump.md)** — align **`.ai/context.md`**, **`CHANGELOG.md`** (document shipped work in `[Unreleased]` or a release section when appropriate), and extended docs; **product semver** bumps follow **shipped behavior**, not “one bump per initiative file” — see [`.ai/initiatives/_index.md`](../../_index.md).

---

## See also

- [README](./README.md) — all lifecycle protocols.
