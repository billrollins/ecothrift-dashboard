<!-- Last updated: 2026-09-02 -->
# Routines

Periodic and on-demand fill-in forms. Initiative: [`routines_and_documents`](../initiatives/routines_and_documents.md).

## App

`apps.routines` — `/api/routines/`. Staff open `/routines` from the **account menu** (avatar), not Essentials. Digit 9 and letter L stay free.

## Models

| Model | Role |
|-------|------|
| `Routine` | Title, intro, `definition` JSON, `kind`, `system_key`, `verifies`, `subject_source`, `trigger` (`daily` / `weekly` / `biweekly` / `monthly` / `quarterly` / `annual` / `on_demand`), `weekdays`, `anchor_date` (bi-weekly first due), `remind_time`, `due_time` (nullable), `late_after`, `grace_days`, `assignment` (`pooled` / `per_person`), role / department / users, `subject_pool`, `is_blocking`, `is_active` |
| `Section` | A named area of a department and the person who keeps it: `department`, `name`, `owner` (nullable), `is_active`, `sort_order`. Unique `(department, name)`. Free-form on purpose — the floor is re-cut often. |
| `RoutineRun` | One materialized obligation. `assigned_to` is **null for pooled**. Unique `(routine, period_key)` when pooled; `(routine, period_key, assigned_to)` when personal. `section` is the area a cross-check or spot check is about; `generated` holds the sample drawn at materialize time so it cannot be rerolled. Status `open` / `done` / `missed`. Closes only when a submission lands. |
| `RoutineSubmission` | Draft or submitted responses. On-demand rows have `run=null`. Server re-derives results; `failed_count` / `has_critical_fail` are stored on submit. |

Definition controls: `pass_fail`, `pass_fail_strict`, `number` (+ `unit`), `text`, `photo`. Checks may set `critical: true`.

`kind` decides which runner the phone shows and how `responses` are shaped (`kinds.py` owns all four: initial state, merge, submit blockers, outcome):

| Kind | `responses` | Authored? |
|------|-------------|-----------|
| `checklist` | The definition's sections, plus `verify: { run_id, result, note }` when `verifies` is set | Yes, in the editor |
| `section_tally` | `{ sections: [{ section_id, counts, flags, photo, notes }] }` — every section its owner keeps | No |
| `section_audit` | `{ section_id, photo, items_inspected, counts, flags, notes }` | No |
| `owner_spot` | `{ checks: [ …drawn pass/fail… ], audit: <section_audit> }` | No |

The three section kinds keep an empty `definition`; the editor hides the Checklist band and the inspector disables the editor button. `taxonomy.py` is the single list of what a walk counts, split into `GRADED` (owner standards — only these score), `RECORDED` (churn and product condition — logged, never scored), and `FLAGS` (safety caps the section at 50). Every label is phrased as work the auditor **did**, not an opinion they formed.

## Schedule

`apps/routines/schedule.py` uses `apps/webstore/services/hours.py` (`is_open_day`). Closed Sunday and Monday produce nothing. Period keys: `2026-09-01`, `2026-W36`, `2026-09-08` (bi-weekly window start), `2026-09`, `2026-Q3`, `2026`. Weekly / monthly / quarterly / annual are due on the last open day of the period. Bi-weekly is due on the window start (`anchor_date`, then every 14 days); if that day is closed, the last open day on or before it. Subject draws are deterministic on `(routine, period, user)`.

`python manage.py materialize_routines` (Heroku Scheduler; replaces `materialize_duties`). Saving a routine, and `GET /api/routines/runs/mine/`, also materialize today's open-day runs so a new checklist appears without waiting for cron. Saving a definition rebuilds open drafts onto the new checks and keeps answers for surviving ids.

**Section-aware materialize.** `subject_source` decides who gets a run and what it is about. `my_section`: one run per active section owner, `subject` listing everything they keep. `other_section`: auditors are the section owners, each given somebody else's section by a deterministic rotation on the ISO week (`(index + week) mod n`, own section skipped) — one section means no run at all. `owner_spot`: `generated` holds `spot_check_count` random checks drawn from the Open / Day / Close definitions (seeded by date) plus the first active section with no spot check this ISO week; when every section has had one, all are eligible again. Reassigning a section moves today's open tally to the new owner.

**Nag hierarchy.** `run_moments(run)` derives three instants and both ends of the app read the same rule. `remind_at` (`remind_time`, else the top of the day) starts the soft nag: badges and My Routines tags. `nag_at` (`due_time`) starts the hard nag in the app bar; **null `due_time` means "at clock-out"** and never raises the app bar at all. `late_at` follows `late_after`: `due_time` (as soon as the hard nag starts), `end_of_day` (default), or `grace_days` (the only setting that reads `grace_days`). `is_overdue` and `was_late` both use `late_at`. On the frontend `runUrgency` returns `quiet | soft | hard | late`; `runsAtLeast(runs, 'soft')` feeds the badge, `'hard'` feeds `RoutinesNag`, and `runsBlockingClockOut` feeds the time-clock dialog.

## API

`IsStaff` performs. Superusers can fill any open run (they already see every row on `/mine/`). `IsSuperAdmin` authors (create / update / delete). Delete is a soft `is_active=false` ("retire"). Staff APIs (`/routines/`, `/runs/`, `/runs/mine/`) filter to active routines only. `GET /api/routines/runs/mine/` returns `open`, `done`, and `on_demand`. `GET /api/routines/runs/overdue-report/` stays for a later SuperAdmin Control Center; it is not on the Dashboard. There is no manual complete.

**Sections.** `/api/routines/sections/` — staff read, superusers write. `?department=` and `?include_retired=1` filter; `DELETE` retires (`is_active=false`); `POST sections/reorder/` takes `{ ids }` in display order. Every write re-materializes, so an owner change lands on today's runs. `POST /runs/:id/cover/` hands an absent person's open per-person run to the requester (same department, or superuser); it refuses a pooled run, a closed run, and one already theirs.

**Grades.** `GET /api/routines/grades/?week=YYYY-Www` (staff) returns the week: `score` / `letter`, `daily_average`, `cross_check_average`, `days` (each with `graded`, `performed` per system key, `performed_score`, `owner_score`), `cross_checks` (section, auditor, score, photo URL, counts, flags), `tallies` aggregated per section per category, `calibration`, `missing_owners` (today's unclaimed tallies), `settings`, and `taxonomy`. Bad or missing `week` means this week.

**Admin surface** (superuser). `GET /routines/routines/admin/` lists every routine, retired included, each with `stats` from `stats.py` (`done`, `passed`, `critical_fails`, `open`, `overdue` honouring grace, `missed`, `last_completed_at` / `_by_name`, `next_due_at`, `assignee_count`) and `created_by_name`. `POST /routines/routines/:id/restore/` flips `is_active` back on and materializes. `DELETE /routines/routines/:id/hard-delete/` removes the routine, its runs, and its submissions; it refuses (400) while the routine is still active, so retire first. `PATCH` reaches retired rows for a superuser (`RoutineViewSet.ADMIN_ACTIONS`); `GET` on one still 404s so staff URLs stay clean.

## UI

Phone-first. One shell: left desk column is **My Routines** or **Catalog** or the **edit form**; the right pane is always the same phone (`PhoneFrame`, 9 / 20, `flush`) with a reserved 64px bottom bar. `flush` runs the device the full height of the pane. Desk / gutters use sage `dutyColors.desk` (`#F4F7F5`). Colours: [`.ai/extended/brand.md`](brand.md) — primary actions and the phone header are brand green `#2e7d32`, not navy.

The phone bar is tinted by mode. Status copy is a small title-case pill with a colour dot (`Live preview`, `Demo`, `Submitted · read only`, `Select a routine`) — never grey shouty caps on a white slab. Fill mode keeps Cancel + brand-green Save.

Every left pane wears `RoutinePaneHeader`: eyebrow, name, and that view's actions on one row. **Pane actions live in the header, never in a footer** — a footer bar lands beside the sidebar version line and reads as page chrome. List views add the My Routines / Catalog toggle and a filter box below it.

Lists and the edit form share one desk width, `PANE_WIDTH = clamp(500px, 46%, 680px)` in `RoutinesPage.tsx`, so switching between browsing and authoring never moves the phone. The editor is told apart by its header: `RoutinePaneHeader tone="editor"` tints it brand-tint with a 3px green rule. The form is one white sheet of `FormSection` bands (a one-line head — name, then purpose — over full-width controls) from `editorStyles.tsx`; every field shares `fieldSx`. Add new form chrome there rather than styling a `TextField` inline. Wide checks are two-line cards — label over hint, answer type over unit, critical and delete spanning both — with a green focus ring on the row being typed in; narrow stacks the same fields.

**AI round-trip** (`routineJson.ts`). The header carries Copy for AI and Update from JSON. Copy writes `buildAiBrief(currentDoc, mode, context)` to the clipboard: what a routine is, the current form as `ecothrift.routine/1` JSON (unsaved edits included; on `/new` it is called a starting point with placeholders), a **Who can own it** section — how assignees resolve (named people, else department ∩ role; pooled = one shared run) plus the department list (id — name) and people list (id — name, role, department) from `GET /routines/routines/assignees/` — a field guide, and reply rules (one fenced block, keep ids, slug ids for new checks, change only what is asked, no em dash or en dash in title/intro/labels/hints), ending in a heading the user types under. Update opens `RoutineJsonDialog`: paste or upload, `parseRoutineDoc(raw, current, context)` pulls the JSON out of prose, merges partial documents over the current form, validates enums/times/ids (duplicates renamed, unit dropped off non-number checks, warnings surfaced), resolves department and people **names** to ids and rejects ids not in the lists, and `summarizeChanges` lists what would change by name. Apply only fills the form — Save is still the commit, so the phone preview is the review step.

Lists use `TaskRow`: a 36px status tile on the left (tone + icon, from `presentRun().glyph` for runs and `triggerGlyphIcon` for catalog rows — `routineGlyphs.tsx`), title, badges hanging off the right of the text block so they column up, meta, then one pill verb (`TaskRowAction`) and quiet icon verbs (`TaskRowIcon`, no border until hover). Density is deliberate: a department can hold fifty routines, so nothing in a row may grow with its content. `TaskCard` is the chunkier card, still right for the nag drawer.

**Status model** (`runStatus.ts` → `presentRun`) — one rule on every surface. *Position* says the bucket (the Overdue header, the Done header); it is never repeated as a badge. The *tile* (`rail` tone + `glyph` icon) says urgency and kind: red `!` overdue, violet pin blocking, green sun due today, blue clock in progress, grey calendar later this week, green check passed, red cross / report failed — same colour meaning as the check rails inside the runner. *Badges* carry only what position cannot: `4/9` in progress, `Passed` / `2 fails` / `Critical fail`, `Late`, and `Overdue` only when the row sits outside the Overdue group (pinned in Blocking). The *action* is one real verb — Fill in, Continue, Review, View — never a disabled primary. Finished runs open in the runner read-only (`/runs/:id/` carries `submission`); `/mine/` attaches this user's `progress` to each open row.

- **My Routines** — Blocking / Overdue / Due today / This week / On demand / Done this week (last, collapsed). Fill in plus an edit icon.
- **Catalog** — every active routine, grouped by department. View, edit icon, delete (retire) icon (superuser); retired rows come back from Routine Control.
- **Fill in** — phone bar is Cancel / Save & close (Save becomes Submit when every check is answered).
- **Edit** — Copy for AI, Update from JSON, Cancel, Save in the pane header; right bar says Live preview.
- **Catalog View** — right bar says Demo live preview (Cancel returns to the catalog).

**Routine Control** (`/admin/routines`, Admin workspace, superuser, `pages/admin/routines/`). The owner's room, so the list header is `RoutinePaneHeader tone="admin"` — ink with the 3px green rule — and the right pane is an inspector, not a phone. Left: search (name, intro, department, role, last performer), Active / Retired / All, health chips with live counts (Overdue, No one assigned, Never run, Blocking — AND when several are on), department and cadence selects, sort (Needs attention / Name / Last performed / Next due). Rows are `TaskRow` with tone by loudest fact (`presentAdminRoutine`: retired grey, overdue red, unowned amber, blocking violet, else brand), meta `cadence · owner · N done · last …`, verbs Inspect / Edit checklist / Retire or Restore. Retire toasts with Undo. Right: `AdminRoutineInspector` — an ink stat strip (Performed, Pass rate, Open now with overdue in red, Last performed by, Next due, Assigned), then the same Name / Schedule / Owner bands as the editor via `RoutineSettingsFields` (Save / Reset / Ctrl+S, dirty-aware; background refetches never clobber edits), then Lifecycle (Retire, or Restore + Delete forever behind a confirm). The checklist itself is edited in `/routines/:id/edit`; the inspector links there. `?id=` holds the selection; phones stack list then inspector with a back button.

`RoutineSettingsFields.tsx` owns everything about a routine except its checklist: the `RoutineSettings` form shape, `settingsFromRoutine` / `settingsToPayload` / `sameSettings`, `TRIGGER_LABELS`, and the bands. The Schedule band is Repeats, Next due, **Remind at**, **Hard nag at** (a time, or At clock-out), **Counts as late** (After hard nag / End of day / After N grace days) with the grace field in a reserved slot. Both the editor and the inspector render it; add a routine field there once.

Routine Control has three rooms behind one header toggle (`AdminViewToggle`): **Routines**, **Sections**, **Grades**. Sections is a department picker over draggable rows with inline rename and owner select, retire / restore, and a fixed-height Coverage panel naming sections with no owner and people with no section. Grades is described under Retail QA below. Seeded program routines wear a blue `System` tag, cannot be hard-deleted, and only their schedule and owner are editable when the kind has its own runner.

## Retail QA program

Seven routines seeded by `routines/0005_seed_retail_qa` (`retail.open`, `retail.day`, `retail.close`, `retail.section_tally`, `retail.section_audit`, `retail.owner_spot`, `retail.work_cycle`), plus the `retail_qa.*` settings. Open verifies Close, Day verifies Open, Close verifies Day, so each shift signs off the one before it. Open / Day / Close are ordinary pooled checklists whose words belong in the editor; the migration only wires them up.

**Runners** (`pages/routines/runners/`). `KindRunner` dispatches on `kind`. Checklists gain a `VerifyBlock` at the top when `verifies` is set. `SectionTallyRunner` is one card per owned section. `SectionAuditRunner` gates the counters behind a wide photo and refuses to submit under `audit_min_items`. `OwnerSpotRunner` is the drawn checks then the audit inline. `runnerStatus.ts` mirrors the server's blockers so the button says the reason rather than going dead; `previewFixtures.ts` gives the editor and Routine Control a phone preview for kinds that have no definition.

**Grading** (`grading.py`). A checklist scores on *when*, not on what it found: on time 100, late `late_credit`, never done 0. `P` is the mean of Open / Day / Close. A cross-check's section score is the mean of the graded categories, each stepped down by count (0 → 100, ≤ `audit_minor_max` → 75, ≤ `audit_needs_work_max` → 50, more → 0), capped at 50 when Safety is flagged. Recorded categories never touch a score. The day is `D = owner_weight * O + (1 - owner_weight) * P` when the spot check was **finished** that day, else `D = P` — an untouched spot check is silence, not a zero, so the CEO can skip a day without punishing the floor. The week is `weekly_daily_weight * avg(D) + the rest * avg(cross-checks)`; an assigned cross-check nobody did scores 0, but a week with none assigned leans on the days alone. Daily tallies are recorded and never scored. Calibration compares a spot check and a cross-check of the same section and reports categories where the owner found issues the checker logged none of — visible to everyone, never in the grade.

**Settings > Retail QA** (`?tab=retail-qa`) edits all eleven `retail_qa.*` keys through `settingsRegistry` kinds `weight` (0-1, shown as a percent), `score` (0-100), and `count`. `retail_qa_settings()` falls back to the shipped defaults for anything unset or unparsable, so a bad value never breaks a grade.

**Surfaces.** Routine Control > Grades: the week's letter with its three figures, a Mon-Sat strip of day letters, the selected day taken apart, the cross-checks with their photos, the tally grid per section, today's unclaimed walks with **Cover**, and the checker gaps. Dashboard Retail shows the day letter per cell and the week letter under the label; a superuser's click opens `?view=grades&day=…`, everyone else lands on their own routines. The POS terminal cart header carries a **Work cycle** pill (fixed-width slot) that opens the on-demand `retail.work_cycle` run. The time clock raises `ClockOutRoutineGuard` for anything hard-due or due at clock-out — it warns, it never blocks.
