<!-- Last updated: 2026-08-27 -->
# Protocol: Ship and push GitHub

**IF** this file is `@`-mentioned **OR** the user says ship-push-git / push to git / push to GitHub
**THEN** do every numbered step below, in order. Do not skip. Do not invent extra steps.

This protocol always commits and pushes to GitHub. Every GitHub push is a release. Prod reads `.version` from `GET /api/core/system/version/` and the sidebar footer.

## 1. Docs audit

For each row: **IF** the condition is true **THEN** edit that file. If not, leave it.

| File | Edit when |
|------|-----------|
| `.ai/context.md` | Capability, Known Issue, Hidden UI, Extended TOC, or Active work is wrong |
| `.ai/initiatives/_index.md` | An Active row's phase or notes changed |
| `.ai/initiatives/<initiative>.md` | Acceptance, phase, or Record of what shipped changed |
| `.ai/extended/<domain>.md` | Models, routes, auth, URLs, or behavior in that domain changed |
| Root `README.md` | Onboarding or protocol paths changed |

On every file you edit: bump `<!-- Last updated -->`.
**IF** you add, rename, or remove an `.ai/extended/` file **THEN** update the Extended TOC in `context.md`.

Never put secrets in the commit. Never bump `frontend/package.json` (stays `0.0.0`). Never copy version history into `context.md`.

## 2. Version

`.version` line 1 = `vMAJOR.MINOR.PATCH`. Root `package.json` `"version"` = the same number without `v`. Bump both.

| Change in this ship | Bump |
|---------------------|------|
| Breaking API; dropped endpoint or client-used field; destructive shipped-data migration | **MAJOR** |
| New endpoint, command, page, model/field, workflow, or feature toggle | **MINOR** |
| Bug fix, perf, prompt tuning, dependency bump, docs-only or trivial push | **PATCH** |

Highest bucket wins.
**IF** PATCH vs MINOR is unclear **THEN** PATCH.
**IF** MAJOR vs MINOR is unclear **THEN** STOP and ask. Do not bump yet.

Name the initiative (or `outside initiatives`) on the CHANGELOG theme line.

## 3. CHANGELOG

Write a dated section at the **top**:

```md
## [MAJOR.MINOR.PATCH] — YYYY-MM-DD

User-facing theme: **<one sentence>**.

### Added / Changed / Fixed / Removed / Documentation
- 1–2 sentence bullets; backticks for files, endpoints, commands, migrations.
```

Keep only subsections you have. Move bullets out of `## [Unreleased]`. **IF** `[Unreleased]` is empty **THEN** delete that heading. Dates `YYYY-MM-DD`. Newest version first.

## 4. Verify versions match

Run:

```bat
type .version
findstr /C:"\"version\"" package.json
findstr /C:"\"version\"" frontend\package.json
findstr /N /C:"## [" CHANGELOG.md
```

`frontend/package.json` must still be `0.0.0`.
Top dated `CHANGELOG` header must match `.version` without the `v`.
**IF** they disagree **THEN** fix them before continuing.

## 5. Pre-commit

Run:

```bat
cd frontend && npx tsc --noEmit
```

```bat
python -c "import compileall,sys; sys.exit(0 if compileall.compile_dir('apps', quiet=1) else 1)"
```

Scan `git diff` for `.env`, keys, tokens.
**IF** any check fails **THEN** STOP. Fix. Do not commit.

## 6. Commit and push GitHub

Replace the entire file `scripts/deploy/commit_message.txt`:

- Line 1: `feat:` / `fix:` / `docs:` / `chore:` subject. Must not be `---`.
- Blank line.
- Body. Include `Release: vX.Y.Z`.

Then run:

```bat
scripts\deploy\2_push_github.bat --called
```

That bat stages, commits `-F` the whole message file, and `git push origin main`.
**IF** you already committed this tree and it is dirty again **THEN** write a new `commit_message.txt` and run the bat again.

Never force-push. Never `--no-verify`. Never amend a pushed commit. Never pull production data.

After a successful push the bat resets `commit_message.txt` to `---`. Leave it.

## 7. Report

STOP. Tell the user the version and the GitHub commit.
