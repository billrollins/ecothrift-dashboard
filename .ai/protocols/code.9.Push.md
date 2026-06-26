<!-- Last updated: 2026-06-24 (push always requires semver release) -->
# Protocol: Review bump then push to GitHub

**Scope:** Run **`review.0.Bump.md`** (docs audit, **mandatory semver release**, **`CHANGELOG`**, exit checklist), prepare the **full** push commit message in **`scripts/deploy/commit_message.txt`**, then **`git add` / `git commit -F`** / **`git push origin main`** via **`scripts/deploy/2_push_github.bat`**.

This is **`review.0.Bump`** + remote push — **not** a substitute for **`session.9.Close.md`** when you still owe **`#### Result`**, initiative session bookkeeping, or **`session.9.Close`** Part 3 pre-commit gates unless you deliberately narrow scope.

---

## Why every push bumps version

**Every GitHub push is treated as a release.** Production shows the app version from repo root **`.version`** (via **`GET /api/core/system/version/`** and the staff sidebar footer). If you push without bumping, **main and Heroku can ship new code while the live version string stays unchanged** — you cannot tell from the UI whether deploy succeeded.

**Rule:** **`code.9.Push` always bumps `.version` + root `package.json` + adds a dated top section in `CHANGELOG.md`.** Never push with shipped work left only under **`[Unreleased]`**. Semver **level** (PATCH vs MINOR vs MAJOR) still follows **`review.0.Bump` Part 2B**; doc-only or trivial pushes use at least **PATCH**.

---

## Steps

1. **Follow [`review.0.Bump.md`](review.0.Bump.md)** through **Part 4A** (exit checklist): steering docs, **`frontend/package.json`** still **`0.0.0`**, no secrets in diffs.

2. **Semver (mandatory for this protocol):** Follow **`review.0.Bump` Part 2E (Push release)** — not the optional Part 2A gate:
   - Bump **`.version`** (line 1: `vMAJOR.MINOR.PATCH`) and root **`package.json`** `"version"` (same numeric semver, no `v`).
   - Add a **dated** **`## [MAJOR.MINOR.PATCH] — YYYY-MM-DD`** section at the top of **`CHANGELOG.md`** (**Part 3A**).
   - **Move** bullets from **`## [Unreleased]`** into that section; delete **`[Unreleased]`** when empty (repo convention).
   - Pick PATCH / MINOR / MAJOR per **Part 2B**; default **PATCH** when unsure between PATCH and MINOR.

3. **Verify before commit** (quick drift check):

   ```bash
   cat .version
   grep '"version"' package.json | head -1
   grep -m1 '^## \[' CHANGELOG.md
   ```

   Top **`CHANGELOG`** dated header must match **`.version`** (without `v`).

4. **`commit_message.txt`:** Complete **`scripts/deploy/commit_message.txt`** per **`review.0.Bump` Part 5** — **line 1** = conventional subject (**not** `---`, not placeholders). Blank line, then body (bullets OK). Include the **new version** in the body (e.g. `Release: v2.34.0`). This entire file becomes **`git commit -F`**.

5. **Skip `review.0.Bump` Part 4B** (`git commit -m "..."`): **`2_push_github.bat`** performs **`git add .`** and **`git commit -F commit_message.txt`**. Using Part 4B **and** this protocol yields **two** local commits unless the tree was clean before the bat — prefer **one** push commit when running **`code.9.Push`**.

6. **Push:** From repo root on **Windows**, run:

   ```bat
   scripts\deploy\2_push_github.bat
   ```

   The script prompts **`Y`** to confirm (shows subject line 1). To skip the prompt (e.g. automation only when the user **explicitly** invoked this protocol), run:

   ```bat
   scripts\deploy\2_push_github.bat --called
   ```

   **`--called`** still commits and pushes; it only skips the interactive **`Y/N`** prompt.

7. **After push (optional Heroku):** If deploying with **`scripts/deploy/3_push_heroku.bat`**, confirm the **live** app version matches the bump you just pushed (sidebar footer or version API). Mismatch means Heroku did not pick up the commit you expect.

8. **Non-Windows:** Equivalent:

   ```bash
   git add .
   git commit -F scripts/deploy/commit_message.txt
   git push origin main
   ```

   Respect the same **`commit_message.txt`** and **mandatory bump** rules as **`2_push_github.bat`**.

---

## Exit criteria

- **`review.0.Bump` Part 4A** satisfied (push path: **must** have bumped — see Part 2E).
- **`.version`**, root **`package.json`**, and top **`CHANGELOG.md`** dated section **all agree**.
- **`[Unreleased]`** empty or stub-only after the release move (no shipped work stranded there).
- **`commit_message.txt`** valid for the bat (**[`review.0.Bump` Part 5](review.0.Bump.md)**).
- **`git push origin main`** succeeded **or** user aborted at confirmation — never force-push.

---

## Relationship to other protocols

| Protocol | Role vs this one |
|---|---|
| **`review.0.Bump.md`** | Defines checklist, semver matrix, **`CHANGELOG`**, **`commit_message.txt`** shape — **Part 2E** is mandatory when this protocol runs |
| **`session.9.Close.md`** | Session **`Result`**, broader docs/version gates, optional push — use when closing a **named session**; if you push from close, use **`code.9.Push`** bump rules |
| **`session.1.Checkpoint.md`** | **`[Unreleased]`** only — **never** satisfies a push; bump happens here at push time |
| **`2_push_github.bat`** | Implements **`git add`**, **`git commit -F`**, **`git push`**; resets **`commit_message.txt`** to **`---`** on success |

---

## Next protocols

After push: replace **`scripts/deploy/commit_message.txt`** entirely before the next push (**[`review.0.Bump` Part 5](review.0.Bump.md)**). Next session start: **`code.0.Startup.md`**.
