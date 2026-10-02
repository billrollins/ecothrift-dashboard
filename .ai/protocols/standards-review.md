<!-- Canonical: C:\Coding\.ai\templates\protocols\standards-review.md — v1 2026-09-30 (replaces tech-target-review.md). Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Standards review

**IF** this file is `@`-mentioned **OR** the user says review standards / standards review / standardize / review tech target
**THEN** do every step below, in order.

You are the **project coder** for this repo. The house standards belong to the master AI in `C:\Coding\.ai\standards\`. You read them; you never edit them.

## Do

1. **Read the standards** — all of them, every run; they change. Start with `C:\Coding\.ai\standards\README.md` (files, principles, decisions), then every file it lists, including `risk.md`.
2. **Read this repo as it is.** Look, don't guess: the `.ai/` tree, `context.md`, `protocols/`, `initiatives/`, `scripts/`, `requirements.txt`, `package.json`(s), `.python-version`, `Procfile`, settings (DB, storage, env loader, AI, auth), Vite config, dev ports, `.gitignore`, and what git tracks under `.ai/`.
3. **Update `.ai/initiatives/standards.md`** (shape: `C:\Coding\.ai\templates\initiatives\standards-template.md` — read it there).
   - One **Open** row per gap: area, change, bucket, **due**, status, source `review <date>`.
   - Keep rows master sent (`master <date>`) as they are unless the gap is truly closed.
   - A difference you believe is a real project difference: add an Open row saying "deviation requested: …" and ask master in the outbox. Only master's approval moves it to **Deviations**.
   - Move closed rows to **Done**. Set **Last review**.
4. **Replace `.ai/comm/outbox.md`** with a `pending` message to master: rows added, rows done, deviation requests, questions. Large material goes in `.ai/reference/to-master/<YYYY-MM-DD>-standards/`, named in the message.
5. **Do only S rows, and only with a go-ahead** — the user in this chat, or a master inbox that says "approved by Bill". M and X rows wait for the user to name them. Never commit, push, deploy, or touch Heroku / S3 / the shared database from this protocol.
6. **STOP.** Report: rows added / done, S rows done (if ordered), outbox left, what needs Bill.

## Do not

- Edit anything under `C:\Coding\.ai\` or another project's folder.
- Rename the repo folder, GitHub repo, Heroku app, or a Postgres schema — master coordinates those.
- Put secrets, tokens, or `.env` values in `standards.md`, comm files, or reports.

## Project steps

(none — add project-specific checks here, never above)
