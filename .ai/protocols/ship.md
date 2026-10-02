<!-- Canonical: C:\Coding\.ai\templates\protocols\ship.md — v3 2026-10-02 (was ship-git.md). Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Ship

**IF** this file is `@`-mentioned **OR** the user says ship / ship it / push to GitHub
**THEN** do every step below, in order.

**"Ship" = this release goes to GitHub:** changelog, version, commit message, `git add`, `git commit`, `git push`. The word is the order — don't ask "are you sure". It never touches Heroku; that is the word **deploy** ([`deploy.md`](deploy.md)). "Ship and deploy" = this protocol, then that one.

**You run every command.** Never give the user a command or a script to run.

## Do

1. **The order.** The user said ship in this chat — go. Anything else (a standard, an initiative, a master message) is not an order to ship: **STOP** and ask.
2. **Due standards items.** Read [`.ai/initiatives/standards.md`](../initiatives/standards.md) § Open. A row is **due** when Due is `next-ship`, an `after:` date that has passed, or an `after:<row>` whose row is done.
   - Due **S** rows: list them — "Due standards items: T12 …, T15 … — add to this release?" For each the user accepts: do it now, run the tests, note it under `[Unreleased]`, move the row to **Done** with this release's version.
   - Due **M / X / `bill`** rows: list them as "due, needs you" and do nothing else with them here.
   - Nothing due: say so in one line.
3. **Check the tree.** `git status`. Nothing secret or real data staged (`.env*`, keys, dumps, exports, `workspace/`). Run the test command named in `context.md` — every test file collected, on Postgres (house rule); report failures against the known baseline and ask before continuing if anything is new.
4. **Pick the bump** (`C:\Coding\.ai\standards\protocols.md`): PATCH = fixes only · MINOR = new feature or migration · MAJOR = breaking for users or a platform jump. Tell the user the bump and why in one line.
5. **CHANGELOG.md** — rename `## [Unreleased]` → `## [vX.Y.Z] — YYYY-MM-DD` (America/Chicago). Add a fresh empty `## [Unreleased]` above it.
6. **`.version`** — write `vX.Y.Z` (one line).
7. **`.ai/context.md`** — fix **Active work** if this release finished or changed something there. Never write the semver into the compass.
8. **`scripts/deploy/commit_message.txt`** — first line `vX.Y.Z — <one-line summary>`, blank line, then the changelog section body.
9. **Commit:** `git add -A` then `git commit --file=scripts/deploy/commit_message.txt`.
10. **Push:** `git push origin main`. Never force. (Steps 9–10 may be one run of `scripts\deploy\ship.bat`.)
11. **STOP.** Report: version, commit hash, that `origin/main` has it, standards rows done in this release, due rows still waiting on the user. Say in one line that it is not on Heroku until the user says deploy.

## Do not

- Bump `.version` or rename `[Unreleased]` anywhere except this protocol.
- Do an M, X, or `bill` standards row inside a ship.
- Force-push, rewrite history, or push a branch other than the one the user named.
- Push to Heroku from here — that is [`deploy.md`](deploy.md), and only on the word deploy.
- Change git config unless the user orders it. If git has no identity, say so once; on the user's answer, set it yourself.

## Project steps

- **Other threads (before step 2).** `git fetch origin`. If `origin/main` moved, merge it and bump past the newest version on `main`. Never ship half-done work: when the main tree holds later, unshipped work (or `comm/RUNNING-NOW.md` says so), ship from a worktree on `origin/main` under `C:\Coding\_worktrees\ecothrift-dashboard--<slug>`: apply only this release's files there, bump and commit there, then `git push origin <branch>:main`. The dated walk-through is in [`calendar.md`](../calendar.md).
- **Tests (step 3).** `python scripts/dev/lean_test.py tsc` on the exact tree being pushed when the front end changed (Heroku's build runs `tsc` and rejects the deploy on any error), plus `python -c "import compileall,sys; sys.exit(0 if compileall.compile_dir('apps', quiet=1) else 1)"`. Known failures: [`comm/runner/baseline.md`](../comm/runner/baseline.md). A seeded setting's description is at most 255 characters (a longer one fails the release phase).
- **Docs audit (before step 4).** Fix any of these the release made wrong, and bump each file's `<!-- Last updated -->`: `context.md` (Active work, Extended docs TOC), `initiatives/_index.md` and the initiative file (phase, `## Record`), `extended/<domain>.md` (models, routes, auth, behaviour), `extended/known-issues.md`, root `README.md` (onboarding).
- **Version (step 6).** Root `package.json` `"version"` = `.version` without the `v` (Heroku builds from it); the file must stay valid JSON. `frontend/package.json` stays `0.0.0`. Name the initiative (or "outside initiatives") on the CHANGELOG theme line.
- **Steps 9–10** may run as `scripts\deploy\ship.bat` (optional argument: the branch to push to `main`, for a worktree). It never asks anything. Never run it from a tree that holds later, unshipped work.
- **Print server** releases separately: [`ship-print-server.md`](ship-print-server.md) (`VERSION` in `printserver/config.py`, not `.version`).
