<!-- Last updated: 2026-03-28T23:30:00-05:00 -->
# Protocol: `activate_initiative`

If you are given **this protocol**, the user wants an initiative **back on the main list**: move a file **from** **`.ai/initiatives/_archived/<bucket>/`** **to** **`.ai/initiatives/<name>.md`** and **add a row** to [`.ai/initiatives/_index.md`](../../_index.md) (**Active initiatives**, or **On hold** / **Backlog** if the user specifies).

Drop this protocol into chat **with** the archived initiative path (e.g. `_archived/_pending/foo.md`). If ambiguous, **ask**.

---

## Steps

1. **Confirm the source file** — `.ai/initiatives/_archived/_<bucket>/<name>.md` where `<bucket>` is `pending`, `backlog`, `completed`, or `abandoned` (reactivation from **completed** / **abandoned** is rare; confirm intent).

2. **Move** — `git mv .ai/initiatives/_archived/_<bucket>/<name>.md .ai/initiatives/<name>.md`

3. **Update the initiative `.md`**
   - Remove or supersede the **archive** HTML comment with a **reactivation** note, e.g.  
     `<!-- Reactivated YYYY-MM-DD: returned to active index (<reason>) -->`  
   - Set **`status=active`** (or `on_hold` if the user wants it on hold at root per `_index.md`).
   - **Fix relative links** — paths shorten when returning to the initiatives root.

4. **Update [`.ai/initiatives/_index.md`](../../_index.md)** — add a row to the appropriate table (**Active initiatives** unless the user says otherwise); bump timestamp.

5. **Update [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md)** — **remove** the row from the matching **TOC** section (`_pending/`, `_backlog/`, etc.); bump timestamp.

6. **[`.ai/protocols/session_close.md`](../../../protocols/session_close.md)** — align **`.ai/context.md`**, **`CHANGELOG.md`** `[Unreleased]`, and extended docs if the initiative domain is live again.

---

## See also

- [README](./README.md) — all lifecycle protocols.  
- [`move_initiative_to_pending.md`](./move_initiative_to_pending.md) — opposite direction (active → `_pending`).
