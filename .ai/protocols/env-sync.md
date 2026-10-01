<!-- Canonical: C:\Coding\.ai\templates\protocols\env-sync.md — v1 2026-09-30. Copy unchanged into <project>/.ai/protocols/ (hosted projects). Project-only steps go in the marked section at the end. -->
# Protocol: Env sync

**IF** this file is `@`-mentioned **OR** the user says pull env / push env / env diff / sync env / add an env key
**THEN** do every step below that fits the request, in order.

House standard: `C:\Coding\.ai\standards\scripts-and-env.md` § Env. Tool: `scripts/env/` (vendored from master's `env-sync` package — never edit it here).

## The files

| File | Holds | Committed? |
|------|-------|-----------|
| `.env` | **Local** values only (local DB, `DEBUG=True`, dev keys). Read by Django (python-decouple) and Vite (`envDir` = repo root). | never |
| `.envprod` | Mirror of **Heroku Config Vars**, written by `pull`. Edited only to prepare a `push`. | never |
| `extended/development.md` → *Environment variables* | Every key **name**: purpose, local vs prod, where its value comes from. No values. | yes |

No other env files: no `.env.example`, `.env.local`, `backend/.env`, `.env.old`, `.env.pre-*`.

## Do

### Pull (Heroku → `.envprod`) — needs the user's ask in this chat

1. `scripts\env\pull.bat --dry-run` — show the user which names are new / gone / changed.
2. `scripts\env\pull.bat` — writes `.envprod`. `.env` is never touched.

### Diff (names only) — any time

1. `scripts\env\diff.bat` — what a push would add or change, what's only on Heroku, and which names `.env` and `.envprod` disagree on. Report it; change nothing.

### Add or change a key

1. Add the **name** to `extended/development.md` (purpose, local vs prod, source).
2. Local value → `.env`. Production value → `.envprod`.
3. Code reads it with `config('NAME', default=...)` (python-decouple). Frontend keys start with `VITE_`; they are baked in at build time, so a prod change needs a redeploy.
4. Production goes live only by **Push** below.

### Push (`.envprod` → Heroku) — risk bucket **M**: only when the user orders this push in this chat

1. `scripts\env\pull.bat --dry-run` or `diff.bat` first: if Heroku has keys you don't, **pull** before editing so you don't push stale values.
2. `scripts\env\push.bat --dry-run` — show the user the add / change / left-alone names.
3. `scripts\env\push.bat` — the user types the app name to confirm. One release, one restart. To remove a key: `--unset KEY1,KEY2` (only if the user named them).
4. `scripts\env\pull.bat` to refresh the mirror. Tell the user if a `VITE_` key changed (redeploy needed).

## Do not

- Print, paste, or copy any **value** — in chat, `.ai/`, comm files, commits, logs.
- Copy production keys into `.env` (local uses dev keys: a dev AWS user limited to `<entity>/dev/*`, dev AI keys).
- Set or unset Heroku config any other way (`heroku config:set`, the dashboard) unless the user orders it; if they did, `pull` afterwards.
- Push `DATABASE_URL` or `HEROKU_*` — the tool refuses; Heroku manages them.
- Edit `scripts/env/env_sync.py` or the `.bat` files — changes go to master.

## Project steps

(none — add project-specific keys to `scripts/env/env_sync.json` `local_only`, not here)
