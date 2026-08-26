<!-- Last updated: 2026-08-26 (no prod data pull) -->
# Protocol: Ship

Docs audit → semver bump → `CHANGELOG` → commit → GitHub push.

**Every GitHub push is a release.** Production shows `.version` via `GET /api/core/system/version/` and the staff sidebar footer. Pushing without a bump ships code while the live version string stays unchanged.

Invoke with `@.ai/protocols/ship.md`. Do not push unless the user asked.

---

## 1. Docs audit

Touch a file only if this work changed the reality it documents, or the file has drifted.

| File | Touch when |
|------|------------|
| `.ai/context.md` | Capability, Known Issue, Hidden UI, Extended TOC, or compass is wrong |
| `.ai/initiatives/_index.md` | Active initiative phase or notes changed |
| `.ai/initiatives/<initiative>.md` | Acceptance / phase / record of what shipped |
| `.ai/extended/<domain>.md` | Models, routes, auth, URLs, or behavior in that domain changed |
| Root `README.md` | Onboarding or protocol paths changed |

Bump `<!-- Last updated -->` on every file you edit. If you add/rename/remove an extended file, update the Extended TOC in `context.md`.

**Never:** secrets in the commit; bump `frontend/package.json` (stays `0.0.0`); duplicate version history into `context.md`.

---

## 2. Semver (mandatory on push)

`.version` line 1 is `vMAJOR.MINOR.PATCH`. Root `package.json` `"version"` is the same number **without** `v`. Bump both together.

| Change | Bump |
|--------|------|
| Breaking API; dropped endpoint or client-used field; destructive shipped-data migration | **MAJOR** |
| New endpoint, command, page, model/field, workflow, or feature toggle | **MINOR** |
| Bug fix, perf, prompt tuning, dependency bump, docs-only or trivial push | **PATCH** |

Highest bucket in the change list wins. PATCH vs MINOR unsure → **PATCH**. MAJOR vs MINOR unsure → **stop and ask**. Name the initiative (or "outside initiatives") on the CHANGELOG theme line.

Verify:

```bash
cat .version
grep '"version"' package.json | head -1
grep '"version"' frontend/package.json | head -1   # must remain 0.0.0
grep -m1 '^## \[' CHANGELOG.md
```

Top dated `CHANGELOG` header must match `.version` (without `v`).

---

## 3. CHANGELOG

Add a dated section at the **top**:

```md
## [MAJOR.MINOR.PATCH] — YYYY-MM-DD

User-facing theme: **<one sentence>**.

### Added / Changed / Fixed / Removed / Documentation
- 1–2 sentence bullets; backticks for files, endpoints, commands, migrations.
```

Keep only subsections you have. Move bullets out of `## [Unreleased]`; **delete `[Unreleased]` when empty**. Dates are `YYYY-MM-DD`. Versions descending from the top.

If you are **not** pushing yet: write under `[Unreleased]` only — do not bump `.version`.

---

## 4. Pre-commit

- `cd frontend && npx tsc --noEmit`
- Python: `python -c "import compileall; compileall.compile_dir('apps', quiet=1)"` for touched apps
- No secrets in `git diff` (`.env`, keys, tokens)
- `frontend/package.json` still `0.0.0`

**Commit only when the user asks.** Local-only save: `git add .` then `git commit -m "type: short subject"`. Do not push from this step.

---

## 5. Push (when the user asks)

Fill [`scripts/deploy/commit_message.txt`](../../scripts/deploy/commit_message.txt):

- **Line 1** = conventional subject (`feat:`, `fix:`, `docs:`, `chore:`). Must **not** be `---`.
- Blank line, then body (bullets OK). Include `Release: vX.Y.Z`.

`2_push_github.bat` runs `git add .`, then `git commit -F` on the **entire** file, then `git push origin main`. Skip a separate short commit unless you already committed and the tree is dirty again.

```bat
scripts\deploy\2_push_github.bat
```

Prompts `Y` to confirm. `--called` skips the prompt (only when the user invoked this protocol). After a successful push the bat resets `commit_message.txt` to a single line `---` — **replace the whole file** before the next push.

Never force-push. Never `--no-verify`. Never amend a pushed commit.

Do **not** pull production data as part of ship.

Optional Heroku: `scripts\deploy\3_push_heroku.bat` — confirm the live version matches the bump.

Non-Windows equivalent: `git add . && git commit -F scripts/deploy/commit_message.txt && git push origin main`.
