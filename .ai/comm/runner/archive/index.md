# Runner archive

Finished tasks, moved out of `queue.md`. Tasks are in `tasks/`, results in `results/`.

| ID | Type | Title | Outcome | Merged into |
|---|---|---|---|---|
| R-001 | test | Buying: fees, shipping formula, Costco | RED: 3 new failures, all fixed by the coder; re-run as R-008 | code fixes |
| R-002 | recon | How Need and Priority work today | done | Need v2 design; register AUC-03 |
| R-003 | recon | Orders pipeline: won through shelved | done | Need v2 pipeline (120-day cutoff, code mapping); register PO-01, PO-03, PO-04, AUC-01, AUC-02 |
| R-004 | recon | Sales data we can use | done | days to sell from `listed_at`; register ITM-01 to ITM-04, SAL-01 to SAL-03, SHR-01 |
| R-005 | recon | Processing velocity and backlog | done | backlog weeks in the Need panel; register PO-01, PO-02, PO-05, ITM-05 |
| R-006 | recon | Product vectors: what exists from the early R&D | done | register PRD-01, PRD-02; bstock Phase 4 |
| R-007 | recon | What listings tell us without signing in | done | register AUC-04, AUC-05; bstock Phase 3 |
| R-008 | test | Need v2 and the R-001 fixes | RED: 1 tsc error (a missing `BuyingCategoryGoal` import), fixed; py all green | code fix |
| R-009 | recon | Data eras | done: V1/V2 imported 2026-04-12 (`BACKFILL:` tags), V3 native from 2026-04 | register: Eras, ERA-01, ERA-02, decisions 1–4 |
| R-010 | recon | DQ: auctions, bids, outcomes | done | register AUC-07 to AUC-15 |
| R-011 | recon | DQ: orders, transit, receiving, vendors | done | register PO-08 to PO-15, VEN-01, VEN-02 |
| R-012 | recon | DQ: preprocessing, processing, products, items | done: scrapped = import label | register PRE-01 to PRE-04, PRD-03, ITM-06 (corrected), ITM-07 to ITM-11 |
| R-013 | recon | DQ: sales, disputes, shrink, counts | done | register SAL-04 to SAL-13, DSP-01, SHR-03, SHR-04 |
| R-014 | test | Pre-ship full run (before the Heroku deploy) | GREEN: 0 NEW | verified; shipped or committed |
| R-015 | test | Priority v2 and Need coverage | GREEN: 0 NEW | verified; shipped or committed |
| R-018 | recon | Can our Postgres hold vectors? | done | register ITM-12, PO-03; product_intelligence Phase 1 |
| R-016 | recon | Every B-Stock category code we have seen, and where it lands | done | register ITM-12, PO-03; product_intelligence Phase 1 |
| R-017 | recon | What is inside Mixed lots (titles and brands) | done | register ITM-12, PO-03; product_intelligence Phase 1 |
| R-019 | test | Focus chip | GREEN: 0 NEW | verified; awaiting commit |
| R-020 | test | 23 categories, B-Stock code mapping, Focus | GREEN: 0 NEW | verified; awaiting commit |
| R-021 | recon | Gold-set candidates (300 products) | done | gold set labelled; product_intelligence Record |
| R-022 | recon | Duplicate products: dry run | done | product_intelligence Phase 4 facts |
| R-023 | recon | Brand spellings and junk brands | done | product_intelligence Phase 2 step 2 |
| R-024 | recon | Auction condition (AUC-05) | done | bstock Phase 3 (condition, speed); register AUC-05 |
| R-025 | recon | Sell speed by category | done | bstock Phase 3 (condition, speed); register AUC-05 |
| R-026 | test | Tests: Spark (Meta) as an AI provider | RED: 1 NEW | RED fixed (test_seed_rows lists Spark models); retest in R-032 |
| R-027 | recon | How far the bad old-era categories reach (ITM-13) | done | register ITM-13 |
| R-028 | recon | Size the free-copy tier for Mixed products | done | register ITM-11; product_intelligence ladder |
| R-029 | recon | Which product identifiers we have | done | product_intelligence Phase 4 facts |
| R-030 | recon | Where names print today | done | product_intelligence Phase 6 |
| R-031 | recon | Held-out set: 200 more products | done | held-out audition (workspace/gold/AUDITION.md); TAX-38 to 45 |
| R-032 | test | Tests: condition shrink, sell speed, why line | GREEN: 0 NEW | verified; awaiting commit |
| R-033 | recon | How much the price rises before close | done | sweep price snapshots; bstock Phase 3 notes |
| R-034 | recon | Why Pet supplies is Need 99 | done | bstock Phase 3 notes (target weeks decision) |
| R-036 | recon | Close price ÷ retail from stored auctions | done: 14,387 sweep closes; 10 mp×cond cells n≥30 (pre-close floor, split by bids) | bstock Phase 5 baseline |
| R-035 | test | Tests: sweep price snapshots | GREEN: 0 NEW | verified; shipped in v2.100.0 (with R-037) |
| R-038 | test | Tests: product profile, proposals, review page | GREEN: 0 NEW | verified; in next release |
| R-039 | recon | Can the local Postgres take pgvector | done: vector not on local Postgres 18.6; README says build with nmake | product_intelligence Phase 2 step 6 (owner decision) |
| R-037 | test | Full pre-ship test run (POS, processing) | GREEN: 0 NEW | pending |
| R-040 | recon | Production: where extensions live | done: vector not installed; no event trigger; pg_trgm already in ecothrift; opinion: CREATE in ecothrift likely succeeds | vector is untrusted on prod; pre-create before the vector release |
| R-041 | test | Tests: product vectors and similar products | RED: 3 NEW | RED fixed (tests scoped); retest R-042 |
| R-042 | test | Tests: vectors (R-041 fix) and product merges | GREEN: 0 NEW | pending |
| R-043 | test | Tests: routine visibility (today-only covers) | RED: 2 NEW | pending |
| R-044 | test | Retest: routine visibility (R-043 fixes) | GREEN: 0 NEW | pending |
| R-045 | test | Tests: routines in one place (Today) | RED: 4 NEW | R-047 |
| R-046 | test | Tests: finished shared checklist not re-created | RED: 1 NEW | R-047 |
| R-047 | test | Tests: My day (runner in place, Hours & pay) | RED: 2 NEW | R-049 |
| R-048 | test | Tests: Dashboard / Today names, compact clock card | GREEN: 0 NEW | pending |
| R-049 | test | Tests: nags and nudges in one drawer, Hours & pay fills, R-047 fixes | GREEN: 0 NEW | pending |
| R-050 | test | Tests: weekly hours nag, clock-in at the limit, Hours & pay folded on phones | RED: 1 NEW | R-051 |
| R-051 | test | Tests: weekly hours nag + forgotten clock-out on Today | GREEN: 0 NEW | v2.103.0 |
| R-052 | recon | Buying manifests: fill, match rates, hazard keywords | done | manifest_analysis.py (NEAR_MIN 0.7, size check, hedge), bstock_daily_buying Phase 4 |
| R-053 | recon | Expected close price and price-target calibration | done | price_target.DEFAULT_CLOSE_MODEL (ratios, bump 1.00, cells), fit_close_model, bstock_daily_buying Phase 5 |
| R-054 | recon | How a purchase order and its manifest are created today | done | won_to_po.py unchanged (mark_won path confirmed; BST- numbers do not change generate_order_number, which already falls back for vendor-style numbers), bstock_daily_buying Phase 6 |
| R-055 | chore | Analyze every dev manifest (Phase 4 backfill) | done | recovery.py (store-wide rate for zero-rate categories), manifest_analysis RETAIL_MISMATCH, bstock_daily_buying Phase 4 |
| R-056 | test | Tests: Buying Phase 4 (manifest analysis, hazards, truck value v2) | superseded, never run | superseded by R-057 |
| R-057 | test | Tests: Buying Phases 4 and 5 | superseded, never run | superseded by R-058 |
| R-058 | test | Tests: Buying Phases 4 to 6 | superseded, never run | superseded by R-059 |
| R-059 | test | Tests: Buying Phases 4 to 6 and the new auction pages | RED: 51 py NEW, 3 vitest NEW, 1 tsc NEW | fixed in R-065 (test seeds, exact unit values, tsc, vitest) |
| R-060 | recon | Manifest hazard precision and candidate new hazards | done | manifest_analysis hazard rules (PART needs "of", INCOMPLETE_TITLE_RE, FRAGILE drops bare tv/mug/plate, NO_GLASS_RE), bstock_daily_buying Phase 4 |
| R-065 | test | Retest R-059 RED (fixes + retail mismatch rail) | RED: 7 NEW | fixed in R-066 (vendor seed, Costco default ratio) |
| R-061 | recon | Backtest the likely close and the similar-lots range | done | bumps stay 1.00 (confirmed); similar range kept, retail-scaled range tested in R-068; bstock_daily_buying Phase 5 |
| R-066 | test | Hazard rules after R-060, and the R-065 fixes | RED: 2 NEW | fixed for R-067 (prediction stored as 3000.00) |
| R-062 | recon | Tie old POs to auctions and backtest valuation | done | seller_factor.py + fit_seller_factors (valuation runs hot: 0.70); no PO backfill; bstock_daily_buying Record |
| R-067 | test | Full pre-ship run for v2.104.0 | GREEN: 0 NEW | shipped in v2.104.0 |
| R-063 | chore | Fit the close model on dev (report only) | done | close_model_fit MIN_BUMP_N 15 -> 50; do not --save the fit yet |
| R-064 | chore | Re-run manifest analysis and valuation after the fixes | done | verified: appliance trucks valued, 523 scaled, part/incomplete 0, fragile 1,046 -> 836 |
| R-068 | recon | Similar-lots range scaled by retail | done | buying_intelligence_v2 pre-Phase-1: switch verdict to the retail-scaled range |
| R-069 | test | Seller revenue factors (after v2.104.0) | GREEN: 0 NEW | shipped in v2.105.0 |
| R-070 | chore | Fit seller factors on dev (report only) | done | fit_seller_factors --save in production (v2.105.0) |

