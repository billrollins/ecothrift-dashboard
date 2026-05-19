<!-- Last updated: 2026-05-18 (consultant_context removed; version/changelog at repo root only) -->
# Protocol: Session Startup

How to begin a new AI session on this project. See also [`.ai/README.md`](../README.md).

---

## Steps

1. **Read the primary context file.**
   - Read `.ai/context.md` in full. This gives you the project summary, file map, current state, guidelines, and doc maintenance rules.

1b. **Active effort handoff (optional).**
   - If the user is continuing a **named effort** with a handoff file, read **`efforts/<effort-slug>/CONTEXT.md`** after step 1. Example: **`efforts/buying-auctions-list-ux/CONTEXT.md`** — Buying auctions list / Inventory Need UI (routes, components, layout gotchas). See **`efforts/README.md`** for the index. Skip this when the task is unrelated.

2. **Check the current version.**
   - Read repo root `.version` (single line, e.g. `v2.1.0`).

3. **Scan recent changes.**
   - Read the top of repo root `CHANGELOG.md` (latest 1–2 sections, including `[Unreleased]` if present).

4. **Check initiatives.**
   - Read **`.ai/initiatives/_index.md`** for **active**, **on hold**, and **backlog** initiatives, and **`.ai/initiatives/_archived/ARCHIVE.md`** for archived work. **Lifecycle how-tos** (`activate_initiative`, `move_initiative_to_*`): **`.ai/initiatives/_archived/_protocols/README.md`**. Priorities also live in `CHANGELOG.md` (`[Unreleased]`) and the user’s message.
   - **Alignment:** Substantial or multi-session work should map to a **named initiative** (file + row in `_index.md`). **Repo version bumps** (major / minor / patch) relate to **what shipped** and should stay traceable to initiatives and user-visible/API semver — see `.ai/protocols/session.9.Close.md` Part 2 (version bump gate). If it is unclear **which initiative** the session continues or which one a release would fulfill, **ask the user** to name it or to **create** a new initiative (add `.md` + row in `_index.md`) before treating scope as settled.

5. **Load extended context only when needed.**
   - The **Extended docs TOC** in **`.ai/context.md`** lists every file in `.ai/extended/` with a one-line description. Use it to pick the right file for your domain. Do **not** read all extended files at session start.

6. **Check for open terminals or running processes.**
   - List the terminals folder to see if Django or Vite are already running.

7. **Ask the user what they need.**
   - Do not assume the task. Wait for instructions.

8. **Frame the session (questions), then open or create a session entry** in the relevant initiative file.

   **Framing — ask or confirm with the user** unless the message already answers these clearly:

   1. **Success:** What would make this session a win? (one sentence — becomes **Finish line**.)
   2. **Intent:** What are you hoping to achieve **today** vs later? (sharpens **Goal** / **Scope**.)
   3. **Time:** Rough budget? (e.g. 1–2h, half day — becomes **`est Xh`** and start timestamp.)
   4. **Owner:** Which **initiative** owns this? (If non-trivial and none named, stop — see step 4.)
   5. **Out of scope:** Anything explicitly **not** in this session? (optional line under **Scope**.)
   6. **Ship:** Accumulate toward a later commit, or aim to **`session_close`** today? (Sets expectations only.)

   **Then write** the session block:

   - If the user’s task maps to an **active initiative**, open that **`.ai/initiatives/<name>.md`** and add a new **`### Session N`** block under **`## Sessions`** using the standard format (goal, finish line, scope, estimated time, start timestamp). **Session ID:** `N` is **sequential per initiative** — count **all** session rows (collapsed one-liners **and** `### Session` headers) in `## Sessions` and add **1** for the next id. If there is no `## Sessions` section yet, create it and start at **Session 1**.
   - If **no initiative** applies and the work is **trivial** (one-line fix, obvious hotfix), you may record intent only in **`CHANGELOG.md` `[Unreleased]`** — no initiative file.
   - If the work is **non-trivial** but has **no initiative**, **stop** and ask the user to name one or create it (add `.md` + row in `_index.md`) before writing code.
   - The session goal is **written to disk**, not only discussed in chat.

9. **During the session,** run **`.ai/protocols/session.1.Checkpoint.md`** on a steady cadence (roughly every 1–2 hours or after each mergeable chunk) to append **Session updates**, keep **`CHANGELOG` `[Unreleased]`** honest, and touch **extended** docs when behavior changes. **End** the session with **`session.9.Close.md`** (not repeated checkpoints).

---

## What NOT to do at startup

- Do NOT read every file in `.ai/extended/` at session start — load domain files on demand (step 5). Read only the **active initiative** files relevant to the task.
- Do NOT run migrations, seeds, or builds unless asked.
- Do NOT commit, push, or deploy anything.
- Do NOT create or modify documentation unless asked (exceptions: **step 8** session entry when mapping to an initiative; **`session.1.Checkpoint.md`** / **`session.9.Close.md`** when the user or protocol calls for those passes).
- Do NOT assume **which initiative** is in scope when the user’s message and `_index.md` leave it ambiguous — ask, or confirm a new initiative should be added.
- Do **not** move or archive initiative files under `.ai/initiatives/` unless the **user explicitly** says to (or confirms when asked).

---

## Relationship to other protocols

| Protocol | When | Purpose |
|----------|------|---------|
| **`code.0.Startup.md`** (this) | Session start | Load context; **frame session**; **create session entry** |
| `session.0.Create.md` | Reserved | Placeholder; session-block-only protocol TBD (today: step 8 in this file). |
| **`session.1.Checkpoint.md`** | **Several times** per session | Session updates + **`[Unreleased]`** + light docs |
| `code.1.Bearing.md` | Mid-session when stuck / drifting | Compare progress to written session goal |
| `review.0.Bump.md` | Isolated docs audit + semver + `CHANGELOG` | Checklist + bump matrix; optional **`commit_message.txt`** + **`2_push_github.bat`** (Part 5); local Part 4B short commit; **no** `git push` by itself |
| **`review.1.Diff.md`** | Local vs GitHub / Heroku | Fetch remotes; ahead/behind + file tallies; save **`.ai/reference/diffs/YYYYMMDD-HHmmss.diff.md`**; short summary in chat |
| **`code.9.Push.md`** | Bump checklist + GitHub push | Wraps **`review.0.Bump`** + **`2_push_github.bat`** with **full** **`commit_message.txt`** — skip redundant Part 4B |
| `review.9.Deep.md` | Full repo/context audit | Generates human-readable reports + plan under `.ai/reference/deep_dive/latest/`; does not execute changes by default |
| `session.9.Close.md` | **End** of session / before commit | Record **`Result`**, docs, version bump, commit message |
| **`sql.0.UpdateSchema.md`** | **On demand** — migrations / SQL reporting prep | Read **`extended/sql/README.md`** + **`cli.md`** → run **`schema_columns_ecothrift.sql`** → **`.ai/extended/sql/schema.csv`** |
| [`extended/consultant_handoff.md`](../extended/consultant_handoff.md) | Mid-session or rotation | Spot-check docs + **flat** copy to **`workspace/to_consultant/files-update/`** |

---

## Next protocols

During work: **`.ai/protocols/session.1.Checkpoint.md`**. When stuck: **`code.1.Bearing.md`**. Docs audit + bump slice only: **`review.0.Bump.md`**. Diff summary local ↔ **`origin` / `heroku`**: **`review.1.Diff.md`**. Bump then **`git push origin main`** with **`commit_message.txt`**: **`code.9.Push.md`**. Full context refresh / report set: **`review.9.Deep.md`**. Refresh **`schema.csv`**: **`.ai/protocols/sql.0.UpdateSchema.md`**. When finishing: **`session.9.Close.md`**. Consultant handoff: **[`extended/consultant_handoff.md`](../extended/consultant_handoff.md)**.
