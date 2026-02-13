<!-- Last updated: 2026-02-13T10:53:00-06:00 -->
# Procedure: Deployment Checklist

Steps for deploying to Heroku. Only execute when the user explicitly requests.

---

## Pre-Deploy Checklist

1. **All changes committed.** `git status` should be clean.
2. **TypeScript compiles:** `cd frontend && npx tsc --noEmit` — zero errors.
3. **Frontend builds:** `cd frontend && npx vite build` — success.
4. **Django system check:** `python manage.py check` — no issues.
5. **Migrations are up to date:** No unapplied migrations.
6. **Version bumped:**
   - Update `.ai/version.json` with new version, build_date, description.
   - Add entry to `.ai/changelog.md`.
   - Commit the version bump.

---

## Heroku Configuration

- **Settings module:** `DJANGO_SETTINGS_MODULE=ecothrift.settings_production`
- **Procfile:**
  - `release: python manage.py migrate && python manage.py createcachetable`
  - `web: gunicorn ecothrift.wsgi --bind 0.0.0.0:$PORT`
- **Root `package.json`** `heroku-postbuild` script builds the frontend.
- **WhiteNoise** serves static files from `frontend/dist/`.

---

## Deploy Steps

1. **Push to Heroku:** `git push heroku main`
2. **Verify release phase** ran migrations successfully (check Heroku logs).
3. **Verify the app loads** in browser.
4. **Verify login works** with the admin account.
5. **Check version** displays correctly in the sidebar and settings page.

---

## Rollback

If deployment fails:
```bash
heroku rollback
```

Check logs:
```bash
heroku logs --tail
```

---

## Environment Variables (Heroku)

Ensure these are set on the Heroku app:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key (different from local) |
| `DATABASE_URL` | Auto-set by Heroku Postgres addon |
| `DJANGO_SETTINGS_MODULE` | `ecothrift.settings_production` |
| `ALLOWED_HOSTS` | Your Heroku app domain |
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | S3 bucket name |
