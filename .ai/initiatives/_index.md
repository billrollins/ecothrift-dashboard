<!-- Last updated: 2026-10-06 (inventory_effort, hiring_onboarding opened) -->
# Initiatives — ecothrift-dashboard

Bounded work (hours to days), one `.md` per initiative. Not a session log. Rules: [`protocols/initiative-create.md`](../protocols/initiative-create.md), [`protocols/initiative-review.md`](../protocols/initiative-review.md) (§ Filing rules). **Human gate:** do not archive without explicit approval.

**Releases:** [`.version`](../../.version) + [`CHANGELOG.md`](../../CHANGELOG.md) only. Ship: [`ship.md`](../protocols/ship.md), [`deploy.md`](../protocols/deploy.md), print server [`ship-print-server.md`](../protocols/ship-print-server.md).

## Standing

| Initiative | What |
|------------|------|
| [`standards`](standards.md) | What this repo still owes the house standards, and when (`C:\Coding\.ai\standards\`) |

## Active

| Initiative | Phase | Note |
|------------|-------|------|
| [thrift_plus_rewards](./thrift_plus_rewards.md) | **Phase 1** | **Compass until launch.** Free membership whose rewards replace markdowns. Launch Tue 10-20; last project day Thu 10-15. Ships dark behind a switch: members and cards 09-28, reward engine 10-01, register 10-05, signup/scanner/portal/Dash 10-08, launch readiness 10-12/14. |
| [inventory_count](./inventory_count.md) | **Shipped (v2)** | Phone-first shelf count for the owner's weekly inventory: sections, runs, one count a day, one-tap problems, carts, Count sessions, PR Fix-it. In production since 2026-10-01. First real count Mon 10-05, then tune. |
| [data_platform](./data_platform.md) | **Phase 1** | Owner's priority besides Thrift+. Operational / Context / Analytical layers. Requests center (production approvals) 09-28, AI supervisor brief 10-01, QA framework 10-29, Analytical layer 11-12, model factory 11-26. |
| [sell_time_model](./sell_time_model.md) | **Planned** | Owner's first warehouse project: predict the chance an item sells each day from price and context, then use it in the pricing model. Starts after the standardize run and backfill. |
| [buying_intelligence_v2](./buying_intelligence_v2.md) | **Waiting** | Re-planned 2026-09-25 as data_platform's consumer: vector text, truck value v3, the self-running buying loop, the Buying workspace. Resumes after launch. |
| [bstock_daily_buying](./bstock_daily_buying.md) | **Phases 4–6 shipped** | Phases 1–3 in v2.98.0–v2.100.0. Phases 4–6 in v2.104.0: manifest analysis, price targets, Today's best, won → PO, report cards, and the decision-first auction page. Open items move to `buying_intelligence_v2` (seller factors v2.105.0, scaled similar range). No longer the compass. |
| [data_quality_rails](./data_quality_rails.md) | **Phase 1** | Know the data (register + eras, runner R-009 to R-013), then quality-aware numbers, rails at every lifecycle stage, and cleanup. |
| [inventory_effort](./inventory_effort.md) | **Phase 1** | Opened 2026-10-06 after the first full count. 1: one inventory across days (fix the midnight split, merge 10-06 into 10-05). 2: PR Fix-it one-scan fixes. 3: potential shrink worklist (back stock / owner took / sold as generic / shrink). 4: inventory report with a breakdown panel. 5: Orders "If it all sells" + Orders data audit. 6: data quality from the count. 7: close the inventory, shrink analysis. |
| [hiring_onboarding](./hiring_onboarding.md) | **Phase 1 shipped** | Opened 2026-10-06; urgent, runs beside inventory_effort in the worktree `--hiring`. Phase 1 (careers page, apply, Applicants, Not now, Create employee, the careers file with AI) shipped in v2.136.0; the page stays hidden until the owner turns it on. Phase 2 (interview calendar) next. Hiring start to finish in Dash, on ecothrift.us/jobs. 1: jobs (JSON/YAML + AI) and the Careers page, dark. 2: apply with the screener inside, the first-touch email, Applicants, no-hire records. 3: interview calendar. 4: offers signed with a finger. 5: onboarding (Dash user, I-9 scans, checklist, handbook v1). 6: 30/60/90 check-ins. 7: texts once allowed. Built in its own worktree beside `inventory_effort`. |
| [intake_updates](./intake_updates.md) | **Phase 4** | Opened 2026-10-02. Shipped: 1 Orders page numbers (v2.129.0); 2 order modal, faster new-order form, EXP date; 6 vendor metrics; 3's Request code (v2.130.0); 5 the AI picks formulas on upload and templates are gone (v2.131.0; old columns dropped in v2.132.0). Waiting: the owner approves Request #11 (`TGT` → `TRGET`) in production. 4 (dispute refunds) and 7 (next intake screen) need the owner's detail. |
| [product_intelligence](./product_intelligence.md) | **Phase 2** | Phase 2 structure shipped in v2.101.0: profiles, proposals, review page, pgvector vectors (a title alone places 90.5%), reversible merges. Loading the proposals, merges and embeddings into production waits on owner OK. |

## Archived

Pending, backlog, completed, and abandoned files live together in `_archived/`. [`_archived/ARCHIVE.md`](_archived/ARCHIVE.md) lists each one with its disposition.

*Parent: [`.ai/context.md`](../context.md).*
