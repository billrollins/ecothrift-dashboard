<!-- Canonical: {master}/templates/protocols/startup.md — v1.2 2026-10-21 (which-machine step, D21). Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Startup

**IF** this file is `@`-mentioned **OR** the user says start / startup / load context / orient
**THEN** do every step below, in order. Do not invent extra steps.

## Do

1. Read [`.ai/context.md`](../context.md) — **Guardrails** first, then the rest.
2. **Which machine.** Read `$env:COMPUTERNAME` and find its row in [`docs/machines.md`](../../docs/machines.md) § Machines.
   - **Found:** note the house name.
   - **Not found, or no file:** tell the user in one line. Then add the row: computer name, board UUID from `(Get-CimInstance Win32_ComputerSystemProduct).UUID`, coding root, this repo's path, the master folder's path or "none". If there's no file yet, create it from `{master}/templates/machines-template.md`. The row goes out with the next ship.
   - **Not the current build machine:** say so in one line, and say it again before any ship or deploy.
3. Core projects: read [`.version`](../../.version) and the `[Unreleased]` + top dated section of [`CHANGELOG.md`](../../CHANGELOG.md).
4. Read [`.ai/initiatives/_index.md`](../initiatives/_index.md). Open an Active initiative only if the task touches it.
5. If `.ai/calendar.md` exists, read it.
6. Peek [`.ai/comm/inbox.md`](../comm/inbox.md). If two coders share this repo, also peek your own `.ai/comm/inbox-<your-slug>.md`. If either is `pending`, **tell the user first**. Run the full [`check_comm.md`](check_comm.md) only if they say check messages.
7. **STOP.** Ask what they need. One question. Wait.

## Do not

- Assume the task.
- Read every `.ai/extended/` file (load on demand, per the compass).
- Run migrations, seeds, builds, commits, or pushes.
- Write output anywhere outside this repo (house rule D7: scratch goes in `workspace/`).

## Project steps

- Before step 1: if [`.ai/comm/RUNNING-NOW.md`](../comm/RUNNING-NOW.md) exists, read it first and obey it. It names a long job on the local database and what must not be touched while it runs.
- Step 6: the two-coder slugs are in [`context.md`](../context.md) § Two coders. A worktree coder peeks the **main checkout's** comm (`.ai/comm/` in the first folder `git worktree list` prints).
