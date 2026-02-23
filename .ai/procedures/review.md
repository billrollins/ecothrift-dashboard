<!-- Last updated: 2026-02-19T14:00:00-06:00 -->
# Procedure: Context and Documentation Review

How to audit project documentation for accuracy and freshness.

---

## Context Files Review (.ai/)

1. **Read `.ai/context.md`.**
   - Verify the "Current State" section matches reality (working features, known issues, not-yet-implemented).
   - Update any stale information.
   - Update the timestamp.

2. **Check `.ai/version.json`.**
   - Verify the version matches what's deployed / what the changelog says.

3. **Scan `.ai/extended/TOC.md`.**
   - For each file listed, check the "Last Updated" date.
   - Prioritize reviewing files that haven't been updated in a while.
   - For each extended file, spot-check 2-3 facts against the actual code.
   - Update timestamps on any files you correct.

4. **Check `.ai/changelog.md`.**
   - Verify the latest entry matches what's actually in the codebase.

---

## Code Documentation Review (docs/)

5. **Review `docs/architecture.md`.**
   - Verify tech stack versions match `requirements.txt` and `frontend/package.json`.
   - Verify the project layout tree matches actual directories.

6. **Review `docs/data-models.md`.**
   - Spot-check 3-4 models against their actual `models.py` files.
   - Look for missing fields, wrong types, or outdated relationships.

7. **Review `docs/api-reference.md`.**
   - Spot-check 5-6 endpoints against their actual views and URL patterns.
   - Look for missing endpoints or incorrect auth requirements.

8. **Review `docs/frontend-routes.md`.**
   - Verify routes against `App.tsx`.
   - Check that all pages listed actually exist.

9. **Review `docs/development.md`.**
   - Verify setup steps still work.
   - Check that environment variables match `.env`.

---

## After Review

- Update the `<!-- Last updated: ... -->` timestamp on every file you modified.
- Update the "Last Updated" column in `.ai/extended/TOC.md` for any extended files changed.
- Update the "Current State" section of `.ai/context.md` if anything changed.
- Report findings to the user: what was stale, what was corrected.
