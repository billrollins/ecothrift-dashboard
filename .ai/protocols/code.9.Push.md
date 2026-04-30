<!-- Last updated: 2026-04-30 (initial protocol) -->
# Protocol: Review bump then push to GitHub

**Scope:** Run **`review.0.Bump.md`** (docs audit, semver gate, **`CHANGELOG`**, exit checklist), prepare the **full** push commit message in **`scripts/deploy/commit_message.txt`**, then **`git add` / `git commit -F`** / **`git push origin main`** via **`scripts/deploy/2_push_github.bat`**.

This is **`review.0.Bump`** + remote push — **not** a substitute for **`session.9.Close.md`** when you still owe **`#### Result`**, initiative session bookkeeping, or **`session.9.Close`** Part 3 pre-commit gates unless you deliberately narrow scope.

---

## Steps

1. **Follow [`review.0.Bump.md`](review.0.Bump.md)** through **Part 4A** (exit checklist): steering docs, **`CHANGELOG`** (**`[Unreleased]`** or dated release if you bumped **`.version`** per Part 2), **`frontend/package.json`** still **`0.0.0`**, no secrets in diffs.

2. **Semver:** Same gate as **`review.0.Bump` Part 2** — bump **`.version`** + root **`package.json`** + dated **`CHANGELOG`** section **only** when release criteria there are met. Otherwise keep work under **`[Unreleased]`**.

3. **`commit_message.txt`:** Complete **`scripts/deploy/commit_message.txt`** per **`review.0.Bump` Part 5** — **line 1** = conventional subject (**not** `---`, not placeholders). Blank line, then body (bullets OK). This entire file becomes **`git commit -F`**.

4. **Skip `review.0.Bump` Part 4B** (`git commit -m "..."`): **`2_push_github.bat`** performs **`git add .`** and **`git commit -F commit_message.txt`**. Using Part 4B **and** this protocol yields **two** local commits unless the tree was clean before the bat — prefer **one** push commit when running **`code.9.Push`**.

5. **Push:** From repo root on **Windows**, run:

   ```bat
   scripts\deploy\2_push_github.bat
   ```

   The script prompts **`Y`** to confirm (shows subject line 1). To skip the prompt (e.g. automation only when the user **explicitly** invoked this protocol), run:

   ```bat
   scripts\deploy\2_push_github.bat --called
   ```

   **`--called`** still commits and pushes; it only skips the interactive **`Y/N`** prompt.

6. **Non-Windows:** Equivalent:

   ```bash
   git add .
   git commit -F scripts/deploy/commit_message.txt
   git push origin main
   ```

   Respect the same **`commit_message.txt`** rules as **`2_push_github.bat`**.

---

## Exit criteria

- **`review.0.Bump` Part 4A** satisfied (or consciously waived items documented for the user).
- **`commit_message.txt`** valid for the bat (**[`review.0.Bump` Part 5](review.0.Bump.md)**).
- **`git push origin main`** succeeded **or** user aborted at confirmation — never force-push.

---

## Relationship to other protocols

| Protocol | Role vs this one |
|---|---|
| **`review.0.Bump.md`** | Defines checklist, semver matrix, **`CHANGELOG`**, **`commit_message.txt`** shape — **this protocol executes it then pushes** |
| **`session.9.Close.md`** | Session **`Result`**, broader docs/version gates, optional push — use when closing a **named session**, not only a bump slice |
| **`2_push_github.bat`** | Implements **`git add`**, **`git commit -F`**, **`git push`**; resets **`commit_message.txt`** to **`---`** on success |

---

## Next protocols

After push: replace **`scripts/deploy/commit_message.txt`** entirely before the next push (**[`review.0.Bump` Part 5](review.0.Bump.md)**). Next session start: **`code.0.Startup.md`**.
