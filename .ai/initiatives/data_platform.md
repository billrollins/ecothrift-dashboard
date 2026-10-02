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

### Phase 3 — QA framework (data quality first) · built early (09-25), tests R-079 · ship with the next push after it is GREEN
- Standing checks over live data, like tests over code, then AI triage against the QA standards doc, then items in Requests (the QA inbox).
- The keyboard-fast review, bulk accept and undo.
- The checks start from the data-quality register.

**Gated by:** Phase 2.

**Built as** (new app `apps/qa`, so it ships on its own):
- **The checks:** `apps/qa/checks.py` holds 15, each named by its register ID.
  - Items: ITM-05, 07, 08, 10.
  - Sales: SAL-04, SHR-03.
  - POs: PO-01, 11.
  - Auctions: AUC-07, 08.
  - Products: PRD-01.
  - Thrift+: TP-01 to TP-04, new register rows. TP-01 waits for the switch.
- **The run:** `run_qa` (nightly, 07:00 UTC) keeps `QARun` and `QAFinding` rows with the count, the last count, samples and ids. A broken check records its error and the rest still run.
- **The AI triage** (`QA_TRIAGE` in Settings → AI) writes a headline and a note per check from the numbers only. A failed call never stops the run.
- **The QA inbox:** a check with a safe fix stages a Requests item (one at a time per kind). The first is `qa.sold_from_cart` (SHR-03), which marks floor items sold from their completed sale, with undo. The Requests center already gives the keyboard review, approve and undo.
- **Dash:** `/admin/qa` (superuser; a link on Requests). Checks with rows come first, then by severity; each opens to its triage note, run history and sample; Run now.
- **The brief:** the snapshot gets a `qa` section (worse overnight, high severity with rows, failed checks, the triage headline).

### Phase 4 — The Analytical layer · target **ship Thu 11-12**
- A local warehouse on Windows now and the Linux server later (Parquet + DuckDB, or local Postgres), rebuilt nightly from a production pull.
- **Point-in-time event tables:** item lifecycle, prices and retags, category labels over time, vector versions, auctions and snapshots, POs, sales, and Thrift+ signals (scans, adds, passes, rewards).
- **Misfit sales:** sold items not matched to a product, manifest or PO.
- **Inventory reconstruction:** what was on the floor on any date, from processing, sales and misfits, with shrink estimates and heuristics for when it happened. That gives supply "pressure".
- Every variable can be a target (the "autoencode everything" view).
- A small job pushes scores back to production.

**Gated by:** Phase 3.

**Built as** (2026-09-28; local only, nothing in production):
- **The warehouse:** DuckDB reads the local Postgres copy (`scripts/db/pull_prod_to_local.bat`) and writes `workspace/warehouse/ecothrift.duckdb`, a Parquet file per table, and `build.json`. `python -m warehouse.build` rebuilds everything in about 12 seconds; `--only <name>` rebuilds some. Local requirement: `requirements-warehouse.txt` (never on Heroku).
- **Tables** (`warehouse/sql/NN_*.sql`, one file per group):
  - `item` (era, category, the cost and timing rules) and `po` (the $0-is-unknown rules);
  - `sale_line` (completed and voided carts; SAL-08 duplicates flagged) and `misfit_sale` (no item, `MIS` vendor, no PO, V3 with no manifest line);
  - `item_event`: history, sold and voided from the carts (checkout writes no history, SAL-14), scans, Thrift+ signals and reward changes;
  - `item_price`: tag intervals from retags (ITM-14);
  - `floor_interval` and `floor_daily`: the floor on every day since 2026-04-01 (items, tag and retail value, stale over 90 days, start known, Mixed lots, added);
  - `auction`, `auction_price`, `category_label` (the proposal history, PRD-04);
  - `sell_curve_daily` and `sell_curve`: the share sold by each day on the floor per category (Kaplan-Meier, so items still out count fairly), with marks at days 7, 14, 30, 43 (Black Friday for stock out Oct 15), 60, 77 (Dec 31) and 90;
  - `category_supply`: per week and category, items on the floor, units and revenue sold, weeks of cover;
  - `floor_now`: every item out at the pull, with its age band and its chance to sell in the next 30 days from its category's curve (input for the October call on rewards for stock already out, and for stale stock, SHR-01);
  - `item_outcome`: the Phase 5 table, one row per item out since 2026-04-12, with point-in-time features (category, brand, condition, vendor, retail, the tag then, the category's floor and pace the week before) and outcomes (sold, censored, days on the floor, sold_for, recovery).
- **Data quality:** every fill-in is a column (`era`, `*_source`, `cost_known`, `start_known`, `at_estimated`), listed in the imputation catalog. New register rows: SAL-14, SAL-15, ITM-14, PRD-04, PRD-05.
- **Checks:** `checks` is counted on every build and printed; a must-be-zero check that fails makes the build exit 1 (RESULT: RED). `python scripts/dev/lean_test.py warehouse` runs it in one line. The floor on the last day matches the items on the shelf exactly, less the 43 SHR-03 items.
- **Nightly:** `scripts/warehouse/nightly.ps1` pulls, then builds, logging to `workspace/warehouse/nightly.log`. The owner schedules it (Task Scheduler). The pull replaces the local database.

**4b, built the same night:** the tag value on each day (`floor_daily.tag_value`, from price steps), supply by category (`category_supply`), sell curves, `floor_now`, and `item_outcome`.

**Still to build:**
- Shrink estimates: the floor has never been counted (SHR-01, SHR-02), so this stays **unknown** until Monday floor counts exist; `floor_now` gives the stale list and each item's sell odds meanwhile.
- More target tables as Phase 5 picks them (auction close, truck sell-through by date, units per week).
- The job that pushes scores back to production (with Phase 5, when there are scores).

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

**Gated by:** Phase 4.

**Built as** (first version, 2026-09-28; local only):
- `factory/method.py`: the method's steps 1 to 4, each fit on training rows only: type the variables (categorical, ordinal, continuous, mostly-null dropped over 80% null); split nulls into `is_<var>_null` plus the value; continuous and ordinal to uniform by an estimated CDF (quantiles); lasso (L1 logistic, CV strength) picks features; logistic regression is the baseline, with its weights printed.
- `factory/run.py`: `python -m factory.run <target>`. Rows ordered by the day the item went out; the last 21 days are the **final holdout**, untouched until both models are fit; 4 expanding time folds for CV. The challenger (gradient boosting) is promoted only if the 95% bootstrap interval of its holdout log-loss gain is above zero. Writes `workspace/factory/<target>/scoreboard.json` with the data-quality notes behind the rows.
- **First target, `sold_30`** (will an item sell within 30 days of going out): baseline holdout AUC 0.70, log loss 0.514; the challenger lost (AUC 0.59) and the baseline stays. The strongest weight is **copies of the same product already on the floor** (`same_product_on_floor`, added to `item_outcome` for it): deep duplicates sell slowly (216 "Good" 1-inch paint brushes from one Walmart truck, 14 sold).

**Still to build:** the conservative CDF (shrink toward uniform where folds disagree), the other targets (sale price, speed at a price, units per week, auction close, truck sell-through by date, final category, price per day), more challenger families, and the LLM research director.

---

## Acceptance

- [ ] Phase 1 — Superuser Requests
- [ ] Out-of-scope items stay out

---

## Record

**2026-10-02 — Product standard and dedupe pipeline shipped (code only).** 135,005 products standardized and 32,370 duplicates merged on the local copy; the plan, rules and results are in [`extended/backfill-plan.md`](../extended/backfill-plan.md) and [`extended/product-standard.md`](../extended/product-standard.md). Next: intake produces the standard from the start, then the production loads through Requests.

**2026-09-25 — Opened.** The owner set the three-layer model and the AI supervisor brief as the priority besides Thrift+. Production data work is to be approved in production, not locally. The owner's modelling method is recorded for Phase 5; debate it only with data in hand.

---

## See also

- [`thrift_plus_rewards`](./thrift_plus_rewards.md) · [`buying_intelligence_v2`](./buying_intelligence_v2.md) · [`data_quality_rails`](./data_quality_rails.md) · [`product_intelligence`](./product_intelligence.md)
- [`.ai/calendar.md`](../calendar.md) · [`.ai/extended/data-quality.md`](../extended/data-quality.md)
- Index: [`_index.md`](./_index.md)
