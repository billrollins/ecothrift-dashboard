<!-- Last updated: 2026-08-27 -->
# Protocol: Ship, push GitHub, push Heroku

**IF** this file is `@`-mentioned **OR** the user says ship-push-heroku / push to Heroku / deploy to Heroku
**THEN** do every numbered step below, in order. Do not skip. Do not invent extra steps.

## 1. GitHub

Execute [ship-push-git.md](ship-push-git.md) to completion (docs, version, changelog, commit, `origin/main`).
**IF** that protocol STOPs early **THEN** STOP here. Do not push Heroku.

## 2. Heroku

Run:

```bat
git push heroku main
```

Do not use `3_push_heroku.bat` (its prompt is unreliable). Never force-push. Never pull production data.

## 3. Confirm

Live `.version` must match the bump. Check `heroku releases -a ecothrift-dashboard -n 3` and/or `GET /api/core/system/version/`.
**IF** they disagree **THEN** say so. Do not invent a version.

## 4. Report

STOP. Tell the user the version, the GitHub commit, and the Heroku release.
