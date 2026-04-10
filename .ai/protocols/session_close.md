<!-- Last updated: 2026-04-10T19:00:00-05:00 -->
# Protocol: Session close (docs, version, commit)

Run when you are ready to **finish a work session** and optionally **commit / release**. This replaces the old **`review_bump.md`** monolith: it is **one protocol** with three parts — record the session, update docs (scoped), stage the commit.

**Not a substitute for:** ongoing pulses during work — use **`session_checkpoint.md`** to keep session updates and **`[Unreleased]`** current. Use **`get_bearing.md`** if you are **lost** or need a compass vs the written goal.

---

## When to run

- Before committing (when the user asks to commit or you are handing off with a clean tree).
- Before a release / version bump.
- After a multi-session stretch of work before push (append to `commit_message.txt` each time you close a session).

---

## Part 1 — Record session result

1. Open the **active initiative** file (from `.ai/initiatives/_index.md`) and the **active session** entry (the latest `### Session N` under `## Sessions` without a completed `#### Result`, unless you are continuing a listed “still open” session).
2. Add a **timestamped line** under `#### Session updates` summarizing what happened (files changed, decisions, blockers).
3. Set **`#### Result`** to one of:
   - `committed as vX.Y.Z at <short-hash>` (after version bump)
   - `committed (no version bump) at <short-hash>`
   - `still open` (work continues next session — add note in Session updates)
   - `abandoned — <reason>`
4. If this session **completed a phase**: check the **Acceptance** box for that phase in the initiative file; update **`.ai/initiatives/_index.md`** row (Phase + one-sentence Notes) if phase status changed.
5. If a phase **acceptance box was checked** or **initiative status** (Active / On hold / etc.) changed: update **`.ai/consultant_context.md`** per Part 2 (bright-line trigger).

**Archiving:** Do **not** move an initiative to `_archived/` unless the **user explicitly** approves. Initiative lifecycle steps live under [`.ai/initiatives/_archived/_protocols/README.md`](../initiatives/_archived/_protocols/README.md).

---

## Part 2 — Update docs (only what this session touched)

**Scope rule:** Update a file only if this session **changed** the underlying reality or **checked** a phase acceptance / initiative status.

| Artifact | When to update |
|----------|----------------|
| **`.ai/context.md`** | Known Issue resolved, new capability in the pointer list, **Not Yet Implemented** item shipped, or **Working** section needs a new pointer line. Do **not** rewrite the whole Working section every session. |
| **`.ai/extended/<domain>.md`** | You changed models, routes, URLs, auth, or domain behavior in that area. Bump the file’s `<!-- Last updated -->` timestamp. If you **added, renamed, or removed** an extended file, update the **Extended docs TOC** in both **context.md** and **consultant_context.md**. |
| **`.ai/initiatives/_index.md`** | Initiative phase or one-sentence Notes changed. |
| **`.ai/consultant_context.md`** | **Required** when a **phase acceptance box is checked** or **initiative status** changes. Optional for small fixes otherwise. |
| **Root `CHANGELOG.md`** | Add **`[Unreleased]`** bullets for user-visible or API-relevant work. **Style:** 1–2 sentences per bullet; cite initiative filename; avoid implementation-detail paragraphs. |
| **Root `README.md`** | Quick Start / AI steering subsection only if onboarding or protocol paths changed. |

**Version bump (gate)** — only when the user **asks for a release** or the change **clearly** warrants semver (user-visible/API).

1. **Initiative clarity:** You must name **which initiative(s)** the release fulfills, or state **outside initiatives** (e.g. hotfix). If unclear, stop and ask the user. (Same idea as the old Part C gate.)
2. Bump **`.version`** (line 1: `vMAJOR.MINOR.PATCH`).
3. Bump root **`package.json`** `"version"` to the same numeric **semver** (no `v`).
4. Add a **new section** to **`CHANGELOG.md`**; move items from **`[Unreleased]`** as needed.

---

## Part 3 — Commit message and pre-commit

### `scripts/deploy/commit_message.txt`

**Between commits:** treat the file as **append-only** (multiple sessions may land before one push).

- **Line 1** is always the **conventional commit subject** (`feat:`, `fix:`, `docs:`, `chore:`, …). Set it on the **first** session after a reset to `---`. **Update** line 1 if the overall scope of the pending commit changes.
- **Lines 2+** accumulate **session summaries** — each `session_close` appends a short block (session id, initiative, what changed, pointers to `CHANGELOG` / initiative).
- **Do not** put `---` on line 1 when you intend to commit or push. After a successful push, deploy scripts may reset the file to `---` — that starts the next window.

### Pre-commit checks

- `cd frontend && npx tsc --noEmit`
- Python: `python -c "import compileall; compileall.compile_dir('apps', quiet=1)"` for touched apps (adjust path if only one app changed)
- No secrets in diff (`.env`, keys, tokens)
- `git diff` / `git diff --cached` review
- **Commit only when the user explicitly asks.**

### Push (when user asks)

- `git push origin main` — remote `origin`, branch `main`. Never force-push; never `--no-verify`; do not amend pushed commits.

---

## Conventional commit format (line 1)

```
<type>: <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`.

---

## Relationship to other protocols

| Protocol | When | Purpose |
|----------|------|---------|
| `startup.md` | Session start | Load context; **frame session**; **create session entry** |
| `session_checkpoint.md` | Several times per session | Session updates + **`[Unreleased]`** + light docs |
| `get_bearing.md` | Mid-session when stuck | Compare progress to **written** session goal |
| **`session_close.md`** (this) | **End** of session / before commit | **`Result`**, scoped docs, version bump, commit message |
| `collect_for_consultant.md` | After build phase / handoff | Spot-check + copy files for consultant |

---

## Next session

Follow **`.ai/protocols/startup.md`**.
