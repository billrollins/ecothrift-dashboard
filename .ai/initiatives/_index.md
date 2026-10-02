<!-- Last updated: 2026-10-01 (Standing: standards; flat archive; inventory_count shipped) -->
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
| [product_intelligence](./product_intelligence.md) | **Phase 2** | Phase 2 structure shipped in v2.101.0: profiles, proposals, review page, pgvector vectors (a title alone places 90.5%), reversible merges. Loading the proposals, merges and embeddings into production waits on owner OK. |

## Archived

Pending, backlog, completed, and abandoned files live together in `_archived/`. [`_archived/ARCHIVE.md`](_archived/ARCHIVE.md) lists each one with its disposition.

*Parent: [`.ai/context.md`](../context.md).*
