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
| R-014 | test | Pre-ship full run (before the Heroku deploy) | GREEN: 0 NEW | pending |
