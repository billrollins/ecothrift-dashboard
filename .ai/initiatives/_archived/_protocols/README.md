<!-- Last updated: 2026-03-28T23:30:00-05:00 -->
# Initiative lifecycle protocols

These live next to the archive buckets under **`.ai/initiatives/_archived/_protocols/`**. Drop the relevant file into chat with the initiative name when steering an initiative between **active** (`.ai/initiatives/*.md`) and an **`_archived/<bucket>/`** folder.

| Protocol | Destination / action |
|----------|----------------------|
| [`activate_initiative.md`](./activate_initiative.md) | Bring a file **from** `_archived/<bucket>/` **back** to the initiatives root and **list** it on `_index.md`. |
| [`move_initiative_to_pending.md`](./move_initiative_to_pending.md) | Park paused work in **`_archived/_pending/`** (off the main index). |
| [`move_initiative_to_backlog.md`](./move_initiative_to_backlog.md) | Park future / not-started work in **`_archived/_backlog/`**. |
| [`move_initiative_to_completed.md`](./move_initiative_to_completed.md) | Move delivered scope to **`_archived/_completed/`** (tie to `CHANGELOG` when code shipped). |
| [`move_initiative_to_abandoned.md`](./move_initiative_to_abandoned.md) | Move to **`_archived/_abandoned/`** (will not pursue; keep for archaeology). |

**Always** update [`../ARCHIVE.md`](../ARCHIVE.md) and [`../../_index.md`](../../_index.md), and run [`.ai/protocols/session_close.md`](../../../protocols/session_close.md) so [`.ai/context.md`](../../../context.md) and `[Unreleased]` stay accurate. See each protocol for bucket-specific steps.

*Parent: [`.ai/initiatives/_archived/ARCHIVE.md`](../ARCHIVE.md).*
