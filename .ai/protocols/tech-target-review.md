<!-- Canonical: C:\Coding\.ai\templates\protocols\tech-target-review.md — v4 2026-09-30. Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Tech target review

**IF** this file is `@`-mentioned **OR** the user says review tech target / standardize / self-standardize / standards check
**THEN** do every step below, in order.

You are the **project coder** for this repo. The house standards are owned by the master AI in `C:\Coding\.ai\standards\`. You read them; you never edit them.

## Do

1. **Read the standards** (all of them, every run — they change):
   - `C:\Coding\.ai\standards\README.md` (decisions D1–D6, how gaps vs deviations work)
   - `projects.md`, `ai-folder.md`, `protocols.md`, `tech-target.md`, `scripts-and-env.md`, `storage.md`, `ai-router.md`, `accounts-and-secrets.md`
   - `risk.md` in the same folder — the S / M / X buckets and the named X list.
   - `C:\Coding\.ai\spec_gaps.md` — this project's review status, what master already saw, shared gaps that touch this project.
2. **Read this repo's current state.** Look, do not guess: `.ai/` tree, `context.md`, `protocols/`, `initiatives/`, `scripts/`, `requirements.txt`, `package.json`(s), `.python-version` / `runtime.txt`, `Procfile`, settings (DB, storage, env loader, AI), Vite configs, dev ports.
3. **Write or update `.ai/initiatives/tech_target.md`** (shape: master's `C:\Coding\.ai\templates\initiatives\tech_target-template.md` — read it there, so deleting a hand-down folder never breaks this link). One row per gap:
   - area, what the standard says, what this repo has, the change, risk bucket (**S** local/docs only · **M** can break a Heroku build/boot · **X** on the named list in `standards/risk.md`), order, status, needs Bill (y/n).
   - A difference you believe is a **true project difference** goes in the *Deviation requests* table with one line of why. Master decides; until then it is a gap.
   - Add `tech_target` to `initiatives/_index.md` as a standing initiative.
4. **Replace `.ai/comm/outbox.md`** with a `pending` message to master:
   - first run: the plan (counts per area, the S rows you propose to do first, the M rows that need Bill, deviation requests, questions);
   - later runs: progress since the last message (rows done, rows blocked, anything new in the standards you could not apply).
   - Big lists or files go in `.ai/reference/to-master/<YYYY-MM-DD>-tech-target/` and the outbox names them.
5. **Do only S rows, and only with a go-ahead** — the user saying so in this chat, or a master inbox message that carries Bill's go-ahead (it will say so). S work is `.ai/` moves, docs, local scripts, local config. M and X rows wait until the user names that row. Never commit, push, deploy, or touch Heroku / S3 / the shared database from this protocol.
6. **STOP.** Report: gaps found per area, S rows done (if ordered), outbox left for master, what needs Bill.

## Do not

- Edit anything under `C:\Coding\.ai\` (master) or another project's folder.
- Treat a standard as permission to skip this repo's own guardrails.
- Rename the repo folder, the GitHub repo, the Heroku app, or a Postgres schema — master coordinates those.
- Put secrets, tokens, or `.env` values in `tech_target.md`, comm files, or reports.

## Project steps

(none yet — add project-specific checks here, never above)
