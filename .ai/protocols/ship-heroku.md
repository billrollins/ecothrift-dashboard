<!-- Canonical: C:\Coding\.ai\templates\protocols\ship-heroku.md — v1 2026-09-30. Copy into <project>/.ai/protocols/ (core projects with a Heroku app), replacing APP with the Heroku app name. Project-only steps go in the marked section at the end. -->
# Protocol: Ship to Heroku

**IF** this file is `@`-mentioned **OR** the user says ship to Heroku / deploy / release to production
**THEN** do every step below, in order.

Deploying needs **the user's explicit order in this chat**. House rule: **GitHub first, always. Never Heroku-only.**

## Do

1. **Confirm the order.** If the user did not clearly say to deploy in this chat, **STOP** and ask.
2. **GitHub first.** Unless this exact commit is already on `origin/main`, run [`ship-git.md`](ship-git.md) to completion.
3. **Verify.** `git fetch origin` then confirm `HEAD` equals `origin/main`. If not, **STOP** (the deploy script must refuse too).
4. **Backup.** `heroku pg:backups:capture -a <shared DB app from C:\Coding\.ai\registry\infrastructure.md>`. The database is shared by several apps; the backup covers all of them. Note the backup id.
5. **Config check.** List any env keys this release added (names only). Confirm each is set on Heroku `ecothrift-dashboard` (`heroku config -a ecothrift-dashboard`, names only — never print values). If one is missing, **STOP** and tell the user; do not set it yourself unless they order it.
6. **Push.** `git push heroku main`. Never force.
7. **Release phase.** `heroku releases -a ecothrift-dashboard` — the new release succeeded and migrations ran. If the release phase failed, **STOP** and report; do not retry blindly.
8. **Smoke.** The app's version (footer or version endpoint) shows the new `.version`; the login page loads; one read-only page loads.
9. **STOP.** Report: version, GitHub commit, Heroku release number, backup id, smoke result.

## Do not

- Push to Heroku a commit that is not on `origin/main`.
- Force-push, roll back, or restart dynos unless the user orders it.
- Run an env sync to Heroku, pull production data, or run one-off production commands as part of a deploy.
- Print config values, `DATABASE_URL`, or keys in chat or files.

## Project steps

- Step 4 (backup): `scripts\db\backup_prod.bat` runs `heroku pg:backups:capture -a ecothrift-database` (the shared add-on's app).
- Step 6 from a ship worktree: `git push heroku <branch>:main` after `<branch>` is on `origin/main`. `scripts\deploy\ship_heroku.bat` does the push and refuses unless `HEAD == origin/main`.
- Step 8 (smoke): `https://dash.ecothrift.us/api/core/system/version/` shows the new version; the sidebar footer shows it too.
- After the release: production data jobs (backfills, merges) go through `stage_request` and the owner approves them in Dash → Requests. They are never part of the deploy.
