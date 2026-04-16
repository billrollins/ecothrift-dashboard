<!-- Last updated: 2026-04-16T22:45:00-05:00 (Part 5 — commit_message.txt + 2_push_github.bat) -->
# Protocol: Review & Bump (docs audit → `.version` → `CHANGELOG`)

**Scope:** Docs-audit + semver bump + `CHANGELOG` update. This is a **slice** of `session_close.md` — use when the user wants those without a full session close. **Optional:** align **`scripts/deploy/commit_message.txt`** with an upcoming push — see **Part 5** (works with **`scripts/deploy/2_push_github.bat`**).

**Not this protocol:**
- Session entry bookkeeping (`#### Result`, Session updates) → `session_checkpoint.md` / `session_close.md`.
- Full pre-commit matrix / explicit user “commit” request → `session_close.md` Part 3.
- Orientation when drifted → `get_bearing.md`.

---

## Part 1 — Review checklist (docs audit)

**Rule:** Touch a file only if the current session **changed the underlying reality** it documents, OR the file's facts have drifted from repo state. If nothing changed, skip — do not rewrite for style.

### 1A. Steering docs (always scan, touch if drift)

| File | Touch when | Minimum edit |
|---|---|---|
| `.ai/context.md` | Summary line version stale; Working pointer wrong; new Known Issue; Not Yet Implemented item shipped; Extended TOC file added/renamed/removed | `<!-- Last updated: ... -->` timestamp + the wrong line |
| `.ai/consultant_context.md` | Phase acceptance box checked; initiative status flipped; Extended TOC diverges from `context.md` | Timestamp + matching section |
| `.ai/initiatives/_index.md` | Active initiative Phase or Notes actually changed this session | Timestamp + the table row |
| `.ai/initiatives/<initiative>.md` | Session added an update / checked a phase acceptance | Under `## Sessions` only — do not edit older sessions |
| `README.md` (repo root) | Onboarding path or protocol path changed | Quick Start / AI steering subsection only |

### 1B. Extended docs (`.ai/extended/<domain>.md` — load on demand)

Touch the matching file(s) **iff** you changed that domain's models / routes / auth / URLs / behavior this session. Bump the per-file `<!-- Last updated -->`. If you **added, renamed, or removed** an extended file, update the Extended TOC in **both** `context.md` AND `consultant_context.md`.

| File | Domain trigger (touch only if this changed) |
|---|---|
| `.ai/extended/auth-and-roles.md` | JWT flow, roles, permissions, password flows |
| `.ai/extended/backend.md` | Django apps, models, serializers, API patterns, management commands |
| `.ai/extended/bstock.md` | B-Stock API surface, scraper behavior, SOCKS5 wiring |
| `.ai/extended/cash-management.md` | Drops, pickups, drawer reconciliation, safe |
| `.ai/extended/consignment.md` | Agreements, items, payouts, portal |
| `.ai/extended/databases.md` | V1/V2/V3 DB layout, `search_path`, `.env` DB keys |
| `.ai/extended/development.md` | Dev setup, `scripts/dev/`, environment, logging, Heroku Scheduler |
| `.ai/extended/frontend.md` | Pages, components, routing, React Query hooks, MUI theme |
| `.ai/extended/inventory-pipeline.md` | PO processing, M3, preprocessing, manifest templates, fast-cat |
| `.ai/extended/pos-system.md` | Registers, drawers, carts, transactions, receipts |
| `.ai/extended/print-server.md` | Local FastAPI print server — labels, receipts, drawer kick |
| `.ai/extended/retag-operations.md` | Retag v2 day-of / post-cutover ops |
| `.ai/extended/ux-spec.md` | Design philosophy, color, typography, spacing, component specs |
| `.ai/extended/vpn-socks5.md` | PIA SOCKS5 setup, `.env` keys, diagnostics |

### 1C. Drift checks (fast, computer-readable)

Run these before deciding you are done:

```bash
# 1. Summary line in context.md names the current version
grep -E 'v[0-9]+\.[0-9]+\.[0-9]+' .ai/context.md | head -5
cat .version

# 2. Every .ai/extended/ file has a Last updated timestamp
for f in .ai/extended/*.md; do head -1 "$f" | grep -q 'Last updated' || echo "MISSING TIMESTAMP: $f"; done

# 3. Extended TOC parity between context.md and consultant_context.md
grep -oE 'extended/[a-z0-9_\-]+\.md' .ai/context.md | sort -u > /tmp/ctx_toc
grep -oE 'extended/[a-z0-9_\-]+\.md' .ai/consultant_context.md | sort -u > /tmp/con_toc
diff /tmp/ctx_toc /tmp/con_toc || echo "TOC drift between context.md and consultant_context.md"

# 4. Active initiatives listed in _index.md match .ai/initiatives/*.md (exclude _archived)
ls .ai/initiatives/*.md 2>/dev/null | grep -v _archived
grep -oE '\[.*\]\(\./[a-z_]+\.md\)' .ai/initiatives/_index.md
```

### 1D. Gotchas (things that are almost always wrong)

- `frontend/package.json` `"version"` is **independently versioned** (`0.0.0`). **Do not** bump.
- `.env` / secrets must never be committed. `git diff --cached` review is in `session_close.md`, not here — but flag if you see one.
- `CHANGELOG.md` entries live at **root**, not under `.ai/`.
- Initiative `## Sessions` entries are **append-only** — never rewrite a prior session's `#### Result`.

---

## Part 2 — Version bump decision (`.version` + root `package.json`)

**Format:** `.version` line 1 is `vMAJOR.MINOR.PATCH` (with `v`). Root `package.json` `"version"` is the same numeric semver **without** the `v`. Bump both together.

### 2A. Gate — bump ONLY if

1. User explicitly asked for a release, OR
2. Work ships a user-visible / API-relevant change and this is `session_close.md` (not a checkpoint), AND
3. You can **name the initiative** the release fulfills (or explicitly declare "outside initiatives" hotfix).

If any of those three fail → **do not bump**; log under `[Unreleased]` in `CHANGELOG.md` and stop.

### 2B. SemVer decision matrix (ecothrift-specific)

| Change type | Example | Bump |
|---|---|---|
| Breaking API change; removed endpoint; removed DB model/field used by clients | Drop `/api/buying/category-want/`; delete a public serializer field | **MAJOR** |
| Destructive migration affecting shipped data | Drop column with existing prod data; table rename | **MAJOR** (unless coordinated MINOR with fallback) |
| New backend endpoint; new management command; new React page; new model/field | `+ POST /api/buying/auctions/<id>/refresh/`; `+ manage.py estimate_auction_categories` | **MINOR** |
| New feature toggle / AppSetting behavior; new AI flow | Retail-weighted manifest mix; `BUYING_SOCKS5_DEV_AUDIT` flag | **MINOR** |
| UI refactor that changes user workflow | Auction detail UX v3 (v2.15.0) | **MINOR** |
| Backend perf optimization, no API change | HTTP session reuse; query prefetch | **PATCH** |
| Bug fix; edge-case handling; error message tweak | Fix `change_given` coercion; fix 500 on empty manifest | **PATCH** |
| AI/prompt tuning, no schema change | Remove `title_echo` verify; padded cached block | **PATCH** |
| Docs / steering only (no code touched) | Protocol edit; `.ai/extended/` rewording; CHANGELOG cleanup | **no bump** — land in `[Unreleased]` Documentation subsection |
| Pure refactor, no behavior change | Rename internal helper; extract pure fn | **no bump** (or PATCH if tied to a shipping release) |
| Dependency bump, security patch, no API change | `django==5.2.4 → 5.2.5` | **PATCH** |

### 2C. Ambiguity resolution

If the change list spans multiple buckets in one release → take the **highest** bump in the list.

Example: session shipped retail-weighted mix (MINOR) + typo fix (PATCH) + perf opt (PATCH) → **MINOR** bump.

If you genuinely cannot decide between MINOR and PATCH → default **PATCH** and let the user upgrade if they push back. If you cannot decide between MAJOR and MINOR → **stop and ask the user**. Major bumps signal breaking intent to downstream consumers (Heroku release notes, git tags, external integrations); never guess.

### 2D. Files touched on bump

```
.version                     # line 1 → vMAJOR.MINOR.PATCH
package.json                 # root; "version": "MAJOR.MINOR.PATCH" (no v)
frontend/package.json        # DO NOT TOUCH — independently versioned (0.0.0)
```

After edit, verify:

```bash
cat .version
grep '"version"' package.json | head -1
grep '"version"' frontend/package.json | head -1    # must remain 0.0.0
```

---

## Part 3 — `CHANGELOG.md` update

### 3A. When releasing (bumped `.version` in Part 2)

1. Add a new dated section at the **top** under the main header:

```md
## [MAJOR.MINOR.PATCH] — YYYY-MM-DD

User-facing theme: **<one-sentence what shipped>**.

### Added
- <bullet: new capability, file/command reference>

### Changed
- <bullet: behavior change, include file/model/endpoint>

### Fixed
- <bullet: bug + root cause pointer>

### Removed
- <bullet: removed endpoint/model/field + migration reference>

### Documentation
- <bullet: only if doc-only change deserves a bullet under this release>
```

2. **Keep only the subsections you actually have.** Skip empty ones — do not write `### Fixed\n- None`.
3. **Move / copy bullets** from `## [Unreleased]` into the new section. After the move, `[Unreleased]` is either **deleted entirely** (preferred when empty) OR left as an empty stub for the next session — both are valid. Current repo convention: **delete when empty** (see 2026-04-16 CHANGELOG cleanup).
4. Bump `<!-- Last updated: YYYY-MM-DD (<short note>) -->` on line 1.

### 3B. When NOT releasing (checkpoint or docs-only close)

1. Add / tighten bullets under `## [Unreleased]` (create the block if missing).
2. Use the same `### Added / Changed / Fixed / Removed / Documentation` structure under `[Unreleased]`.
3. **Do not** add a dated version section. That is a release action, gated by Part 2.

### 3C. Style rules (computer-readable)

| Rule | Enforcement |
|---|---|
| Bullets are **1–2 sentences**, not paragraphs | If >2 sentences, split or prune |
| Cite **initiative filename** when the bullet continues a tracked initiative | `see [bstock_auction_intelligence.md](...)` |
| Cite **file / model / endpoint / command names** in backticks | `` `recompute_buying_valuations` ``, `` `POST /api/auth/login/` `` |
| Cite **migration numbers** for schema changes | `` migration `0023_po_est_shrink_remove_cost_pipeline_fields` `` |
| Do **not** include implementation narrative | Move that to commit message body |
| Versions stay in **descending order** from top | Newest section immediately under the main header |
| Dates are **UTC-equivalent YYYY-MM-DD** | Match `.ai/context.md` timestamp convention |

### 3D. Drift checks after edit

```bash
# Top dated version in CHANGELOG matches .version
grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' CHANGELOG.md | head -2
cat .version

# [Unreleased] block, if present, has at least one bullet
awk '/^## \[Unreleased\]/,/^## \[/' CHANGELOG.md | grep -c '^- '

# No duplicate version headers
grep -cE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md
grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | sort | uniq -d
```

---

## Part 4 — Exit criteria (stop here)

All of:

- [ ] Every touched file listed in Part 1 has a current `<!-- Last updated -->`.
- [ ] Extended TOC matches between `.ai/context.md` and `.ai/consultant_context.md` (Part 1C check 3).
- [ ] If bumped in Part 2: `.version`, root `package.json` `"version"`, and top of `CHANGELOG.md` all agree.
- [ ] If NOT bumped: changes live under `## [Unreleased]` in `CHANGELOG.md`.
- [ ] `frontend/package.json` `"version"` still `0.0.0`.
- [ ] No secrets in touched files (`git diff` visual scan of `.env*`, `AWS_`, `ANTHROPIC_`, `SECRET_KEY`, `DATABASE_URL`).

**This protocol does not commit or push by itself.** Hand back to the user, or continue to `session_close.md` Part 3 for pre-commit + push.

---

## Part 5 — `commit_message.txt` and `2_push_github.bat`

**Path:** [`scripts/deploy/commit_message.txt`](../../scripts/deploy/commit_message.txt). **Push script:** [`scripts/deploy/2_push_github.bat`](../../scripts/deploy/2_push_github.bat) runs `git add .`, then **`git commit -F`** on the **entire** file (not just line 1), then `git push origin main`. **Line 1** is validated separately and must **not** be the placeholder `---`.

| Situation | What to do |
|-----------|------------|
| **After a successful push** | `2_push_github.bat` resets `commit_message.txt` to a **single line** `---`. Before the next push, **replace the whole file** with the new message (subject on line 1, blank line, then body). Do **not** keep `---` on line 1 with more text below — the script rejects `---` as the first line and you will not get a real subject. |
| **File already has a full message** (not placeholder) | Run `2_push_github.bat` when ready — the **entire** file becomes the git commit message. To add more, **edit** the file (append or rewrite), then run the script; nothing auto-appends. |
| **Placeholder only** (`---` alone) | **Replace completely** with your real subject + body. |
| **Called from** `5_deploy_yolo.bat` / `4_deploy_careful.bat` | Same rules; on success the caller may not reset the file (see `--called` behavior in the `.bat`). |

**Conventional shape:** line 1 = `type: short description`; blank line; body (bullets OK).

**This protocol** does not require editing `commit_message.txt`; use Part 5 when a review session should leave the repo ready for a push with a coherent message.

---

## Relationship to other protocols

| Protocol | Role vs this one |
|---|---|
| `startup.md` | Creates the session entry this protocol updates `_index.md` / initiative file for |
| `session_checkpoint.md` | Lighter pulse — `[Unreleased]` only, never `.version` |
| `get_bearing.md` | Use when you're not sure what changed — do that before this protocol |
| **`review_bump.md`** (this) | Docs audit + semver + CHANGELOG **slice** |
| `session_close.md` | Superset — calls this protocol's work AND sets `#### Result` / `commit_message.txt` / pre-commit / push |
