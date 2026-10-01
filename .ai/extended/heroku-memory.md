# Heroku memory monitoring (post-deploy)

After deploying memory-related changes (pagination caps, Gunicorn, Django DB cache):

1. **Enable runtime metrics** (memory/CPU in log lines):

   ```bash
   heroku labs:enable log-runtime-metrics -a ecothrift-dashboard
   ```

2. **Watch the web dyno** for a few hours:

   ```bash
   heroku logs --tail --dyno web -a ecothrift-dashboard
   ```

3. **Confirm** R14/R15 (memory quota) errors stop appearing under normal load.

4. **Rollback** if needed: deploy is split so infra (Procfile, `max_page_size`, `CACHES`, PO list queryset) can be reverted separately from cached endpoints + frontend `page_size` changes.
