<!-- Last updated: 2026-06-12 (P9 amendment: singles & sets row transforms — §7.5) -->

# Design: Product Identity in the Intake Pipeline

**Status:** Baseline approved by owner **2026-06-09**. This is the **landmark design document** for how Products are matched, created, and associated through the intake pipeline (manifest → preprocessing → processing → check-in). It outlives any single initiative; implementation phases are tracked in [`intake_processing_improvements`](../../initiatives/intake_processing_improvements.md).

**Scope:** `ManifestRow`, `PreprocessingRow`, `ProcessingRow`, `Product`, `Item`, `ProcessingCheckInBatch`; the Preprocessing stepper (`PreprocessingPage`) and Item Processor workspace (`/inventory/processing/:id`).

**Relationship to other docs:**

| Doc | Role |
|-----|------|
| This file | Target design — *what we are building toward and why* |
| [`README.md`](./README.md) | Folder index |
| [`session_4_handoff_questions.md`](./session_4_handoff_questions.md) | P2 implementer questions → Fable 5 answers |
| [`.ai/extended/inventory-pipeline.md`](../../extended/inventory-pipeline.md) | Current behavior — *what is shipped today* (update as phases land) |
| [`item_product_creation_fields.md`](../item_product_creation_fields.md) | Field-by-field cross-surface matrix (audit aid) |
| [`intake_processing_improvements`](../../initiatives/intake_processing_improvements.md) | Phases, sessions, acceptance per slice |

---

## 1. The three rules

Everything in this design derives from three rules. If a future change violates one, stop and reconsider.

### Rule 1 — Ownership by table; never sync backwards

| Table | Owns | Lifetime |
|-------|------|----------|
| `ManifestRow` | What the vendor **said** (frozen claim / evidence) | Permanent |
| `PreprocessingRow` | Scaffolding: raw rows, `standard_*`/`ai_*`/`final_*` layers, **match candidates**, working decisions | Staging — owner purges every month or so |
| `ProcessingRow` | What **we decided** at finalize (survival copy of staging conclusions) + warehouse work state | Worktable until order close/archive |
| `Product` | Curated identity — the golden record | Permanent |
| `Item` | Physical fact + lineage (`manifest_row_id` + `product_id`) | Permanent |

Title/brand/model living in 3–4 places is **not** redundancy to "fix" — each copy answers a different question (*what they said / what we decided / what it is*). It only becomes a problem if copies are synced. Therefore: **never write product data back onto rows; never write row decisions onto the manifest.** Downstream surfaces coalesce at read time (§3).

Because staging is purged monthly, **anything processing or history needs must exist on `ProcessingRow`, `ManifestRow`, `Product`, or `Item` before staging dies.** Long-term lineage ("what did manifest line 12 become?") is answered by `Item` rows alone.

### Rule 2 — Product fields are referenced, not copied

When a row has a matched product, the FK **is** the data. We do not overwrite the row's `final_title`/`final_brand`/etc. with product values. Display and check-in resolve by precedence (§3). Consequences:

- A wrong match is undone by clearing one FK — the row's own curated data was never destroyed.
- Product improvements (better description, photos, specs) flow to every surface live, with no stale copies.

### Rule 3 — `ManifestRow` is never split, merged, or matched-against

The manifest line is vendor evidence ("they said 10 controllers"). It carries **no work fields**: no candidates, no matched product, no match status. Matching scaffolding lives on staging (`PreprocessingRow`); the decided match lives on `ProcessingRow`; the fact lives on `Item`. The current `ManifestRow.matched_product` / `match_status` / `match_candidates` / `ai_match_decision` columns are **deprecated** (§8).

---

## 2. The match confidence ladder

Product association is not one link — it is three levels of increasing strength:

| Level | Where | What | Reversible? | Side effects |
|-------|-------|------|-------------|--------------|
| **1 — Candidates** | `PreprocessingRow.match_candidates` (JSON) | Scored suggestions: UPC exact → `VendorProductRef` → exact title/brand → (optional) fuzzy/AI | Free to recompute | None |
| **2 — Decided match** | `PreprocessingRow.final_matched_product` → copied to `ProcessingRow.matched_product` at finalize | "We believe this line is product X." **Null = we believe this is new.** | One-field update | None — prefill hint only |
| **3 — Fact** | `Item.product` | Physical unit verified and bound at check-in | Re-point batch Items' FK | Real inventory |

**Products are created only at Level 3** (check-in, or deliberate manual Add Item) — never by standardize, cleanup, matching, or finalize. A Level 2 match may only point at a Product that *already exists from prior history*. This guarantees:

- No phantom catalog entries for shorted/disputed/never-received lines.
- No systematic duplicates needing merges (matching converges at check-in via UPC/exact/latest-batch reuse).
- Splits and re-matches stay cheap because nothing hangs off levels 1–2.

---

## 3. Field precedence (the one rule staff learn)

> **If a product is linked, the product describes the thing; the row describes the deal.**

| Field family | Product matched | No match |
|--------------|-----------------|----------|
| **Identity** — title, brand, model, UPC, category, description, specifications | **Product wins** (read live via FK) | Row `final_*` (these also seed the new Product at check-in) |
| **Transaction** — quantity, unit_retail, cost allocation, shelf price, condition, notes, row search tags | **Always the row** | Always the row |

Worked example — manifest says `1 hdbnd red`:

- Candidates surface the existing "Red Headband" product (rich title, UPC, description, default price). Staff confirms in Final Decisions → every later surface shows the product's data live.
- If no candidate fits, the cleaned `final_title` ("Red Headband") rides on `ProcessingRow` and seeds a **new** Product at check-in, enriched by physical inspection before save.
- If the match later proves wrong, clear/change `matched_product` — the row view reverts to its own `final_*` data instantly.

`ProcessingRow.search_string` includes **both** row fields and matched-product fields so search hits either name. It is refreshed by `refresh_processing_rows_denorm` when the match changes.

---

## 4. Pipeline stages (target)

```
Upload → Standardize → Clean (ai_*) → Final Decisions (review + matching) → Finalize → Processing → Check-in
```

No new stepper step. Matching folds into the existing review step, renamed **Final Decisions**:

1. **Candidate generation auto-runs** when cleanup CSV is applied (or on entering Final Decisions). Cheap matchers always run: UPC exact → `VendorProductRef` → exact title/brand. Fuzzy/AI matching, if added, runs behind an explicit button.
2. High-confidence hits (UPC exact) **pre-select** `final_matched_product`; everything else stays null with candidate chips visible.
3. Per row, staff can: **accept** the top candidate / **clear** to "new product" / **search products inline** and pick their own. `match_source` records `auto` vs `staff`.
4. Rows sharing a matched product show a **same-product badge** ("also rows 14, 31") plus a "same as row N" quick action (copies the match — no separate linking concept; *the shared FK is the link*).

### Data that crosses finalize → `ProcessingRow`

`manifest_row_id`, `row_number`, quantity, all pricing fields, coalesced `final_*` listing fields, identifiers / taxonomy / specifications / tracking / search_tags, **`matched_product`**, `ai_reasoning`.

**Candidates do not cross.** At processing time, "change the product" is an interactive product search, not a re-review of stale staging candidates. If the chosen product looks wrong in processing, the operator still has: the row's own `final_*` copy (on `ProcessingRow`), the vendor claim (via `manifest_row` FK), and live product search.

---

## 5. Check-in: prefill ladder and product resolution

Prefill order in the check-in form (quick or detailed):

1. **Prior batch on this row with same product** → that batch's `defaults_snapshot` (current behavior).
2. **`matched_product` set** → identity fields from Product; quantity/retail/condition/notes from the row; price = row `shelf_price`, falling back to `product.default_price`.
3. **No match** → row `final_*` fields seed the form **and** become the new Product on save.

On save: match/create Product (`product_mode`: keep / existing / new), create N `Item`s with `manifest_row_id` + `product_id`, record a `ProcessingCheckInBatch` (own product + defaults snapshot). Product edits inside the check-in form stay conservative (fill blanks only — `manual_item.py`); deliberate product edits are a separate explicit action.

**Stops:** check-in no longer writes `ManifestRow.matched_product` (Rule 3). The confirmed identity is recorded on `ProcessingRow.matched_product` and on the Items themselves.

---

## 6. Collapse: N rows → one product

**No new entity.** Setting the same `matched_product` on multiple rows *is* the "same product" marker, in both preprocessing and processing.

- **Display:** workspace groups (or badges) rows sharing a product; queue can offer a group-by-product view.
- **Check in together:** select grouped rows → one form (shared condition/price/location) → on save, executes **per-row** check-ins with each row's expected quantity prefilled (editable). Items land with their **own** `manifest_row_id`.
- **Never physically merge `ProcessingRow`s** — they map 1:1 to manifest lines, and reconciliation/disputes are per line. Collapse is presentation + a batch action, not a data merge. (Existing destructive `MergeModal` semantics are superseded by this model and should be revisited in the cleanup phase.)

## 7. Split: one row → N products

The line "crayons, qty 24" stays one `ManifestRow` / one `ProcessingRow`:

- Check-in **batch 1**: qty 10, Product A (matched or created from physical inspection).
- Check-in **batch 2**: qty 14, Product B, different price.
- Items share `manifest_row_id`, point at different products. Remapping later = re-point a batch's Items' product FK.

Follow-ons for split rows:

- `ProcessingRow.matched_product` becomes the **default/primary hint**; once a row has batches with ≥ 2 products, the queue shows an "N products" chip and **quick check-in confirms the product instead of silently reusing the latest batch's**.
- Row detail groups checked-in Items/batches **by product**.

### The symmetry invariant

```
Collapse:  many rows → one product   (same matched_product on N rows; Items keep their own manifest_row)
Split:     one row  → many products  (N check-in batches; Items keep the same manifest_row)
```

**Quantity truth is always `count(Item where manifest_row_id = X)` vs `ManifestRow.quantity`**, regardless of how products shook out. Over/under is a workflow fact, not a validation error. Shortage with zero receipts = dispute/rollup entry, **no catalog artifact**. *(Amended by §7.5 for transformed rows: quantity truth becomes two-level once a row's unit of measure changes.)*

## 7.5 Singles & sets: row transforms (P9 amendment, owner-approved 2026-06-12)

Merchandising sometimes changes a row's **unit of measure**: sell case contents individually (**Break apart** — 1 unit → X subitems) or bundle loose units into sets sold with **one tag** (**Make set** — S units → 1 set; e.g. 12,000 prayer candles → boxes of 500 for churches, priced independently). Both are row transforms with the manifest line untouched:

- **Whole-row** transforms rewrite `ProcessingRow.quantity` (and `unit_retail`/`shelf_price`, scaled) **in place**. **Partial** transforms create a **sub row** — `split_parent` self-FK + `split_seq`, displayed `#12.1` — sharing the parent's `manifest_row` and carrying the transformed portion; the root keeps the remainder.
- Every operation appends an audit memo to the ROOT row's `transforms` list (`{op, units, factor|set_size, sub_row_id, created_product_id, by, at}`); the root's pre-transform state is snapshotted once into `original_snapshot`.
- `ProcessingRow.units_per_item` (set size; or known pack size on break-apart leftovers) stamps **`Item.unit_count`** at check-in: one physical unit lives in exactly one active Item, and unit reports sum `unit_count` (a sold box of 500 counts as 500 candles).
- **Restart row** is the deliberate **coarse v1 undo**: deletes the family's Items, check-in batches, and sub rows; restores the root from the snapshot (NOT from staging — staging is purged monthly, Rule 1); deletes transform-created Products only when nothing else references them. Blocked when any family item is sold / referenced by a POS cart line, or while a family row is collapsed.

**Rule amendments this section makes:**

1. **ProcessingRow is no longer strictly 1:1 with ManifestRow** — a line may have a *family* of rows via `split_parent`. `ManifestRow` itself is still never split, merged, or written.
2. **Quantity truth becomes two-level:** sellable units per row = `row.quantity` vs that row's own Items (attribution via check-in batches — siblings never cross-count); vendor units per manifest line = reconstructed from the root's `transforms` list when disputes need them.
3. **Second Level-3 exception** (joins the P7 collapse-wizard precedent): a transform's `product_mode: new` may create the Product before check-in.
4. Split families and collapse groups are **mutually exclusive** — collapse rejects family rows, transforms reject collapsed rows.

---

## 8. Schema delta and deprecations

### Add (one migration)

| Table | Field | Type | Notes |
|-------|-------|------|-------|
| `PreprocessingRow` | `match_candidates` | JSON list | `[{product_id, score, source: upc\|vendor_ref\|text, snapshot: {title, brand, upc, default_price}}]` — snapshot lets the review UI render without N queries |
| `PreprocessingRow` | `final_matched_product` | FK → `Product`, nullable | Null = "we believe this is new" |
| `PreprocessingRow` | `match_source` | char: `'' \| auto \| staff` | Staff confirmations outrank auto-picks |

`ProcessingRow.matched_product` already exists — finalize copies `final_matched_product` into it.

### Deprecate on `ManifestRow` (do **not** drop yet)

`matched_product`, `match_status`, `match_candidates`, `ai_match_decision` — stop **writing** first, audit **readers** before any column drop (per migration-safety rules in the initiative). **P6 (Session 8) shipped:** processing workspace writers removed; denorm/detail read ProcessingRow-owned match only; **`match-products`** POST returns 410; model **`help_text`** flags columns. Known reader/writer sites to audit:

- `processing_row_check_in` — ✅ P3 stopped manifest writes at check-in
- `match-products` endpoint + AI match flow in `views.py` (~lines 1100–1500, 5100–5500 — legacy path) — ✅ P6 POST 410; no manifest writes
- `refresh_processing_rows_denorm` (`services/processing_workspace.py` — reads manifest `matched_product_id` into `ProcessingRow`; must switch to ProcessingRow-owned value) — ✅ P6 manifest fallback removed
- `manual-review` serializer surfaces and any raw SQL in `.ai/extended/sql/` — manifest match read-only / deprecated comment only (no P6 rewrite of bulk SQL)

### Out of scope (deliberately)

- Product **merge** workflow (late creation makes duplicates rare; merge is a future backstop, not pipeline design).
- `clean_*` field layer (use existing `ai_*`), `batch_group_id` dependencies, restoration/dispute field expansion on `Item`.
- Catch-all PO enforcement / `Item.purchase_order` backfill (owner-deferred).
- Staging purge automation (owner purges manually for now; revisit after the design beds in).

---

## 9. Why this stays stable

- **One precedence rule** (product wins identity, row wins transaction) applied identically in preprocessing, processing, and check-in — train it once.
- **No new entities** — two staging fields plus UI. Collapse and split are both expressed through things that already exist (`matched_product`, `ProcessingCheckInBatch`).
- **Every decision is reversible until Items exist**; after that, product re-pointing is one FK because `Product` carries no workflow state.
- **Staging deletion is safe by construction** — decisions survive on `ProcessingRow`, evidence on `ManifestRow`, identity on `Product`, facts on `Item`.

## 10. Open questions (resolve during phases)

| # | Question | Default leaning |
|---|----------|-----------------|
| 1 | Auto-accept threshold: does a UPC exact hit pre-select `final_matched_product`, or only surface as top candidate? | Pre-select, badge it `auto`, easy to clear |
| 2 | Fuzzy/AI text matching in candidate generation v1, or exact-only first? | Exact + `VendorProductRef` first; fuzzy later if recall is poor |
| 3 | Where does "check in together" live in the workspace UI (group header action vs bulk-select action)? | Decide in collapse phase with mockup |
| 4 | What happens to existing `MergeModal` / `processingMergeRows`? | ✅ P6 — removed; **Assign shared product** + **Check in together** replace collapse UX |
| 5 | Should `ProcessingRow.matched_product` clear automatically if all of a row's batches use other products? | Probably yes — recompute as "primary = most-units product" in denorm refresh |
