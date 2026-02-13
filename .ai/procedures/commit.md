<!-- Last updated: 2026-02-13T10:53:00-06:00 -->
# Procedure: Commit Protocol

Rules and steps for creating git commits.

---

## When to Commit

- **Only when the user explicitly asks.** Never commit proactively.
- Group related changes into a single logical commit.
- Do not commit half-finished features.

---

## Pre-Commit Checklist

1. **Run TypeScript check:** `cd frontend && npx tsc --noEmit`
2. **Run Python syntax check:** `python -c "import py_compile; ..."` on changed files.
3. **Check for linter errors** on recently edited files.
4. **Verify no secrets** are staged (.env, credentials, API keys).
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

## Safety Rules

- **Never** force push (`git push --force`).
- **Never** skip hooks (`--no-verify`).
- **Never** amend a commit that has been pushed to remote.
- **Never** amend someone else's commit.
- **Never** run interactive git commands (`git rebase -i`, `git add -i`).
- Use HEREDOC syntax for multi-line commit messages.
- Run `git status` after committing to verify success.
