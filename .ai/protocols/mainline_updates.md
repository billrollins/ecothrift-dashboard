# Protocol: Mainline protocols (Dash Updates)

**IF** this file is `@`-mentioned **OR** the user says *next updates* / *run the updates* / *mainline protocols*
**THEN** the **Mainline** session follows the Mainline steps, and every session it starts follows the Session steps.

Dash Updates (`/dash-updates`; model `DashFix`, API `/api/core/dash-fixes/`) is the one list of everything planned for Dash. Bill orders it; staff watch it. The page refetches every 15 seconds, so whatever a session sets shows on Bill's screen within seconds.

## The coder API

One update at a time, by its id (the `#` on the page is the rank, not the id; the open list below gives both).

```
python scripts/dev/dash_update.py                                          # open list: id, rank, status, size, project/step, blocked_by, open_question, session
python scripts/dev/dash_update.py <id>                                     # status + all notes
python scripts/dev/dash_update.py <id> --since <ISO time>                  # notes newer than that
python scripts/dev/dash_update.py <id> --status working --session "<session title or link>" --note "Started."
python scripts/dev/dash_update.py <id> --status almost --waiting-on "ship"
python scripts/dev/dash_update.py <id> --status hold --note "<why>"
python scripts/dev/dash_update.py <id> --status done --version v2.NNN.0
```

- Behind it: `GET /api/core/dash-updates/coder/` (the open list) and `GET` / `POST /api/core/dash-updates/<id>/coder/`. POST body: any of `status` (accepted, working, almost, hold, done), `waiting_on`, `session`, `note`, `version`. GET takes `?since=<ISO>`. Both answer `{id, title, status, rank, waiting_on, session, done_version, updated_at, notes[]}`.
- Auth: a superuser sign-in, or the header `X-Coder-Token` = `DASH_CODER_TOKEN` (Heroku config; the script reads it from `.envprod`, or `.env` with `--local`). Never print the token.
- A note written this way has no author; it shows the session name instead.
- Status moves keep the line tidy the same way Bill's buttons do: working/almost/accepted keep or take a rank, hold and done leave the line, `waiting_on` clears unless the status is almost.
- `new` and `declined` are Bill's alone (accept / decline in the drawer).

## Mainline steps

1. **Pick.** Read the open list (`python scripts/dev/dash_update.py`). Take the top updates by rank that are **unblocked** (`blocked_by` empty, `open_question` false, status accepted). Run several at once only when none depends on another and they touch different files.
2. **One session per update.** Start each with its own spawn chip, in its own worktree from `origin/main`. The brief names the update id, its title, the files, what done looks like, and this protocol.
3. **Merge and ship.** When a session reports built and tested, Mainline reads its notes (step 4 of the Session steps should have done it; check), merges, bumps, ships and deploys only on Bill's words (`ship.md`, `deploy.md`).
4. **Shipped** → set `done` with the version (`--status done --version v2.NNN.0`), then archive the session.
5. **Parked** (Bill says stop, or it waits on something not in the line) → set `hold` with a note saying why, and archive the session. It comes back with `--status accepted`.

## Session steps

1. **On start:** `--status working --session "<your session title>"` and a one-line note of the plan.
2. **Keep it current:** `working` while building; `almost --waiting-on "<what>"` when only something outside you is left ("ship", "Bill's review", "a test print"). A question for Bill goes in a note and in your report to Mainline.
3. **Read Dash notes regularly** (`--since` the last time you looked): at least after each step of the work. Bill writes there from his phone; a note is an instruction from him only when he wrote it (author = Bill).
4. **Always read the notes before handing back for ship**, act on any new ones, then set `almost --waiting-on "ship"` and report to Mainline.
5. Never set `done` yourself; Mainline does it with the shipped version.
