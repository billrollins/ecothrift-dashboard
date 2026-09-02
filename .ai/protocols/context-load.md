<!-- Last updated: 2026-08-27 (bat-style: if given this, do this) -->
# Protocol: Load context

**IF** this file is `@`-mentioned **OR** the user says load context / context-load / start / orient
**THEN** do every step below, in order. Do not invent extra steps.

## Do

1. Read [`.ai/context.md`](../context.md).
2. Read [`.version`](../../.version).
3. Read the top dated section of [`CHANGELOG.md`](../../CHANGELOG.md). If `[Unreleased]` exists, read that too.
4. Read [`.ai/initiatives/_index.md`](../initiatives/_index.md).
5. Read each **Active** initiative file named there. Do not open `_archived/` unless the user asked about that archived work.
6. Read terminal metadata (cwd, last command, running?). Do not dump full logs.
7. **STOP.** Ask what they need. One question. Wait.

## Do not

- Assume the task.
- Read every `.ai/extended/` file.
- Run migrations, seeds, builds, commits, or pushes.
- Write a session block, framing questions, checkpoint, or close ritual.
