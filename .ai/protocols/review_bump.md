<!-- Last updated: 2026-03-28T12:45:00-05:00 -->
# Protocol: Review, Version Bump, Pre-Commit, Handoff

Single gate for **documentation audit**, **release bookkeeping**, **commit discipline**, **session handoff**, and **deploy** (when applicable). Only run deploy steps when the user explicitly asks.

---

## Part A — Context and documentation review

1. **Read `.ai/context.md`.**
   - Verify the "Current State" section matches reality (working features, known issues, not-yet-implemented).
   - Update any stale information and the `<!-- Last updated: ... -->` timestamp.

2. **Verify version alignment.**
   - Repo root `.version` (line 1: `vMAJOR.MINOR.PATCH`) must match the latest released section in root `CHANGELOG.md`.
   - Root `package.json` `"version"` must use the same numeric semver as `.version` (without the `v` prefix) for Heroku/Node metadata.

3. **Extended context (on demand).**
   - If you changed a domain, spot-check the matching `.ai/extended/<domain>.md` and update timestamps on files you correct.
   - There is no TOC file — use filenames (`backend.md`, `frontend.md`, `auth-and-roles.md`, `pos-system.md`, `inventory-pipeline.md`, `consignment.md`, `print-server.md`, `cash-management.md`, `databases.md`).

4. **Initiatives (required context).**
   - Read **`.ai/initiatives/_index.md`** for **active**, **on hold**, and **backlog** rows, and **`.ai/initiatives/_archived/ARCHIVE.md`** for archived work. Priorities also live in `CHANGELOG.md` (`[Unreleased]`) and the user’s message.
   - **Traceability:** Shipping code should map to a **named initiative** (file + row in `_index.md`) when the work is feature-sized or multi-session. If the work is an emergency hotfix or outside initiative tracking, that should be explicit in `[Unreleased]` / the release notes.
   - **Archiving:** Moving an initiative to `_archived/` is **out of scope** for a routine review unless the **user asked** for it. Never archive initiatives silently; **ask** for explicit confirmation.

5. **Root `CHANGELOG.md`.**
   - Verify the latest released entry matches what shipped; keep `[Unreleased]` at the top for work-in-progress notes when appropriate.

---

## Part B — AI extended docs (`.ai/extended/`)

6. **`development.md`** — Setup steps and env vars vs root `.env` and `requirements.txt`.

7. **Domain files** (`backend.md`, `frontend.md`, `inventory-pipeline.md`, `databases.md`, etc.) — Spot-check vs `models.py`, `views.py`, `App.tsx` when you changed those areas.

8. **`retag-operations.md`** / **`inventory-pipeline.md`** — When retag or import commands change.

After edits: update `<!-- Last updated: ... -->` on every file you changed. Report what was stale or fixed.

---

## Part C — Version bump (release-worthy changes only)

**Initiative clarity before you bump (gate).** **Major / minor / patch** still follow **user-visible behavior and API contract** (see `.ai/initiatives/_index.md` — not “one semver bump per initiative file”). But a **version bump must not happen in a vacuum:** you should be able to name **which initiative** the release fulfills (or a small set), or state clearly **why** the change is outside initiatives (e.g. security hotfix, infra-only chore). **If you cannot determine which initiative is being shipped** — or that the user intentionally has no initiative for this work — **stop and resolve it:** ask the user to name the initiative in scope, or to **create** one (add `descriptive_snake_name.md` under `.ai/initiatives/` and a row in `_index.md`, per that file). Proceed with Part C only once that is clear.

11. **Bump repo root `.version`** — one line, e.g. `v2.1.0`.

12. **Bump root `package.json` `version`** to the same numeric value (no `v`).

13. **Add a section to root `CHANGELOG.md`** for the new version (move items out of `[Unreleased]` if needed). Cite the relevant **initiative** filename(s) in bullets when they match shipped work.

---

## Part D — Commit message staging

14. **Write the next commit message** to `scripts/deploy/commit_message.txt` (not the placeholder `---`).

15. **Pre-commit checklist**
    - `cd frontend && npx tsc --noEmit`
    - Python: `python -c "import compileall; compileall.compile_dir('apps', quiet=1)"` for touched apps
    - Linter clean on edited files
    - No secrets in diff (.env, keys, tokens)
    - `git diff --cached` review

16. **Conventional commit format**

```
<type>: <short description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`.

17. **Commit only when the user explicitly asks.** Then reset `scripts/deploy/commit_message.txt` to `---` for the next commit.

18. **Push to GitHub** (when user asks): `git push origin main` — remote `origin`, branch `main`. Never force-push; never `--no-verify`; do not amend pushed commits.

---

## Part E — Deploy to Heroku (user must request)

19. **Pre-deploy**
    - Clean `git status`
    - TypeScript: `cd frontend && npx tsc --noEmit`
    - Frontend build: `cd frontend && npx vite build`
    - `python manage.py check`
    - Migrations applied / committed
    - Version bump committed if this release includes one (`.version`, `package.json`, `CHANGELOG.md`)

20. **Heroku configuration**
    - `DJANGO_SETTINGS_MODULE=ecothrift.settings_production`
    - **Procfile:** `release: python manage.py migrate && python manage.py create_cache_table` — `web: gunicorn ecothrift.wsgi --log-file - --timeout 120`
    - Root `package.json` `heroku-postbuild` builds the frontend; WhiteNoise serves `frontend/dist/`

21. **Deploy:** `git push heroku main` — verify release phase in logs, app loads, login works, sidebar/settings version matches `.version`.

22. **Rollback:** `heroku rollback` — logs: `heroku logs --tail`

23. **Heroku env (representative):** `SECRET_KEY`, `DATABASE_URL`, `DJANGO_SETTINGS_MODULE`, `ALLOWED_HOSTS`, `AWS_*` for S3.

---

## Part F — Session handoff

24. Summarize what was done (files, bugs, decisions).

25. Update `.ai/context.md` "Current State" if needed.

26. Update relevant `.ai/extended/*.md` when models, routes, or auth changed.

27. If version was bumped, ensure `.version`, `package.json`, and `CHANGELOG.md` are already updated (Part C).

28. Unfinished work: note in `CHANGELOG.md` (`[Unreleased]`) instead of burying only in context. Tie bullets to **initiatives** where possible (`.ai/initiatives/_index.md` for active work; `.ai/initiatives/_archived/ARCHIVE.md` for archived initiatives). If the next session cannot name which initiative continues the work, treat that as **missing steering** — user should clarify or add an initiative.

29. Next session: follow `.ai/protocols/startup.md`.
