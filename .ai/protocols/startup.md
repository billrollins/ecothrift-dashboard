<!-- Canonical: C:\Coding\.ai\templates\protocols\startup.md — v1.1 2026-10-01. Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Startup

**IF** this file is `@`-mentioned **OR** the user says start / startup / load context / orient
**THEN** do every step below, in order. Do not invent extra steps.

## Do

1. Read [`.ai/context.md`](../context.md) — **Guardrails** first, then the rest.
2. Core projects: read [`.version`](../../.version) and the `[Unreleased]` + top dated section of [`CHANGELOG.md`](../../CHANGELOG.md).
3. Read [`.ai/initiatives/_index.md`](../initiatives/_index.md). Open an Active initiative only if the task touches it.
4. If `.ai/calendar.md` exists, read it.
5. Peek [`.ai/comm/inbox.md`](../comm/inbox.md). If two coders share this repo, also peek your own `.ai/comm/inbox-<your-slug>.md`. If either is `pending`, **tell the user first**. Run the full [`check_comm.md`](check_comm.md) only if they say check messages.
6. **STOP.** Ask what they need. One question. Wait.

## Do not

- Assume the task.
- Read every `.ai/extended/` file (load on demand, per the compass).
- Run migrations, seeds, builds, commits, or pushes.
- Write output anywhere outside this repo (house rule D7: scratch goes in `workspace/`).

## Project steps

- Before step 1: if [`.ai/comm/RUNNING-NOW.md`](../comm/RUNNING-NOW.md) exists, read it first and obey it. It names a long job on the local database and what must not be touched while it runs.
- Step 5: the two-coder slugs are in [`context.md`](../context.md) § Two coders. A worktree coder peeks the **main checkout's** comm (`C:\Coding\ecothrift-dashboard\.ai\comm\`).
