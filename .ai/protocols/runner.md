<!-- Last updated: 2026-09-23 (what to run: file alone = all queued) -->
# Protocol: Runner

**What to run depends on what the user gave you:**

| The user gave you | Do |
|---|---|
| **Only this file** (pasted, `@`-mentioned, or its path) | **Every** `queued` task in [`.ai/comm/runner/queue.md`](../comm/runner/queue.md), oldest first. Then **STOP**. |
| **One task file** (`tasks/R-NNN-*.md`) | Only that task. |
| **Task IDs** ("run R-002 and R-003") | Only those. |

Several runners can work at once. Before you start a task, re-read its row in `queue.md`; if it is already `running`, skip it.

The coder writes code. The runner does everything else that takes time: tests, recon, and small chores. The runner does not write product code, and does not debug.

---

## The folder: `.ai/comm/runner/` (main tree `C:\Coding\ecothrift-dashboard`)

| File | Who writes it | What it holds |
|---|---|---|
| `queue.md` | The coder adds rows. The runner changes only the Status cell. | One row per task: ID, type, status, title, links. |
| `tasks/R-NNN-slug.md` | The coder | What to do, and exactly what to hand back. |
| `results/R-NNN-slug.md` | The runner | The answer, in the shape the task asks for. |
| `baseline.md` | The runner appends. The coder prunes. | Test failures known to exist on `main`. |
| `workspace/runner/R-NNN/` (gitignored) | The runner | Logs, CSVs, scratch scripts. |
| `archive/tasks/`, `archive/results/`, `archive/index.md` | The coder | Finished tasks, moved out of the queue. Runners ignore `archive/`. |

**Status words:** `queued` → `running` → `done`, `partial` or `blocked`. `superseded` means skip the task.

---

## Rules for every task

0. **Show progress as you go.**
   - When you start a task, create its result file right away with a header:
     ```markdown
     # R-NNN · <title>
     - **Runner:** <your name or model> · **Started:** <local time> · **Status:** running
     ```
   - Write each answer into the file as soon as you have it (for tests, each command's totals), so the coder can use part of it while you work.
   - At the end, change **Status** in the file to `done`, `partial` or `blocked`, and add **Finished:** <time>.
   - **Then archive it. Never delete.** Move the task file to `archive/tasks/` and the result to `archive/results/`. Remove its row from `queue.md`. Add one line to `archive/index.md` with the ID, type, title, outcome (for tests: GREEN, RED or BLOCKED and NEW counts), and **Merged into** left as `pending`.
1. **No product code.** Do not edit app code, tests, migrations, settings, `.env`, or docs outside `.ai/comm/runner/`. If a task seems to need a code change, write it down in the result and stop that part.
2. **No git writes.** Do not commit, push, merge, stash, reset or clean. Read-only git (`log`, `show`, `diff`, `grep`, `blame`) is fine. The only exceptions are the test-worktree commands in **Test tasks**.
3. **The dev database is read-only.** Reading through `manage.py shell` (`filter`, `values`, `aggregate`, `count`) is fine. Never call `save`, `create`, `update`, `delete`, `bulk_*`, `migrate`, `flush` or `loaddata`, or any management command, unless the task names it.
4. **No outside calls** (B-Stock, Google, AI providers, email, Heroku) unless the task says so explicitly. Never use the stored B-Stock login.
5. **No secrets in results.** Leave out tokens, API keys, passwords and customer names, emails or phones. Counts and IDs are fine.
6. **Stay in scope and in time.** Answer exactly what the task asks. If a task gives a time box, stop at it and mark the result `partial`.
7. **Blocked:** when something stops you, write what you tried and the last 20 lines of the error, mark the task `blocked`, and move on to the next one.

When no `queued` tasks remain, tell the user one line per task, like `R-004 recon done: results/R-004-sales-data.md`. Then **STOP**.

---

## Recon tasks (`type: recon`)

Read code, docs and the dev database to answer the task's questions with facts.

- **Cite code** as `path:line`.
- **Show numbers** as small tables. For the query behind a number, put a one-line description, or the ORM code when it isn't obvious.
- **Mark what you could not confirm** as `UNKNOWN`, with what you checked.
- **Keep opinions out** unless the task asks for them. When the task has an "Observations" section, keep yours short there.
- **Scratch scripts** go in `workspace/runner/R-NNN/`. Run them with `C:\Coding\ecothrift-dashboard\venv\Scripts\python.exe manage.py shell -c "exec(open(r'<path>').read())"` from the main tree.

## Chore tasks (`type: chore`)

Do the numbered steps exactly as written, then report what each step printed. Do only those steps. If a step's output looks different from what the task expects, stop and report it.

## Test tasks (`type: test`)

The coder freezes the code as a snapshot ref. You run it in a separate worktree, so the coder's edits never touch your run.

### One-time setup

Skip this if `C:\Coding\ecothrift-test` exists.

```bash
cd /c/Coding/ecothrift-dashboard
git worktree add --detach /c/Coding/ecothrift-test HEAD
cp .env /c/Coding/ecothrift-test/.env
```

```powershell
New-Item -ItemType Junction -Path C:\Coding\ecothrift-test\frontend\node_modules -Target C:\Coding\ecothrift-dashboard\frontend\node_modules
```

### Each test task

1. Check out the snapshot and set up the log folder:

   ```bash
   cd /c/Coding/ecothrift-test
   git checkout --detach --force <Snapshot ref>
   git rev-parse --short HEAD
   PY=/c/Coding/ecothrift-dashboard/venv/Scripts/python.exe
   LOG=/c/Coding/ecothrift-dashboard/workspace/runner/<ID>
   mkdir -p "$LOG"
   ```

   If the task says `Deps: npm`, replace the junction first (`cmd //c rmdir frontend\\node_modules`), then run `npm ci` in `frontend`.
2. Run each numbered command in the task, with a log file per step:

   | Command | Run | Failure key |
   |---|---|---|
   | `py: <targets>` | `"$PY" -m pytest <targets> -q -rfE -p no:warnings -p no:cacheprovider --create-db > "$LOG/<n>-py.log" 2>&1` | Node id from each `FAILED` / `ERROR` line |
   | `vitest` or `vitest: <files>` | In `frontend`: `npx vitest run <files> > "$LOG/<n>-vitest.log" 2>&1` | The text after `FAIL ` |
   | `tsc` | In `frontend`: `npx tsc --noEmit -p tsconfig.json > "$LOG/<n>-tsc.log" 2>&1` | `file: TSnnnn message`, without line:col |
   | `migrations-check` | `"$PY" manage.py makemigrations --check --dry-run > "$LOG/<n>-migrations.log" 2>&1` | Each operation line under `Migrations for '<app>':` |

   Long runs go in the background. Never cut one short.
3. Classify each failure key:
   - **KNOWN:** it's in `baseline.md`.
   - Otherwise, re-run just those keys at the task's **Compare-to** ref:
     - `git checkout --detach --force <ref>`.
     - Use pytest node ids, or the unique files when there are more than 150 ids.
     - Re-run the whole of tsc and migrations-check.
   - **PRE-EXISTING:** it fails there too. Append it to `baseline.md` with `(confirmed R-NNN @ sha)`.
   - **NEW:** it passes there. That's a regression, and you report it.
   - **NOW PASSING:** it's in the baseline but passed this time. List it, but don't prune it.
4. Retry only these, once each:
   - a `pg_trgm` / Application Control DLL block: run the same command again;
   - `database "test_…" is being accessed by other users`: wait 60 s, then run again.

   Anything else that stops a command is **BLOCKED**.
5. The result's status is **GREEN** (no NEW failures), **RED** (any NEW) or **BLOCKED**. Include:
   - a table of each command with totals, NEW, known and now-passing counts;
   - the NEW failures, each with its node id and one error line, copied not paraphrased, and the log name;
   - what you added to the baseline;
   - what's now passing.

---

## Coder side (for the coder, not the runner)

- **Queue a task:**
  1. Write `tasks/R-NNN-slug.md`: type, why, exact questions or steps, and the result shape. Start it with this header, so the user can drop just that file into chat:
     ```markdown
     > **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.
     ```
  2. Add a `queued` row to `queue.md`.
  3. For a test task, snapshot the tree first (no commit):
     ```bash
     git add -A -- . ':!.claude'
     SHA=$(git stash create "R-NNN"); SHA=${SHA:-$(git rev-parse HEAD)}
     git update-ref refs/runner/R-NNN "$SHA"
     ```
  4. Tell the user one line: **"Runner tasks queued: R-NNN (type) ... Run `.ai/protocols/runner.md`."**
  5. Keep coding. Assume tests are green.
- **Size:** keep each task small enough for a cheaper model: one topic, concrete questions, and a clear finish line.
- **Check `results/`:**
  - before relying on an answer;
  - before a commit or ship.
- **RED:** fixing the NEW failures is the next job. Debugging is the coder's job.
- **Superseded:** when a newer test snapshot covers a queued test, mark the older one `superseded`.
- **After a runner archives a task:** read the result in `archive/results/`, merge the findings into their home (the data-quality register, an initiative, or code fixes), then replace `pending` in `archive/index.md` with where it went.
- **Leftovers:** whenever you queue new tasks, archive anything a runner left behind:
  - move every `done`, `partial`, `blocked` (dealt with) or `superseded` task and its result to `archive/tasks/` and `archive/results/`;
  - delete their rows from `queue.md`;
  - add one line each to `archive/index.md` (ID, title, outcome).
  - Merge recon findings into their home (for example the data-quality register) before archiving.
- **Baseline:** prune keys that pass again.
- **Never** run test suites yourself.
