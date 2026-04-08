<!-- Last updated: 2026-04-08T21:00:00-05:00 -->
# Protocol: Session Startup

How to begin a new AI session on this project.

---

## Audience: coding agent vs consultant

**Modular `.ai/` (default for coding agents)** — **`.ai/initiatives/`**, **`.ai/extended/<domain>.md`**, and deep initiative files exist so an agent can load **only what the task needs**. That keeps sessions focused and avoids burning context on domains that are not in scope.

**Single-file consultant handoff** — **`.ai/consultant_context.md`** is a **single, information-dense** document for **external advisors** (and for sessions whose goal is to **review or edit** that handoff). It is meant to be **all-encompassing** for its topic: business context, architecture, APIs, phases, gotchas, and open questions in one place. It does **not** replace initiatives or extended docs for implementers; it **consolidates** what a consultant must see without chasing multiple trees.

- **Coding / implementation sessions:** follow the steps below (read `context.md`, initiatives as needed, **extended only on demand**). Do **not** assume you must read `consultant_context.md` unless the user is steering toward consultant prep or B-Stock advisory context.
- **Consultant-facing or “explain the whole initiative” sessions:** read **`.ai/consultant_context.md`** in full (and still use `context.md` + `_index.md` if the task spans multiple initiatives).

---

## Steps

1. **Read the primary context file.**
   - Read `.ai/context.md` in full. This gives you the project summary, file map, current state, guidelines, and doc maintenance rules.

2. **Check the current version.**
   - Read repo root `.version` (single line, e.g. `v2.1.0`).

3. **Scan recent changes.**
   - Read the top of repo root `CHANGELOG.md` (latest 1–2 sections, including `[Unreleased]` if present).

4. **Check initiatives.**
   - Read **`.ai/initiatives/_index.md`** for **active**, **on hold**, and **backlog** initiatives, and **`.ai/initiatives/_archived/ARCHIVE.md`** for archived work. **Lifecycle how-tos** (`activate_initiative`, `move_initiative_to_*`): **`.ai/initiatives/_archived/_protocols/README.md`**. Priorities also live in `CHANGELOG.md` (`[Unreleased]`) and the user’s message.
   - **Alignment:** Substantial or multi-session work should map to a **named initiative** (file + row in `_index.md`). **Repo version bumps** (major / minor / patch) relate to **what shipped** and should stay traceable to initiatives and user-visible/API semver — see `.ai/protocols/review_bump.md` Part C. If it is unclear **which initiative** the session continues or which one a release would fulfill, **ask the user** to name it or to **create** a new initiative (add `.md` + row in `_index.md`) before treating scope as settled.

5. **Load extended context only when needed.**
   - Open `.ai/extended/<domain>.md` for the area you are working on (e.g. `backend.md`, `frontend.md`, `inventory-pipeline.md`). Do **not** read all extended files at session start. (Consultants needing a **single full picture** for the buying initiative should use **`.ai/consultant_context.md`** instead of reading every extended file — see **Audience** above.)

6. **Check for open terminals or running processes.**
   - List the terminals folder to see if Django or Vite are already running.

7. **Ask the user what they need.**
   - Do not assume the task. Wait for instructions.

---

## What NOT to do at startup

- Do NOT read every file in `.ai/extended/` at session start — load domain files on demand (step 5). Do **not** treat **all** initiatives as required reading unless the task is cross-cutting or consultant-style (then prefer **`consultant_context.md`** where it applies).
- Do NOT run migrations, seeds, or builds unless asked.
- Do NOT commit, push, or deploy anything.
- Do NOT create or modify documentation unless asked.
- Do NOT assume **which initiative** is in scope when the user’s message and `_index.md` leave it ambiguous — ask, or confirm a new initiative should be added.
- Do **not** move or archive initiative files under `.ai/initiatives/` unless the **user explicitly** says to (or confirms when asked).

---

## Next protocol

For context refresh, version bump, pre-commit, and handoff: `.ai/protocols/review_bump.md`.
