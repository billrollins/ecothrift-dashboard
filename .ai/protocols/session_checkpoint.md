<!-- Last updated: 2026-04-16T18:15:00-05:00 -->
# Protocol: Session checkpoint (pulse during work)

Run **several times per session** (for example every **1–2 hours**, after a mergeable chunk of work, or when the user says **“checkpoint”**). This keeps **session updates**, **`CHANGELOG` `[Unreleased]`**, and **light doc sync** current **while** you work.

**This is not `session_close.md`.** Checkpoints **do not** finalize **`#### Result`**, **do not** run the full pre-commit checklist, and **do not** bump **`.version`** / add a **dated `CHANGELOG` section** unless the user **explicitly** asks for a release mid-session (rare). **Versioned releases** stay with **`session_close.md`**.

### Changelog and `.version` — checkpoint vs session close

| Artifact | **Checkpoint** (this protocol) | **`session_close.md`** |
|----------|----------------------------------|-------------------------|
| **`CHANGELOG.md`** | Add or tighten bullets under **`## [Unreleased]`** for anything user-visible or API-relevant from this pulse. | Add a **new dated version section**; **move** (or copy) the right bullets from **`[Unreleased]`** into it; keep **`[Unreleased]`** honest for what is not yet released. |
| **`.version`** | **Do not** bump. | Bump **`vMAJOR.MINOR.PATCH`** when shipping (see **`session_close.md`** Part 2 version gate). |
| **`package.json`** `"version"` | **Do not** bump. | Bump to match **`.version`** (numeric semver, no `v`). |

**Rule of thumb:** Every shipping session should end with **`session_close.md`** so **semver** and the **dated `CHANGELOG` section** stay in sync with **`[Unreleased]`** work. Checkpoints **feed** that close: if **`[Unreleased]`** is empty or stale at close, the version bump has nothing to document — avoid that by updating **`[Unreleased]`** at each checkpoint.

**This is not `get_bearing.md`.** Checkpoints are **forward motion** (what changed, what to log). **Bearing** is **orientation** when stuck, drifting, or before a big decision — see **`.ai/protocols/get_bearing.md`**.

---

## When to run

- After a **coherent slice** of work (feature slice, bugfix, doc pass) before starting the next slice.
- On a **timer** — roughly **every 1–2 hours** of focused implementation.
- When the user asks for a **pulse**, **sync**, or **checkpoint**.
- Before **context-switching** to another task or initiative (log where you left off).

**Cadence:** Expect on the order of **~5 checkpoints per long session** — adjust to how much shipped between pulses.

---

## Time budget

**About 5–10 minutes.** If it grows into a full doc audit or release prep, you are doing **`session_close.md`** instead.

---

## Steps

### 1. Session updates (initiative file)

1. Open the **active initiative** and the **active session** (`### Session N` with open work — **`#### Result`** not completed, or marked **`still open`**).
2. Append **one timestamped line** under **`#### Session updates`**, for example:  
   `2026-04-10T14:20:00-05:00 Checkpoint — <what landed: files, behavior, decisions>.`
3. If the **real work** no longer matches **Goal / Finish line / Scope**, either **edit the session block** (explicit decision) or add an update line noting the **revised** aim — do not let the written session go stale.

### 2. Changelog (`[Unreleased]` at checkpoint; dated section at close)

1. Re-read **`git diff`** / **`git status`** for this pulse.
2. For **user-visible** or **API-relevant** changes, add or tighten **bullets under `## [Unreleased]`** in root **`CHANGELOG.md`** — same style as **`session_close.md`** Part 2 (short bullets, initiative link where applicable). Steering-only doc edits may use a **Documentation / steering** subheading under **`[Unreleased]`** when useful.
3. **Do not** add a **new dated version section**, bump **`.version`**, or bump **`package.json`** here unless the user **explicitly** asked to cut a release **now** (then treat the rest like **`session_close.md`** Part 2 version gate). Otherwise, the **version bump** and **new `CHANGELOG` dated section** happen only in **`session_close.md`** when the user finishes the session or asks to release.

### 3. Scoped docs (only what this pulse touched)

| Artifact | When to touch at checkpoint |
|----------|-----------------------------|
| **`.ai/extended/<domain>.md`** | Behavior or routes changed in this pulse — bump `<!-- Last updated -->` and minimal factual edits. |
| **`.ai/initiatives/_index.md`** | Phase or Notes **actually** changed this pulse (not “maybe later”). |
| **`.ai/context.md`** | Only if a **Working** pointer or **Not Yet Implemented** line is now wrong **because of this pulse**. |
| **`.ai/consultant_context.md`** | Optional mid-session; **required** when a phase ships or status flips — that is often **`session_close`**, not every checkpoint. |

### 4. Parking lot

If something belongs in **`session_close`** (full **`Result`**, **version bump**, **dated `CHANGELOG` section**, `commit_message.txt` lines 2+, tests), **note it in the session update line** so the end-of-session pass is faster.

---

## What NOT to do at a checkpoint

- Do **not** set **`#### Result`** to a final **`committed as …`** unless you are about to commit in the same breath (then use **`session_close.md`**).
- Do **not** replace **`get_bearing.md`** when you are **lost** — run **bearing** for git/diff truth and the bearing card.
- Do **not** run the full **`session_close`** pre-commit matrix unless the user asked to **close** the session.

---

## Relationship to other protocols

| Protocol | When | Purpose |
|----------|------|---------|
| **`startup.md`** | Session start | Context load; **session entry** + framing questions |
| **`session_checkpoint.md`** (this) | **Several times** per session | Session updates + **`[Unreleased]`** + light docs |
| **`get_bearing.md`** | Mid-session when **stuck** / drifting | Compass vs written goal; git truth; bearing card |
| **`review_bump.md`** | Isolated docs + semver + `CHANGELOG` | Full audit checklist; no **`Result`** / commit / push |
| **`session_close.md`** | **End** of session / before commit | **`Result`**, semver gate, full doc scope, `commit_message.txt`, pre-commit |
| [`extended/consultant_handoff.md`](../extended/consultant_handoff.md) | Consultant handoff | Spot-check + **flat** bundle under **`workspace/to_consultant/files-update/`** |

**Typical flow:** **`startup`** → (work) → **`checkpoint`** → (work) → **`checkpoint`** → … → **`get_bearing`** (if needed) → **`review_bump`** (optional, isolated audit) → **`session_close`** when done.

---

## Next

Continue work, or run **`.ai/protocols/get_bearing.md`** if direction is unclear, or **`.ai/protocols/session_close.md`** when finishing — that pass is where **`.version`**, **`package.json`**, and the **dated `CHANGELOG`** section are applied for a release.
