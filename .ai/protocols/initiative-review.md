<!-- Last updated: 2026-08-27 -->
# Protocol: Review initiatives

Coding often outruns the files. This pass reconciles Active / Pending / Backlog with what actually shipped, then you approve moves.

Two passes. Do not invent a third.

**Pass A — IF** this file is `@`-mentioned **OR** the user says review initiatives / initiative-review / reconcile initiatives / close out initiatives, **and** the message is not a pasted review list
**THEN** scan, print the list, **STOP.** Do not move files. Do not edit files.

**Pass B — IF** the user pastes a review list after Pass A in this chat
**THEN** apply every remaining line. Do not apply lines they erased. **IF** they changed an action **THEN** use their action.

Do not start coding. Do not ship. Do not bump semver. Do not commit.

---

## Pass A — list

1. Read [`.version`](../../.version).
2. Read the top dated section of [`CHANGELOG.md`](../../CHANGELOG.md). If `[Unreleased]` exists, read that too.
3. Read [`.ai/initiatives/_index.md`](../initiatives/_index.md) and [`.ai/context.md`](../context.md) **Active work**.
4. Read every **Active** file. Read every **Pending** and **Backlog** file named on `_index.md`. Do not open `_completed/` or `_abandoned/` unless the user named that file.

For each file, compare: Status / checkboxes / Record vs CHANGELOG vs the finish line vs `_index.md` notes.

Pick **one** action:

| Action | When |
|--------|------|
| **keep** | File matches reality. Leave it. |
| **update** | Stay in the same bucket. Tick shipped checkboxes, fix Status, add a Record line, fix `_index.md` notes. |
| **complete** | Finish line is true. Remaining unchecked items are already out of scope (or the leftover is a later initiative). |
| **pending** | Paused, not finished. You can say what would resume it. |
| **backlog** | Not started / future. Not scheduled. |
| **abandon** | Will not pursue. You can say why in one line. |
| **activate** | Archived file should come back to Active. |

**IF** you cannot tell complete vs pending **THEN** propose **pending** and say the doubt in `why`. Do not invent scope. Do not complete a file whose finish line is still open.

Print **every** Active / Pending / Backlog row, in this exact shape:

```
INITIATIVE REVIEW
(edit the action, erase lines to skip, paste the rest)

Active
- slug | action | why

Pending
- slug | action | why

Backlog
- slug | action | why
```

Omit an empty section.
Then **STOP.** Tell the user: edit actions, erase lines to skip, paste the rest.

---

## Pass B — apply

The pasted text is the apply set. Ignore headings and blank lines.

1. Parse `- slug | action | why` (slug alone is **keep**). Extra text in `why` is the Record / archive note.
2. **IF** the slug was not on your Pass A list in this chat **THEN** skip it and say so.
3. **keep** — do nothing to that file.
4. **update** — edit the file in place: Status, checkboxes that shipped, one Record line dated today (America/Chicago), bump `<!-- Last updated -->` and the `updated=` stamp. Fix the `_index.md` row. Do not move the file.
5. **complete / pending / backlog / abandon / activate** — update the file the same way, then move it per [`.ai/extended/initiatives.md`](../extended/initiatives.md) (`git mv`, archive comment, `_index.md`, `ARCHIVE.md`). Fix relative links. Today's date on archive comments.
6. **IF** `context.md` **Active work** now points at a moved file or stale one-liner **THEN** fix it.
7. **STOP.** Report applied / skipped. Do not commit. Do not start a ship.

**IF** the paste has no slug lines **THEN** change nothing and STOP.
