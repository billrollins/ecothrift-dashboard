<!-- Canonical: C:\Coding\.ai\templates\protocols\ship-git.md — v1 2026-09-30. Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Ship to GitHub

**IF** this file is `@`-mentioned **OR** the user says ship / ship git / push to GitHub / release
**THEN** do every step below, in order.

Shipping needs **the user's explicit order in this chat**. A standard, an initiative, or a master message is not an order to ship.

## Do

1. **Confirm the order.** If the user did not clearly say to ship/push in this chat, **STOP** and ask.
2. **Check the tree.** `git status`. Nothing secret staged (`.env`, `.envprod`, keys, dumps). Nothing written outside the repo. Run the test command named in `context.md`; report failures against the known baseline and ask whether to continue if anything is new.
3. **Pick the bump** (house rule, `C:\Coding\.ai\standards\protocols.md`):
   - PATCH = fixes only · MINOR = new feature or migration · MAJOR = breaking for users or a platform jump.
   - Tell the user the bump and why in one line.
4. **CHANGELOG.md** — rename `## [Unreleased]` → `## [vX.Y.Z] — YYYY-MM-DD` (America/Chicago). Add a fresh empty `## [Unreleased]` above it.
5. **`.version`** — write `vX.Y.Z` (one line).
6. **`.ai/context.md`** — fix **Active work** if this release finished or changed something there. Never write the semver into the compass.
7. **`scripts/deploy/commit_message.txt`** — first line `vX.Y.Z — <one-line summary>`, blank line, then the changelog section body.
8. **Commit:** `git add -A` then `git commit --file=scripts/deploy/commit_message.txt`.
9. **Push:** `git push origin main`. Never force-push.
10. **STOP.** Report: version, commit hash, that `origin/main` has it.

## Do not

- Bump `.version` or rename `[Unreleased]` anywhere except this protocol.
- Force-push, rewrite history, or push a branch other than the one the user named.
- Push to Heroku from here — that is [`ship-heroku.md`](ship-heroku.md).
- Commit `.env*`, dumps, or anything in `workspace/`.

## Project steps

- **Two coders (before step 2).** `git fetch origin`. If `origin/main` moved, merge it and bump past the newest version on `main`. Never ship another coder's half-done work: when the main tree holds later, unshipped phases (or `RUNNING-NOW.md` says so), ship the runner-tested snapshot from a worktree on `origin/main` (`git diff <base> refs/runner/R-NNN | git -C <worktree> apply --3way --index`), bump and commit there, `git push origin <branch>:main`, then `git reset --soft <ship commit>` in the main tree. The dated walk-through is in [`calendar.md`](../calendar.md).
- **Tests (step 2).** `python scripts/dev/lean_test.py tsc` on the exact tree being pushed (Heroku's build runs `tsc` and rejects the deploy on any error), plus `python -c "import compileall,sys; sys.exit(0 if compileall.compile_dir('apps', quiet=1) else 1)"`. Known failures: [`comm/runner/baseline.md`](../comm/runner/baseline.md).
- **Docs audit (before step 4).** Fix any of these the release made wrong, and bump each file's `<!-- Last updated -->`: `context.md` (Active work, Extended docs TOC), `initiatives/_index.md` and the initiative file (phase, `## Record`), `extended/<domain>.md` (models, routes, auth, behaviour), `extended/known-issues.md`, root `README.md` (onboarding).
- **Version (step 5).** Root `package.json` `"version"` = `.version` without the `v` (Heroku builds from it). `frontend/package.json` stays `0.0.0`. Name the initiative (or "outside initiatives") on the CHANGELOG theme line.
- **Steps 8–9** may run as `scripts\deploy\ship_git.bat --called`: it checks `commit_message.txt`, runs `git add -A`, `git commit -F`, `git push origin main`, then resets the message file to `---`. Never run it from a tree that holds later, unshipped phases.
- **Print server** releases separately: [`ship-print-server.md`](ship-print-server.md) (`VERSION` in `printserver/config.py`, not `.version`).
