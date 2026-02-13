<!-- Last updated: 2026-02-13T12:00:00-06:00 -->
# Procedure: Commit Protocol

Rules and steps for committing code and pushing to GitHub.

---

## When to Commit

- **Only when the user explicitly asks.** Never commit proactively.
- Group related changes into a single logical commit.
- Do not commit half-finished features.

---

## Pre-Commit Checklist

1. **Run TypeScript check:** `cd frontend && npx tsc --noEmit`
2. **Run Python syntax check:** `python -c "import compileall; compileall.compile_dir('apps', quiet=1)"` on changed apps.
3. **Check for linter errors** on recently edited files.
4. **Verify no secrets** are staged (.env, credentials, API keys, tokens).
5. **Review staged changes:** `git diff --cached` to confirm what's being committed.

---

## Commit Message Format

Use conventional commit style:

```
<type>: <short description>

<optional body explaining why, not what>
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code restructuring without behavior change
- `docs` — Documentation only
- `style` — Formatting, whitespace (no logic change)
- `chore` — Build config, dependencies, tooling

**Examples:**
```
feat: add 4-week revenue comparison to dashboard

fix: resolve clock-in 400 error by making TimeEntry fields optional

docs: add .ai/ context folder with procedures and extended context
```

---

## Push to GitHub

After a successful commit, push to GitHub:

```bash
git push origin main
```

- **Remote:** `origin` → `https://github.com/billrollins/ecothrift-dashboard.git`
- **Branch:** `main`
- Always push after committing unless the user says otherwise.
- Run `git status` after pushing to verify the branch is up to date.

> **Note:** Pushing to Heroku for deployment is a separate procedure. See `.ai/procedures/deploy.md`.

---

## Safety Rules

- **Never** force push (`git push --force`).
- **Never** skip hooks (`--no-verify`).
- **Never** amend a commit that has been pushed to remote.
- **Never** amend someone else's commit.
- **Never** run interactive git commands (`git rebase -i`, `git add -i`).
- Use HEREDOC syntax for multi-line commit messages.
- Run `git status` after committing to verify success.
