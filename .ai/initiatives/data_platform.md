<!-- initiative: slug=data-platform status=active updated=2026-09-25 -->
<!-- Last updated: 2026-09-25 -->

# Initiative: Data platform and the AI supervisor

**Status:** **Active**, Phase 1 in progress. The owner's priority besides Thrift+ (2026-09-25). Day by day: [`.ai/calendar.md`](../calendar.md).

**Objective:** The store's data is organized in three layers, each with its own purpose:
- **Operational** keeps the business running: timeclock, staff, routines, QA, processing, orders, vendors, POS.
- **Context** is curated for fast decisions by the owner, managers and an AI supervisor. It is mostly operational data, plus anything built or kept for that purpose.
- **Analytical** is curated for predictive modelling: point-in-time, engineered, supplemented by external data and vectors, and ready to model on any variable.

On top of the layers:
- an AI supervisor reads the Context layer daily and writes the owner a curated brief in Dash;
- routine data work (backfills, merges, QA fixes) is staged in production and approved by the owner there;
- a model factory can predict any variable in the Analytical layer, the owner's way, overnight.

**Compass:** not the compass until the Thrift+ launch ([`thrift_plus_rewards`](./thrift_plus_rewards.md) holds it to 10-20). This initiative takes over from [`data_quality_rails`](./data_quality_rails.md) (the review loop) and [`product_intelligence`](./product_intelligence.md) (production loads through Requests). [`buying_intelligence_v2`](./buying_intelligence_v2.md) becomes its first big consumer.

---

## Finish line

Every morning the owner opens **Dash → Brief**: the AI supervisor's curated update, built from the Context layer, covering sales, hours, QA, buying, inventory flow and Thrift+. From there, **Superuser → Requests** holds every staged change waiting for him, with evidence, one-click approve and undo.

Overnight, a local job:
1. pulls production;
2. rebuilds the Analytical layer;
3. runs the model factory on the targets he picked;
4. pushes the scores back.

In the morning the scoreboard shows which model won, against the owner's logistic baseline, on a leakage-free final holdout.

---

## Out of scope

- **Email or text delivery.** Dash only, for now (owner, 2026-09-25).
- **Reports for managers.** Later; the owner curates them first.
- **QA outside data quality.** Finance, HR and the rest plug into the same framework later.
- **Production hosting of the warehouse or the model training.** Both run locally: the owner's Windows PC now, the Linux camera server later. Only artifacts and scores reach production.

---

## Phases

### Phase 1 — Superuser Requests · **ship Mon 09-28 (v2.106.0)**
One place in production where Claude stages routine data work and the owner approves it.
**Gated by:** none.

Acceptance:
- [x] A generic request, built as `ApprovalRequest` (`core.0008`) plus `services/approval_requests.py`: a registry of kinds, `stage`, `approve`, and `run` (a background thread, chunked, a heartbeat, a resumable cursor, a log), plus `reject`, `undo`, `resume` and `resume_stalled`. Kinds live in each app's `approval_kinds.py`, and `stage_request` stages from the command line.
- [x] A **Superuser → Requests** page (`/admin/requests`): tabs for Waiting, Running, Done and All; the detail shows counts, changes and a sample table; approve or reject with a note; progress with polling; the log; undo with a confirmation; resume. J/K move.
- [ ] The first staged requests in production:
  - load the backfill proposals (product profiles; Mixed lots fall from 89.6% of sales to 4.3%);
  - seed the brand aliases;
  - the first batch of duplicate merges (reversible, through `CatalogMerge`).
- [x] The ~17k stale "open" auctions: closed by the full revaluation on 2026-09-25. `recompute_auction_full` closes any auction whose end time has passed (`infer_auction_completed_from_end_time`), so no request was needed.
- [ ] The full pre-ship run is GREEN.

### Phase 2 — Context layer and the AI brief · **ship Thu 10-01 (v2.107.0)**
- A daily **Context snapshot**: curated yesterday-and-trend numbers for sales, labor hours, routines and QA, buying (Today's plan, wins, report cards), inventory flow (processed, on the floor, aging) and Thrift+ (after launch).
- An **AI supervisor** writes the owner's brief from it (what changed, what needs him, what to watch) into **Dash → Brief**, for the superuser.
- Everything the brief says is traceable to the snapshot.

**Gated by:** Phase 1.

Built on 2026-09-25, ahead of the calendar:
- **Models:** `ContextSnapshot` and `DailyBrief` (`core.0009`), and the AiAction `SUPERVISOR_BRIEF` (`core.0010`).
- **Snapshot** (`services/context_snapshot.py`): sections are built independently, and a failed one is recorded, not fatal.
- **Brief** (`services/daily_brief.py`): a forced tool call returns the headline, needs_you, numbers and watch, with rules that forbid invented numbers. It is written in a background thread.
- **API and command:** `GET /api/core/brief/` (it starts yesterday's brief if missing), `POST …/brief/write/`, and `build_daily_brief`.
- **Page:** `/brief`, the top nav item for the superuser.

### Phase 3 — QA framework (data quality first) · after launch, target **ship Thu 10-29**
- Standing checks over live data, like tests over code, then AI triage against the QA standards doc, then items in Requests (the QA inbox).
- The keyboard-fast review, bulk accept and undo.
- The checks start from the data-quality register.

**Gated by:** Phase 2. Detail when Phase 2 is built.

### Phase 4 — The Analytical layer · target **ship Thu 11-12**
- A local warehouse on Windows now and the Linux server later (Parquet + DuckDB, or local Postgres), rebuilt nightly from a production pull.
- **Point-in-time event tables:** item lifecycle, prices and retags, category labels over time, vector versions, auctions and snapshots, POs, sales, and Thrift+ signals (scans, adds, passes, rewards).
- **Misfit sales:** sold items not matched to a product, manifest or PO.
- **Inventory reconstruction:** what was on the floor on any date, from processing, sales and misfits, with shrink estimates and heuristics for when it happened. That gives supply "pressure".
- Every variable can be a target (the "autoencode everything" view).
- A small job pushes scores back to production.

**Gated by:** Phase 3. Detail when Phase 3 is built.

### Phase 5 — The model factory · target **ship Thu 11-26**
Codify the owner's method, and have an LLM direct the overnight runs.

**The owner's method:**
1. Type each variable: categorical, ordinal or continuous, plus special types such as mostly-null.
2. Split multi-part variables, e.g. `is_var_null` and `var`.
3. Move everything to uniform through an estimated CDF (fit across CV, conservative where the variance is high).
4. Use lasso and ridge to pick features, then logistic regression as the explainable baseline.
5. Use time-series validation, with a **leakage-free final holdout** of the most recent data for every comparison.
6. Other model families must beat the baseline by a significant margin.
7. The winner is retrained on all the data (or the best window).

**The LLM research director:**
- It sets the budget, prunes stalled model families, decides when to reseed and when to stop.
- It works over a proper optimizer, logs every decision, and never sees the holdout except at promotion.

The first targets are the owner's list:
- the price an item sells for;
- the speed at a price;
- units per week;
- the auction close;
- truck sell-through by date;
- final category;
- price per day.

**Gated by:** Phase 4. Detail when Phase 4 is built.

---

## Acceptance

- [ ] Phase 1 — Superuser Requests
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-25 — Opened.** The owner set the three-layer model and the AI supervisor brief as the priority besides Thrift+. Production data work is to be approved in production, not locally. The owner's modelling method is recorded for Phase 5; debate it only with data in hand.

---

## See also

- [`thrift_plus_rewards`](./thrift_plus_rewards.md) · [`buying_intelligence_v2`](./buying_intelligence_v2.md) · [`data_quality_rails`](./data_quality_rails.md) · [`product_intelligence`](./product_intelligence.md)
- [`.ai/calendar.md`](../calendar.md) · [`.ai/extended/data-quality.md`](../extended/data-quality.md)
- Index: [`_index.md`](./_index.md)
