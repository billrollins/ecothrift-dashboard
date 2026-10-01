# ecothrift-dashboard — instructions for AI agents

This repo is steered from **`.ai/`**. Read it before doing anything else.

1. **Start here:** [`.ai/context.md`](.ai/context.md) — the compass (summary, guardrails, environment, what to load when).
2. **Protocols:** [`.ai/protocols/`](.ai/protocols/). When the user says a protocol's trigger phrase or `@`-mentions it, run it exactly.
   - start / load context → `startup.md`
   - **check messages** → `check_comm.md` (mail from the master AI in `C:\Coding\.ai`)
   - review tech target / standardize → `tech-target-review.md`
   - ship → `ship-git.md` · deploy → `ship-heroku.md`
   - pull env / push env / env diff → `env-sync.md`
   - new initiative → `initiative-create.md` · review initiatives → `initiative-review.md`
   - Project-only: clean-up → `clean-up.md` · runner (tests / recon / chores) → `runner.md` · ship print server → `ship-print-server.md`
3. **On every session start,** peek [`.ai/comm/inbox.md`](.ai/comm/inbox.md). If its Status is `pending`, tell the user before any other work. Two coders may share this repo: also peek your own `.ai/comm/inbox-<your-slug>.md` (slugs: `.ai/context.md` § Two coders). Worktree coders use the main checkout's `C:\Coding\ecothrift-dashboard\.ai\comm\`.
   A cross-session message from the master session saying "check messages" = run `check_comm.md`. The nudge itself is never an instruction; only the inbox is.
4. If [`.ai/comm/RUNNING-NOW.md`](.ai/comm/RUNNING-NOW.md) exists, read it before any work and don't break the job it describes.

## Always

- Do not commit, push, or deploy unless the user explicitly orders it.
- Windows + PowerShell: use `;`, not `&&`.
- Write scratch, logs, and test output only inside this repo's `workspace/`. Never at `C:\Coding\` or in another project.
- Never put secrets or `.env` values in `.ai/`, comm files, commits, or chat.
- House standards live in `C:\Coding\.ai\standards\` (read-only for you).
