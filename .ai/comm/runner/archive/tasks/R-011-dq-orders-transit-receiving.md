> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-011 · recon · Data quality: orders, in transit, receiving, vendors

**Why:** Build the data-quality register for order through receiving. Register: `.ai/extended/data-quality.md` (read its rules and table first). Scope: `inventory.PurchaseOrder`, `Vendor`, `ReceivingSession` and related receiving models.

**Answer these:**

1. **Rails today.** For each model: the key fields, what code sets each one (`path:line`), the first date it was ever filled, and its fill %, all-time and last 120 days. Cover:
   - status fields;
   - every date;
   - `purchase_cost`, `shipping_cost`, `fees`, `total_cost`, `retail_value`, `item_count`, `description`.
2. **Check these register rows** with fresh counts: PO-01 to PO-07. Say "confirmed", or correct them.
3. **Vendors.** List every `Vendor`: code, name, type, PO count, and item count through POs. Group the likely duplicates (Target as `TGT` / `TRGET`, Costco as `CST` / `C5TC0`?, and so on) and propose one canonical code per group.
4. **Look for new issues.** At least these:
   - `total_cost` ≠ `purchase_cost + shipping_cost + fees`;
   - costs of 0 or null by vendor and year;
   - `retail_value` against the sum of the PO's manifest retail;
   - dates out of order (paid before ordered, delivered before shipped);
   - POs with no manifest, or with no items, by status;
   - `item_count` against the actual item count;
   - dispute fields in use.
5. **Give every issue as a register row:** proposed ID (next free PO-nn or VEN-nn), Stage, Issue, Scope (counts, as of date), Affects, Handling (suggested, with the rule), Rail (suggested), Status `open`.

**Result:** `.ai/comm/runner/results/R-011-dq-orders-transit-receiving.md`. Read-only; no outside calls.
