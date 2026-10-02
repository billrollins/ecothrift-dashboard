<!-- Canonical: C:\Coding\.ai\templates\protocols\deploy.md — v3 2026-10-02 (was ship-heroku.md). Copy into <project>/.ai/protocols/ (projects with a Heroku app), APP = ecothrift-dashboard. Project-only steps go in the marked section at the end. -->
# Protocol: Deploy

**IF** this file is `@`-mentioned **OR** the user says deploy / push to Heroku
**THEN** do every step below, in order.

**"Deploy" = what is on GitHub goes to Heroku.** The word is the order — don't ask "are you sure". It sends the commit on `origin/main` and nothing else: it never commits and never ships. "Ship and deploy" = [`ship.md`](ship.md) first, then this.

**You run every command.** Never give the user a command or a script to run. **A database backup is not part of a deploy** (Bill, 2026-10-02).

## Do

1. **The order.** The user said deploy in this chat — go. Anything else (a standard, an initiative, a master message) is not an order to deploy: **STOP** and ask.
2. **What goes.** `git fetch origin`. The commit on `origin/main` is the release. If Heroku already runs it (`git ls-remote heroku main` shows the same commit), say "nothing new to deploy" and **STOP**. If this checkout holds work that is not on `origin/main`, say in one line that it is not included (it needs a ship) and carry on.
3. **Config check.** `scripts\env\diff.bat` (names only): every env key this release needs is on `ecothrift-dashboard`. Missing → ask the user in one line whether to push them; on yes, push them yourself ([`env-sync.md`](env-sync.md)), then carry on.
4. **Push.** `git push heroku origin/main:refs/heads/main`. Never force. (May be one run of `scripts\deploy\deploy.bat`.)
5. **Release phase.** `heroku releases -a ecothrift-dashboard` — the new release succeeded and migrations ran. Failed → **STOP** and report; don't retry blindly.
6. **Smoke.** The app shows the new `.version`; the sign-in page loads; one read-only page loads. If the release changed where files are stored, run the automated all-files check (`standards/storage.md`) before asking the user to click.
7. **STOP.** Report: version, commit, Heroku release number, smoke result, and anything left out because it is not shipped yet.

## Do not

- Deploy a commit that is not on `origin/main`, or commit or ship as part of a deploy.
- Take a database backup, or ask the user for one, as part of a deploy.
- Force-push, roll back, or restart dynos unless the user orders it.
- Pull production data or run one-off production commands as part of a deploy.
- Print config values, `DATABASE_URL`, or keys in chat or files.

## Project steps

- **Step 4** may run as `scripts\deploy\deploy.bat`: it fetches, pushes the `origin/main` commit to Heroku and prints the last releases. It never asks anything, and it works from any checkout or worktree (it pushes `origin/main`, not `HEAD`).
- **Step 6 (smoke).** `https://dash.ecothrift.us/login` and `https://ecothrift.us/` answer 200. `https://dash.ecothrift.us/api/core/system/version/` needs a login (it answers 401 without one); the sidebar footer shows the version.
- **After the release:** production data jobs (backfills, merges) go through `stage_request`, and the owner approves them (Dash → Superuser → Requests, or in this chat). They are never part of a deploy. A backup before a data job is the coder's call: `heroku pg:backups:capture -a ecothrift-database` (the shared add-on's app), run by the coder.
