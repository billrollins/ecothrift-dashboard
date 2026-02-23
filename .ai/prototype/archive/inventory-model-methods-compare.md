# Inventory Model Methods: Compare and Contrast

## Purpose

This note compares all proposed inventory modeling methods across both prototypes using differentiating questions, ranked criteria, and philosophical trade-offs.

## Method Legend

| ID | Method | Source |
|----|--------|--------|
| M1 | Flat & Simple (all units are Items) | `.ai/prototype/item-processing.md` Version A |
| M2 | Product-Centric + BulkLot (dual inventory entities) | `.ai/prototype/item-processing.md` Version B |
| M3 | Universal Items + Smart Batch (all units are Items + BatchGroup processing) | `.ai/prototype/item-processing.md` Version C |
| M4 | Pure Deferred Unitization (ledger-first lots, create Items later) | `.ai/prototype/item-processing-ledger-first.md` Version A |
| M5 | Hybrid Policy-Driven Unitization (ledger-first + rules for immediate vs deferred) | `.ai/prototype/item-processing-ledger-first.md` Version B |

---

## Table 1 - Fundamental Differentiating Questions (Data Model)

| Differentiating Question | M1 | M2 | M3 | M4 | M5 |
|---|---|---|---|---|---|
| What is the primary inventory record at intake? | `Item` | `Item` or `BulkLot` | `Item` (+ `BatchGroup`) | `StockLot` | `StockLot` (+ policy decides immediate items) |
| Does every physical unit get an Item row immediately? | Yes | No | Yes | No | Sometimes (policy-based) |
| Is there one inventory concept or two? | One | Two (`Item` + `BulkLot`) | One (`Item`; batch is processing tool) | Two (`StockLot` + `Item`) | Two, but managed by policy |
| What does POS scan? | ITM only | ITM + BLK | ITM only | ITM only | ITM only |
| Where does quantity live before shelfing? | Many `Item` rows | Often in `BulkLot.qty` | Many `Item` rows | `StockLot.qty_available` | Mixed: lot qty and some immediate items |
| How is product identity learned over time? | VendorRef/UPC matching | VendorRef/UPC matching | VendorRef/UPC matching | VendorRef/UPC matching + lot snapshots | Same as M4 |
| Which model best preserves per-unit traceability from day 1? | High | Medium | High | Low-Medium | High for selected categories, medium for deferred bulk |
| Which model minimizes DB row growth fastest? | Low | High | Medium-Low | Very High | High |

---

## Table 2 - Fundamental Differentiating Questions (Workflow and Operations)

| Differentiating Question | M1 | M2 | M3 | M4 | M5 |
|---|---|---|---|---|---|
| How are 61 identical units handled at intake? | 61 Items created | 1 BulkLot | 61 Items + batch tooling | 1 StockLot | Usually 1 StockLot, unless policy forces itemization |
| Can staff process quantity as one operation? | Limited | Yes | Yes | Yes | Yes |
| Is exception handling (one damaged unit) clean? | Medium | Harder (split from lot) | Easy (detach from batch) | Easy (unitize exception unit) | Easy (override policy + unitize exception) |
| Is day-1 shelf-ready tagging immediate? | Yes (heavy workload) | Mixed | Yes | No (must unitize first) | Mixed by policy |
| How many UI queues are needed? | 1 queue | 2 queues (items + bulk) | 2 views, one concept | 2 queues (lots + items) | 2 queues with policy lens |
| Where does staff effort move? | Front-loaded at intake | Reduced for bulk | Reduced through batch | Deferred to replenishment/tagging moments | Balanced by rules |
| Does flow naturally support reserve stock strategy? | Weak | Strong | Medium | Very Strong | Very Strong |

---

## Table 3 - Fundamental Differentiating Questions (Engineering and Risk)

| Differentiating Question | M1 | M2 | M3 | M4 | M5 |
|---|---|---|---|---|---|
| Backend model complexity | Low | High | Medium | Medium-High | High |
| POS integration complexity | Low | High (dual code paths) | Low | Low | Low |
| Reporting complexity | Low-Medium | High (sum across entities) | Medium | Medium-High (lot + item ledger joins) | High |
| Migration disruption from v1.2.0 | Low | Medium-High | Medium | High | Medium-High |
| Amount of new endpoint surface | Medium | High | High | High | High |
| Hidden operational policy burden | Low | Medium | Medium | Medium | High (policy tuning/governance) |
| Failure mode if rules are wrong | Mostly performance pain | POS/process confusion | Processing inefficiency | Stock visibility lag | Wrong auto-itemization behavior |

---

## Philosophy: Where Each Method Puts Complexity

| Method Family | Core Philosophy | Where Complexity Lives | What You Gain | What You Pay |
|---|---|---|---|---|
| Item-first (M1, M3) | Every unit should exist explicitly | DB size + intake processing workload | Per-unit traceability and simple mental model | More rows and processing effort |
| Dual-entity bulk (M2) | Bulk items are inventory, not units | POS logic + returns + reporting reconciliation | Best compression and speed for commodity stock | Two scanning/sales concepts to train and maintain |
| Ledger-first (M4, M5) | Quantity movement is the source of truth; unit records are materialized as needed | Accounting-style ledger rules + unitization workflow + analytics | High scalability, disciplined inventory accounting, reserve-friendly flow | More design rigor and stronger process governance required |

---

## Deeper Complexity Discussion

### 1) Identity and Truth

- M1/M3 treat `Item` as the truth from the start.
- M4/M5 treat lot quantity as truth, and `Item` as a derived sale-ready representation.
- M2 splits truth between `Item` and `BulkLot`, which is powerful but increases reconciliation needs.

### 2) POS and Human Error Surface

- M1/M3/M4/M5 keep one scan language (`ITM`), reducing cashier confusion.
- M2 introduces highest human error risk at checkout because staff must know whether to scan ITM or BLK flow.

### 3) Returns, Shrink, and Auditing

- M3 is strong for unit-level returns without dual POS complexity.
- M4/M5 are strongest for quantity accounting audits (ledger events), but need clear policy for lot-to-item return routing.
- M2 can become hardest for return edge-cases if original sale came from bulk quantity.

### 4) Organizational Fit

- If the store values fast intake with light upfront labor, M4/M5 fit better.
- If the store values immediate per-unit shelf readiness, M1/M3 fit better.
- If the store is highly process-disciplined and can train around two concepts, M2 can be efficient.

---

## Ranking Tables

Scoring uses 1-5 where **5 is best** for that criterion.

## Table 4 - Ease and Simplicity Rankings

| Criterion (5 = better) | M1 | M2 | M3 | M4 | M5 |
|---|---:|---:|---:|---:|---:|
| Implementation ease | 5 | 2 | 3 | 2 | 2 |
| Staff learning ease | 5 | 2 | 4 | 3 | 3 |
| POS simplicity | 5 | 2 | 5 | 5 | 5 |
| Day-1 reporting simplicity | 4 | 2 | 4 | 3 | 3 |

## Table 5 - Capability and Scale Rankings

| Criterion (5 = better) | M1 | M2 | M3 | M4 | M5 |
|---|---:|---:|---:|---:|---:|
| Bulk-order scalability | 2 | 5 | 3 | 5 | 4 |
| Per-unit traceability | 5 | 2 | 5 | 3 | 4 |
| Processing speed at intake | 2 | 5 | 4 | 5 | 4 |
| Flexibility across mixed inventory | 3 | 4 | 4 | 4 | 5 |
| Long-term architecture headroom | 3 | 3 | 4 | 5 | 5 |

---

## Why Choose Each Method (Final Summary)

## Choose M1 (Flat & Simple) when:

- You need the quickest path to production with lowest engineering risk.
- You prefer one obvious truth: every unit is an item from minute one.
- Team capacity is limited and you can tolerate row growth and slower bulk processing.

## Choose M2 (Product-Centric + BulkLot) when:

- Bulk compression is your highest priority and you can accept dual-entity complexity.
- You are prepared to design and train two POS/inventory paths thoroughly.
- You can invest in stronger reporting reconciliation and return handling logic.

## Choose M3 (Universal Items + Smart Batch) when:

- You want per-unit traceability plus practical processing speed improvements.
- You want single-path POS with low cashier confusion.
- You can accept larger item tables in exchange for operational clarity.

## Choose M4 (Pure Deferred Unitization) when:

- You want a quantity-led inventory accounting model with high scalability.
- You run reserve/replenishment flow where not all units need immediate tags.
- You can handle the process shift of unitizing only when merchandised.

## Choose M5 (Hybrid Policy-Driven Unitization) when:

- You want the best blend of lot scalability and selective per-unit traceability.
- Inventory mix is heterogeneous (unique items + commodity lots) and one rule does not fit all.
- You are willing to manage policy governance (thresholds, overrides, periodic tuning).

---

## Practical Recommendation Frame

If your core goal is **speed + simplicity now**, choose **M3**.

If your core goal is **long-term scalability + disciplined inventory accounting**, choose **M5**.

If you want the **lowest immediate implementation effort**, choose **M1** and plan a later migration path.
