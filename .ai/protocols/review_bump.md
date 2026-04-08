<!-- Last updated: 2026-04-07T18:30:00-05:00 -->
# Protocol: Review, Version Bump, Pre-Commit, Handoff

Single gate for **documentation audit**, **release bookkeeping**, **commit discipline**, and **session handoff**.

---

## Part A — Context and documentation review

1. **Read `.ai/context.md`.**
   - Verify the "Current State" section matches reality (working features, known issues, not-yet-implemented).
   - Update any stale information and the `<!-- Last updated: ... -->` timestamp.

2. **Verify version alignment.**
   - Repo root `.version` (line 1: `vMAJOR.MINOR.PATCH`) must match the latest released section in root `CHANGELOG.md`.
   - Root `package.json` `"version"` must use the same numeric semver as `.version` (without the `v` prefix).

3. **Extended context (on demand).**
   - If you changed a domain, spot-check the matching `.ai/extended/<domain>.md` and update timestamps on files you correct.
   - There is no TOC file — use filenames (`backend.md`, `frontend.md`, `auth-and-roles.md`, `pos-system.md`, `inventory-pipeline.md`, `consignment.md`, `print-server.md`, `cash-management.md`, `databases.md`).

4. **Initiatives (required context).**
   - Read **`.ai/initiatives/_index.md`** for **active**, **on hold**, and **backlog** rows, and **`.ai/initiatives/_archived/ARCHIVE.md`** for archived work. Priorities also live in `CHANGELOG.md` (`[Unreleased]`) and the user’s message.
   - **Traceability:** Shipping code should map to a **named initiative** (file + row in `_index.md`) when the work is feature-sized or multi-session. If the work is an emergency hotfix or outside initiative tracking, that should be explicit in `[Unreleased]` / the release notes.
   - **Archiving:** Moving an initiative to `_archived/` is **out of scope** for a routine review unless the **user asked** for it. Never archive initiatives silently; **ask** for explicit confirmation. Initiative **lifecycle** steps (`activate_initiative`, `move_initiative_to_pending`, `_backlog`, `_completed`, `_abandoned`) live under [`.ai/initiatives/_archived/_protocols/`](../initiatives/_archived/_protocols/README.md) (see **`README.md`** there). The stub [`.ai/protocols/move_to_pending.md`](./move_to_pending.md) redirects to `move_initiative_to_pending.md`.
   - **Django admin vs React `/admin/*`:** `contrib.admin` is mounted at **`/db-admin/`**; React staff routes (settings, users, POS setup, etc.) stay under **`/admin/*`**. When reviewing or editing **`ecothrift/urls.py`** or **`frontend/vite.config.ts`**, do not reintroduce **`path('admin/', admin.site.urls)`** or a Vite proxy of **`/admin`** to Django — that breaks hard refresh on in-app admin pages. See [`.ai/extended/frontend.md`](../extended/frontend.md) (Vite proxy) and initiative [`django_admin_legacy_navigation.md`](../initiatives/_archived/_completed/django_admin_legacy_navigation.md) (archived completed).
   - **Retag v2 history (`GET /api/inventory/retag/v2/history/`):** `RetagLog.retagged_by` is **`accounts.User`** (`AbstractBaseUser` + `PermissionsMixin`, not `AbstractUser`). Use **`user.full_name`** (property: `first_name` + `last_name`) in serializers/views — not **`get_full_name()`**, which Django only defines on **`AbstractUser`**. A mistaken **`get_full_name()`** call returns HTTP 500. Frontend retag history defaults and **`since`** behavior live in **`frontend/src/pages/inventory/RetagPage.tsx`**; see [`.ai/extended/retag-operations.md`](../extended/retag-operations.md) when retag workflows change.

5. **Root `CHANGELOG.md`.**
   - Verify the latest released entry matches what shipped; keep `[Unreleased]` at the top for work-in-progress notes when appropriate.

6. **Root `README.md`.**
   - Keep **Quick Start** aligned with `.ai/extended/development.md` when setup commands or ports change.
   - Keep the **AI steering** subsection current: point to **`.ai/context.md`** (living “current state”), **`.ai/initiatives/_index.md`** (active initiatives), and **`.ai/initiatives/_archived/ARCHIVE.md`** (completed / archived / backlog buckets). Bump the `<!-- Last updated: ... -->` line at the top of `README.md` when you edit it.

---

## Part B — AI extended docs (`.ai/extended/`)

7. **`development.md`** — Setup steps and env vars vs root `.env` and `requirements.txt`.

8. **Domain files** (`backend.md`, `frontend.md`, `inventory-pipeline.md`, `databases.md`, etc.) — Spot-check vs `models.py`, `views.py`, `App.tsx` when you changed those areas.

9. **`retag-operations.md`** / **`inventory-pipeline.md`** — When retag or import commands change.

After edits: update `<!-- Last updated: ... -->` on every file you changed. Report what was stale or fixed.

---

## Part C — Version bump (release-worthy changes only)

**Initiative clarity before you bump (gate).** **Major / minor / patch** still follow **user-visible behavior and API contract** (see `.ai/initiatives/_index.md` — not “one semver bump per initiative file”). But a **version bump must not happen in a vacuum:** you should be able to name **which initiative** the release fulfills (or a small set), or state clearly **why** the change is outside initiatives (e.g. security hotfix, infra-only chore). **If you cannot determine which initiative is being shipped** — or that the user intentionally has no initiative for this work — **stop and resolve it:** ask the user to name the initiative in scope, or to **create** one (add `descriptive_snake_name.md` under `.ai/initiatives/` and a row in `_index.md`, per that file). Proceed with Part C only once that is clear.

10. **Bump repo root `.version`** — one line, e.g. `v2.1.0`.

11. **Bump root `package.json` `version`** to the same numeric value (no `v`).

12. **Add a section to root `CHANGELOG.md`** for the new version (move items out of `[Unreleased]` if needed). Cite the relevant **initiative** filename(s) in bullets when they match shipped work.

---

## Part D — Commit message staging

13. **`scripts/deploy/commit_message.txt` — append, do not replace.**
    - The file is a **running log of work done since the last git commit** (across sessions until the user commits).
    - **Deploy scripts use only the first line.** `scripts/deploy/2_push_github.bat` (and the other deploy `.bat` files that read this file) take the **first line** and use it as the **entire** `git commit -F` message. It treats the first line as a **not-ready** placeholder if it is exactly `---` or the legacy string `update this with your next commit message`. **Before push, line 1 must be a real conventional commit subject** (see §15), not `---`.
    - **Never put `---` on line 1** when you intend to commit or push. After a successful push/commit reset, the file may be reset to a single line `---` (see §16); that is only for the **start** of the next work window. As soon as you write a subject for the upcoming commit, **put that subject on line 1**. Optional body text can follow on lines 2+ for human reading, but the batch file **does not** forward those lines to `git commit` — only line 1 is committed via that script.
    - **Do not overwrite** existing content when new work is staged for the same upcoming commit. **Append** new entries (e.g. a dated or titled block per session or per batch of changes).
    - Each append should add enough detail to be useful at commit time: what changed, why, paths or areas touched; cite **`CHANGELOG.md`** (`[Unreleased]` or the version section being prepared) and relevant **initiative** `.md` files when the work is tracked.
    - If the file is still the placeholder `---` or empty, you may start the log from scratch for that commit window — but **before** the user runs `2_push_github.bat`, replace line 1 with the real subject (you can keep `---` **below** line 1 as a separator between the subject and older review_bump blocks).
    - Optional separator **between** append blocks (e.g. `---` after the subject, or `### 2026-04-06` / session note) keeps multi-session logs readable — use **`---` only after line 1**, not as line 1.

14. **Pre-commit checklist**
    - `cd frontend && npx tsc --noEmit`
    - Python: `python -c "import compileall; compileall.compile_dir('apps', quiet=1)"` for touched apps
    - Linter clean on edited files
    - No secrets in diff (.env, keys, tokens)
    - `git diff --cached` review

15. **Conventional commit format**

```
<type>: <short description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`.

16. **Commit only when the user explicitly asks.** After a successful manual commit, **reset** `scripts/deploy/commit_message.txt` to the placeholder `---` so the next work window starts a **new** log (append cycle begins again from empty/placeholder). **`2_push_github.bat` (standalone)** also overwrites the file with `---` after a successful push — same rule: the **next** run will error until line 1 is a real subject again. Do not leave only `---` on line 1 once the user is ready to ship; set the conventional subject on line 1 first, then append detail.

17. **Push to GitHub** (when user asks): `git push origin main` — remote `origin`, branch `main`. Never force-push; never `--no-verify`; do not amend pushed commits.

---

## Part E — Session handoff

18. Summarize what was done (files, bugs, decisions).

19. Update `.ai/context.md` "Current State" if needed.

20. Update root **`README.md`** steering subsection if initiatives, version story, or onboarding paths changed (see Part A §6).

21. Update relevant `.ai/extended/*.md` when models, routes, or auth changed.

22. If version was bumped, ensure `.version`, `package.json`, and `CHANGELOG.md` are already updated (Part C).

23. Unfinished work: note in `CHANGELOG.md` (`[Unreleased]`) instead of burying only in context. Tie bullets to **initiatives** where possible (`.ai/initiatives/_index.md` for active work; `.ai/initiatives/_archived/ARCHIVE.md` for archived initiatives). If the next session cannot name which initiative continues the work, treat that as **missing steering** — user should clarify or add an initiative.

24. Next session: follow `.ai/protocols/startup.md`.
