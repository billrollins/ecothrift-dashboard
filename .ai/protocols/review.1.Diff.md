<!-- Last updated: 2026-05-06 (initial — local ↔ GitHub/Heroku diff summary + reference artifact) -->
# Protocol: Diff summary (local ↔ remotes)

**Scope:** Produce a **structured diff summary** comparing the **current local branch** (default `main`) to **`origin/main`** (GitHub) and **`heroku/main`** (or the Heroku ref you deploy from). **Persist** the full write-up under **`.ai/reference/diffs/`** and give the user a **short tally in chat**.

**Not this protocol:** line-by-line code review → do that in the PR or editor. **No** `git push`, **no** deploy, **no** Heroku CLI release changes.

---

## When to use

- Before push/deploy: confirm what would change vs GitHub vs production Git remote.
- After an amend/rebase: see whether history diverged while the **tree** matches.
- When **`git status`** shows **ahead/behind** and you want counts, not a full patch.

---

## Part 1 — Preconditions

1. Repo root is the working directory.
2. Remotes exist (this project expects at least **`origin`** and **`heroku`**). If you compare only GitHub, skip Heroku sections.
3. **Fetch** so summaries reflect the server:

**PowerShell (Windows):**

```powershell
git fetch origin
git fetch heroku
```

Adjust remote names if yours differ.

---

## Part 2 — Choose the refs

| Role | Default ref | Override |
|------|-------------|----------|
| Local tip | `HEAD` | Another commit: `git rev-parse <branch>` |
| GitHub | `origin/main` | e.g. `origin/master` |
| Heroku app Git | `heroku/main` | **`heroku/master`** if that is what the app tracks — run `git branch -r` after fetch |

Document the exact pair in the saved report (Part 5).

---

## Part 3 — Commit graph (ahead / behind / diverged)

For each remote tip **`R`** vs local **`HEAD`**:

```powershell
git rev-parse HEAD
git rev-parse origin/main
git rev-parse heroku/main
```

**Symmetric counts** (left = commits on `R` not reachable from `HEAD`; right = commits on `HEAD` not reachable from `R`):

```powershell
git rev-list --left-right --count origin/main...HEAD
git rev-list --left-right --count heroku/main...HEAD
```

Output is two integers: **`behind<TAB>ahead`** for the `A...B` ordering (here **`remote...HEAD`**): first number = **commits you are behind** the remote, second = **commits you are ahead**.

If **behind > 0** and **ahead > 0**, history **diverged** (still check whether the **tree** matches — Part 4).

Optional one-liner log for diverged tips:

```powershell
git log --oneline --left-right HEAD...origin/main
```

---

## Part 4 — File-level stats (added / removed / modified / renamed)

Compare **committed** local tip to each remote tip (works with a **clean** working tree; if dirty, note it and optionally run the same against **`git stash`** or include **working tree** via `git diff R`).

**Name/status list** (source of truth for counts):

```powershell
git diff --name-status origin/main HEAD
git diff --name-status heroku/main HEAD
```

**Tally rules:**

- **`A`** → **added** (count).
- **`D`** → **removed** (deleted) (count).
- **`M`** → **modified** (count).
- **`R`** → treat as **renamed** (count separately; optional line in report).
- **Files that differ** = number of lines in the name-status output (non-empty).

**Aggregate insert/delete lines** (optional):

```powershell
git diff --shortstat origin/main HEAD
git diff --shortstat heroku/main HEAD
```

If **`git diff --name-status R HEAD`** is empty, **no files differ** at the tree level even if commits differ (amend / duplicate commit).

---

## Part 5 — Version readout (optional but recommended)

**Local** (working tree):

```powershell
Get-Content .version
```

**At remote tips** (no checkout):

```powershell
git show origin/main:.version
git show heroku/main:.version
```

If a ref lacks `.version`, record *`(missing at ref)`*.

---

## Part 6 — Persist the report

**Directory:** `.ai/reference/diffs/`  
Create it on first write if it does not exist.

**Filename (cross-platform):**  
`YYYYMMDD-HHmmss.diff.md`  
Example: `20260506-143522.diff.md`

**Do not** use **`:`** in the time portion — **not allowed** in Windows file paths. (If you prefer date-only collisions risk: append `-diff` or a short slug.)

**Report body — use this structure:**

```markdown
# Diff summary — YYYY-MM-DD HH:MM (local timezone)

## Metadata
- **Repo:** …
- **Local branch:** … @ `HASH`
- **Compared to:** `origin/main` @ `HASH`; `heroku/main` @ `HASH`
- **Working tree:** clean | dirty (brief note)

## Versions (.version)
| Ref | Value |
|-----|-------|
| working tree | vX.Y.Z |
| origin/main | … |
| heroku/main | … |

## origin/main vs HEAD
- **Behind / ahead:** … / … (`git rev-list --left-right --count origin/main...HEAD`)
- **Diverged:** yes/no
- **Files differ:** N total (A added, D removed, M modified[, R renamed])
- **`git diff --shortstat`:** … (paste or “none”)

### name-status
```
(paste git diff --name-status origin/main HEAD)
```

## heroku/main vs HEAD
(same subsections)

## Notes
- …
```

---

## Part 7 — Chat summary (required shape)

Reply with a **compact tally**, for example:

> **Local ↔ GitHub (`origin/main`):** N files differ (A added, D removed, M modified); **commits:** B behind / A ahead ***(diverged: yes/no)***; **`.version`:** local **vX.Y.Z** vs remote **vX.Y.Z** (or *missing*).
>
> **Local ↔ Heroku (`heroku/main`):** …

If **N = 0** but **behind/ahead ≠ 0**, say explicitly: *same tree, different commits*.

---

## Relationship to other protocols

| Protocol | When |
|----------|------|
| **`review.1.Diff.md`** (this) | Summarize local vs **`origin` / `heroku`**; save under **`.ai/reference/diffs/`** |
| **`code.9.Push.md`** | After bump/review, push to GitHub |
| **`review.9.Deep.md`** | Full audit + reports under **`.ai/reference/deep_dive/latest/`** |

---

## Gotchas

- **`heroku/main`** vs **`heroku/master`**: always **`git fetch heroku`** and **`git branch -r`** — apps differ.
- **Dirty working tree:** file counts from `R...HEAD` do **not** include unstaged edits; say so or add `git status -sb` to the report.
- **Large diffs:** the saved file holds **stats and name-status**, not the full patch (keep artifacts small).
- **B-Stock API:** this protocol does **not** hit B-Stock; only local `git` commands.
