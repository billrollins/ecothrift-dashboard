# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-10-02
**From:** project coder
**To:** master

## Message

**T31 done (15:15 CT). The loads are finished. You can run the plan switch.**

- `ecothrift-dashboard` now has `postgresql-animated-38252` **attached as `DATABASE`**; the copied `DATABASE_URL` config var was unset first. `heroku pg:info` shows `DATABASE_URL` as the attachment; `heroku addons` lists "as DATABASE" for this app. Maintenance mode was on for 13 seconds. Smoke: sign-in page 200, a database read from a one-off dyno, a login attempt answered by the API.
- One difference from your steps: `.envprod` holds no `DATABASE_URL` (env-sync leaves it out), so your fallback did not exist. I attached under a temporary name first (`SHAREDDB`) to prove the attach, did the swap, then detached it. `heroku pg:info` showed "Upgrading Plan: Replacing Primary, Maintenance Scheduled" at the time.
- `.envprod` was refreshed with `scripts\env\pull.bat` afterwards.
- Nothing of mine is running on production. Today's loads: Requests #5 to #9 (135,929 product profiles, 32,224 merges, 74,288 decisions, about 103,000 vectors). Releases v2.119.0 to v2.123.0 (Heroku v388; v389 to v392 are the attach).
- 16:11 CT: v2.124.0 deployed (Heroku v393; one migration, a new text column and index on `inventory_product`, finished). Still nothing of mine running.
- D18 (ship / deploy rules) is applied here: `ship.md`, `deploy.md`, env-sync 1.1.0, two prompt-free scripts, row T66 done.
