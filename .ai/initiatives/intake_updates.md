<!-- initiative: slug=intake-updates status=active updated=2026-10-02 -->
<!-- Last updated: 2026-10-02 -->

# Initiative: Intake updates

**Status:** **Active** — Phase 1 shipped 2026-10-02; Phase 2 next.

**Objective:** The owner can look at a purchase order and trust what it says about cost, retail, pricing and sales. Today the Orders page (`dash.ecothrift.us/inventory/orders`) mixes the vendor's listing retail with what was checked in, counts only items that reached the shelf, uses today's tag price instead of the starting price, and gives Sold no context. After this initiative, each number has one plain definition. The owner can see how much of the manifest arrived, whether the retail estimates held up, how much of the starting price has come back as sales, and the most the rest could still bring in. Entering a new order also gets faster: the vendor fills itself in, sums can be typed as `x+y`, and the order opens as a standard modal. Target becomes one vendor. On Preprocessing, the AI picks the column formulas as soon as a manifest is uploaded, and manifest templates go away. The Vendors page shows how each vendor performs. Later phases take the same care to the other intake screens.

**Compass:** this file is not the compass; [`thrift_plus_rewards`](thrift_plus_rewards.md) stays the compass until launch.

---

## Finish line

On **Inventory → Orders**, the owner selects any orders, both in the table rows and in the summary cards above them, and reads:

- **Cost:** the total cost, with the expected recovery.
- **Retail:** the manifest total and how much of it was processed.
- **Priced:** the starting price of everything checked in, and how its retail compares with the manifest.
- **Sold:** the amount sold, the percent sold, and what is left unsold.

Every number matches a hand check on three real orders. Each row shows its expected delivery under the status. Clicking an order opens it in a modal. **New Order** fills in the vendor from the order number, takes Ordered and Paid dates and `x+y` costs, and **Create** (Enter) stays on the list. All Target orders sit under one vendor, `TRGET`. On Preprocessing step 1, the AI's formulas and their sample results are already there when the owner opens it. There is no template picker, no Clear Formulas button and no Use AI button. On **Inventory → Vendors**, each vendor shows its orders, spend, landed and priced % of retail, manifest accuracy and sell-through.

---

## Out of scope

- How `Item.cost` is worked out (it stays a rough estimate; see `extended/inventory-pipeline.md`).
- Changing the stored listing retail (`PurchaseOrder.retail_value`). It stays the vendor's number and is only compared against.
- Fixing old orders' data. An order with no manifest rows, no check-in data or no price history shows `-` with a flag. It is not dropped and not backfilled here.
- The Profit column.
- What the order view contains. Phase 2 moves it into a modal; it does not redesign it.
- Renaming order numbers. Old numbers such as `TGT126675` stay as they are; only the vendor they belong to changes.
- Buying pages, truck value and the B-Stock models. That includes Buying's own manifest templates (`apps/buying/services/manifest_template.py`, fast-cat keys), which are a different thing from the Preprocessing templates and stay.
- Preprocessing step 2 (AI Cleanup) and Final Review.

---

## Phases

### Phase 1 — Orders page numbers
The Cost, Retail, Priced and Sold columns and the summary cards on the Orders page show the owner's definitions below.
**Gated by:** none.

**The definitions (owner, 2026-10-02):**

| Column | Main line | Second line |
|---|---|---|
| **Cost** | **Total cost:** price + fees + shipping (later, minus dispute refunds: Phase 4). | **Recovery expected:** Priced (starting) ÷ Total cost. |
| **Retail** | **Total from manifest:** sum of extended retail (quantity × unit retail) on the preprocessed manifest rows. It should match the uploaded file and the listing retail in the title; when it does not, show a flag. | **Retail processed (from manifest):** manifest retail of the items checked in from manifest rows, and that amount as a % of the manifest total. Leaves out items not received, disputed items, and items that came but were not on the manifest. |
| **Priced** | **Priced (starting):** the starting price of **all** items checked in from this order, extras included. Starting = the price at check-in, not today's tag after markdowns. | **% of manifested retail:** the processor-approved retail (`Item.retail`) of all items checked in from this order ÷ the manifest total. Extras offset broken or missing items, and over- and under-estimated retails even out, so this should land near 100%. |
| **Sold** | **Sold:** net sold, as today. | Replaces the 7-day line. **% sold** (Sold ÷ Priced starting) and **unsold left:** the current price of items still unsold, not counting shrink (lost, scrapped). Example: priced 10,000, sold 2,000, 2,500 left. Markdowns were big, and 2,500 is the most this order could still bring in. |

**What it does today** (`apps/inventory/services/purchase_order_financials.py`, `frontend/src/pages/inventory/orderList/orderListColumns.tsx`, `ProfitabilitySummary.tsx`):

- **Retail** shows only the listing retail (`retail_value`). The manifest total is not computed. Its second line, "PRC", is Priced ÷ listing retail.
- **Priced** sums today's `Item.price`, and only for items that reached the shelf. Markdowns lower it, and checked-in items not yet shelved are left out.
- **Priced**'s second line, "MFT", is `Item.retail` of the shelved items ÷ the listing retail, not ÷ the manifest total.
- **Sold** shows the last 7 days on its second line, with no % sold and no unsold amount.
- **Cost**'s second line, "EST REC", is Priced ÷ cost, so it inherits Priced's problems.

Acceptance:
- [x] The backend returns the new numbers for each order and for the summary: manifest total retail, a manifest-vs-listing mismatch flag, retail processed from the manifest, priced (starting), processor-approved retail of everything checked in, unsold left, and the percents. The page-metrics endpoint (`orders/page-metrics/`) and the summary endpoint (`orders/summary/`) both carry them.
- [x] Priced (starting) uses each item's price at check-in. **Decided:** the old value of the first `price_change` line more than 60 seconds after check-in (the check-in writes its own line), else today's price. The source is decided and written here: either the first `price_change` row's old value in `ItemHistory`, or a stored starting price. Every price-change path (bulk price, Quick reprice, item edit, POS) is checked to make sure it writes history.
- [x] The four columns and the summary cards show the definitions in the table above. Labels are spelled out, or explained in a tooltip, instead of PRC / MFT / EST REC.
- [x] Missing data shows `-` and a flag, not `$0`: an order with no manifest rows, no listing retail, or old items with no history.
- [x] Tests in `test_purchase_order_financials.py` cover each definition, including extras, disputed, not received, a marked-down item, and a lost item.
- [x] Hand check on three real orders: one clean, one with disputes or missing items, one with extras. Every number is checked by hand, and the order ids and results are written in the Record below.
- [x] Speed: the page and the summary stay quick on the largest order (about 15,000 items). Nothing brings back the item × manifest join behind the temp-disk alert fixed in v2.115.1.
- [x] The register IDs and fill-ins this touches are named (`extended/data-quality.md`): PO-09 ($0 for unknown money: shown as `-`), PO-10 (listing retail vs manifest: the `!` flag), PO-12 (no manifest rows: flagged), PO-14 (disputes: disputed items left out of retail processed), ITM-08 (retail null: left out of the sums), ITM-14 (no price history: starting = today's price, flagged).
- [x] `extended/inventory-pipeline.md` describes the Orders page numbers.

### Phase 2 — New order form, order modal, expected delivery
Entering a new order takes fewer steps, an order opens as a standard modal over the list, and the list shows when each truck is expected.
**Gated by:** none. It can ship before or after Phase 1; both touch `orderListColumns.tsx`, so build them one after the other.

**What it does today:**
- **New Purchase Order** (`frontend/src/components/inventory/CreatePurchaseOrderDialog.tsx`) asks for Vendor first, then Order Number, Ordered Date and Expected Delivery. Retail Value sits on its own row.
- The cost fields take a plain number only. Pasting strips everything but digits and the point.
- **Create** and **Create & Open** are both submit buttons, and both go to the order's full page.
- An order opens as a full page, `/inventory/orders/:id` (`OrderDetailPage.tsx`, up to 1,400 px wide). The house rule in `extended/inventory-search.md` lists the order as a full page.
- The Status column shows the badge and, for orders not yet delivered, the receive (truck) button. It does not show the expected delivery date, although the list already returns it.

Acceptance:
- [x] **Order opens as a modal.** Clicking an order on the list, or any order link, opens it in the standard object modal (`components/objects/ObjectModal.tsx`, a new `order` type next to product / check-in / item). The modal is the size the order view is today, not the 1,200 px `lg` used for the others. The house rules hold: there is a close X, and a link inside swaps the content with a Back arrow instead of opening a second modal. Everything the order page does today still works inside it.
- [x] `/inventory/orders/:id` still works for bookmarks and links from other pages: it opens the Orders list with that order's modal open. `extended/inventory-search.md` moves the order from Full page to Modal.
- [x] **New order, top row:** Order Number first. Vendor sits to its right, narrower. Typing the order number fills the vendor from its first segment, before the first `-`: first the vendor most earlier orders with that prefix belong to, then a vendor whose code matches. The vendor can still be changed by hand.
- [x] **Dates:** Ordered Date and Paid Date. Expected Delivery is no longer on the new-order form; it can still be set on the order.
- [x] **Retail** sits on the Description row: Description takes two parts of the width, Retail one.
- [x] **`x+y` in money fields:** Purchase Cost, Fees and Shipping (and Retail, for the same reason) accept sums such as `412.50+38`. The value is split on `+`, each part is read as a number, and the parts are added. The field shows the sum when you leave it, and Total Cost uses it as you type. Pasting keeps the `+`. A part that is not a number shows an error and blocks Create.
- [x] **Buttons:** **Create** creates the order and stays on the list: the dialog closes, the list refreshes and a message names the new order. **Create & Open** creates the order and opens its modal. Enter means Create.
- [x] **Expected delivery on the list:** when an order has an expected delivery date, a short line under the status badge and truck shows it (for example `EXP · Oct 8`), lined up neatly in the 64 px row.
- [x] Tests: the `x+y` parsing (sums, spaces, `$` and commas, a bad part), the vendor guess from a prefix, and that Create does not navigate while Create & Open does.

### Phase 3 — One Target vendor
Every Target order, template and product reference belongs to `TRGET`, and the old `TGT` vendor is deleted.
**Gated by:** none. It is a production data change, so it goes through a Request that the owner approves in Dash → Requests.

**What is known:**
- Migration `0018_merge_tgt_into_trget` already moved purchase orders, CSV templates and vendor product refs from `TGT` to `TRGET` once. It kept `TGT` as an inactive vendor.
- `apps/inventory/management/commands/backfill_phase1_vendors_pos.py` still maps the legacy prefix `TGT` to a vendor `TGT` (`V1_PREFIX_TO_VENDOR`), so a later backfill put old Target orders back under `TGT`.
- In the code today, three tables point at a vendor: `PurchaseOrder.vendor`, `CSVTemplate.vendor` and `VendorProductRef.vendor`. All three are `CASCADE`, so deleting `TGT` before its rows move would delete those orders. If Phase 5 ships first, `CSVTemplate` is already gone and only two tables are left to move.

Acceptance:
- [ ] A read-only count on production shows what points at `TGT` today in every table with a vendor key, plus the order caches (`vendor_code_cache`, `vendor_name_cache`). The counts are written in the Record.
- [ ] One Request, staged with `stage_request` and approved by the owner, moves every row to `TRGET`. Vendor product refs that clash on vendor item number are merged: times seen are added, and the newest cost and date are kept. Order caches and search text are refreshed. The Request records the old vendor of every moved row so it can be undone.
- [ ] `TGT` is deleted only after a re-count shows nothing points at it. The Request checks this itself and stops if anything is left.
- [x] `backfill_phase1_vendors_pos.py` maps the legacy `TGT` prefix to `TRGET`, so no re-run can bring `TGT` back. A test covers it.
- [ ] After the Request, the Vendors list shows one Target (`TRGET`), every Target order lists it as the vendor, and the new-order vendor guess picks it for Target order numbers.

### Phase 4 — Dispute refunds off cost
A refund from the vendor on a dispute is recorded, and the Orders page Total cost and recovery come down by it.
**Gated by:** Phase 1.
Detail when Phase 1 is built. (`Dispute` has no refund amount today.)

### Phase 5 — Preprocessing: AI formulas, no templates
As soon as a manifest is uploaded, the AI picks the formulas for step 1, so they are ready when someone opens Preprocessing. Manifest templates are removed everywhere.
**Gated by:** none.

**What it does today** (`frontend/src/pages/inventory/PreprocessingPage.tsx`, `components/inventory/preprocessing/TemplateSelector.tsx`, `apps/inventory/views.py` `suggest_formulas`):
- The templates do not work (owner, 2026-10-02).
- On upload, the manifest's headers are hashed and matched against saved `CSVTemplate` rows for the vendor. Step 1 shows a template picker, and when the formulas differ from the template it asks for a name and saves them as a new template on Standardize (`save_template`, `save_template_as_new`).
- The AI runs only when someone clicks **Use AI** (`POST orders/<id>/suggest-formulas/`). It sends the headers, the first 10 sample rows and up to three of the vendor's templates. **Clear Formulas** empties every formula.
- The AI's model and effort already come from Settings → AI, purpose **Preprocessing suggest** (`PREPROCESSING_SUGGEST`, `apps/core/ai_config.py`).
- `PurchaseOrder` carries a `template` key plus three caches (`template_name_cache`, `template_header_signature_cache`, `template_column_mappings_cache`). Migration `0033` seeds a Target "basic" template. Won → PO in Buying keeps the header order so the template auto-match still works (`apps/buying/services/won_to_po.py`).

Acceptance:
- [ ] **Runs on upload.** Every way a manifest reaches an order starts one background AI job: upload on the order, won → PO from Buying, and the intake test reset. The upload does not wait for it. The job stores the formulas, the model used and the time on the order, and a new upload runs it again. A failed call is retried; the job uses the same pattern as the AI cleanup job (it survives a process restart).
- [ ] **Setting.** The job uses the model and effort set for **Preprocessing suggest** in Settings → AI. Nothing about the model is hard-coded.
- [ ] **Step 1 shows only this:**
  - At the top, each standard field with the AI's formula and its result on the sample rows.
  - Below, the raw columns (header and sample values) and the formula preview. One field's formula can still be fixed by hand there.
  - While the job is still running, the step says the AI is choosing formulas. If it still fails after its retries, the step says so plainly and fills in the built-in column-name guesses (the default alias mappings), so Standardize is never blocked.
- [ ] **Removed from the screen:** the template picker, the new-template name box, **Clear Formulas** and **Use AI**.
- [ ] **Removed from the code:**
  - The `CSVTemplate` model, its `templates/` endpoint and admin.
  - `PurchaseOrder.template` and the three template caches. A migration drops them; the deploy takes its usual backup first.
  - The header-signature template match and `save_template` / `save_template_as_new` / `template_id` on standardize.
  - The prior-template hints in the AI prompt, and the seeded Target template.
  - Every other template reference: `intake_undo`, `manifest_remove`, `intake_test_reset`, `processing_ops`, serializers, `bucket_csv_seed_payloads`, the template note in `won_to_po`, `TemplateSelector`, `getTemplate`, and the front-end types.
  - Old migrations stay as they are.
- [ ] Tests:
  - The job starts on each upload path.
  - The stored result reaches step 1.
  - The fallback works when the AI fails.
  - Standardize works with no template fields.
  - No test still refers to a template.
  - `test_preprocessing_redesign.py` is updated.
- [ ] Checked on one real manifest per main vendor (Amazon, Target, Walmart): the AI's formulas give a correct title, quantity and unit retail on the sample rows. Results go in the Record.
- [ ] `extended/inventory-pipeline.md`: § CSV Template System is replaced by the AI formula job.

### Phase 6 — Vendor metrics
The Vendors list and each vendor's page show how that vendor performs: how much was bought, at what share of retail, how true its manifests are, what we price at, and how it sells.
**Gated by:** Phase 1 (it rolls up Phase 1's order numbers). Ship it after Phase 3, so Target is one row and not two.

**What it does today** (`frontend/src/pages/inventory/VendorListPage.tsx`, `VendorDetailPage.tsx`, `VendorSerializer`):
- The list shows Name, Code, Type, Contact, Phone and Status. There are no numbers.
- The vendor page has a Details tab (the edit form) and a Purchase Orders tab (order #, status, ordered, expected, cost).

**The metrics (picked by Claude at the owner's request, 2026-10-02).**

Every percent is weighted: the sum of the top ÷ the sum of the bottom across the vendor's orders, not an average of per-order percents. Each uses Phase 1's definitions.

| Metric | Definition | Why it helps |
|---|---|---|
| **Orders** | Number of orders, with the last order date under it. | How much we use this vendor, and how lately. |
| **Spent** | Sum of Total cost. | Where the money goes. |
| **Landed % of retail** | Total cost ÷ manifest total retail. | The buying rule: about 20% landed is normal. This shows who comes in above or below it. |
| **Priced % of retail (starting)** | Priced (starting) ÷ processor-approved retail (`Item.retail`) of the checked-in items. | What we normally price this vendor's goods at. The owner asked for this one. |
| **Manifest accuracy** | Processor-approved retail of everything checked in ÷ manifest total. | Near 100% means the vendor's manifests can be trusted. Low means short loads or inflated retail. |
| **Received from manifest** | Retail processed from the manifest ÷ manifest total. | How much of what was listed actually arrived in usable shape. |
| **Disputes** | Disputes opened, the number still open, and the disputed share of manifest retail. | Which vendors cause the most trouble. |
| **Recovery expected / actual** | Priced (starting) ÷ Total cost, and Sold ÷ Total cost. | Whether a vendor earns back its cost, on paper and in fact. |
| **% sold** | Sold ÷ Priced (starting). | Sell-through in dollars. |
| **Kept of starting price** | Net sold ÷ the starting price of the items that sold. | How deep the markdowns run before this vendor's goods sell. |
| **Days to sell** | Median days from check-in to sale, sold items only. | How fast its goods move. |
| **Per item** | Average cost, average starting price and average sold price per item. | What a typical item from this vendor is worth. |
| **Profit so far** | Sold − Total cost. | The bottom line. |

Acceptance:
- [x] **List.** The Vendors list shows Orders (last order date under it), Spent, Landed % of retail, Priced % of retail (starting), Manifest accuracy, % sold, Recovery actual and Days to sell. Each column sorts. Contact and phone move to a second line under the name, so the row fits.
- [x] **Vendor page.** It opens with summary cards for every metric in the table, in the same style as the Orders page cards. Its Purchase Orders tab uses the Orders page columns from Phase 1.
- [x] **Period.** A period choice applies to the list and the page: Last 90 days, Last 12 months (the default) or All time, by ordered date. Orders from the older data eras (`extended/data-quality.md`) are counted and flagged, not dropped.
- [x] Missing data shows `-`, not `0`: a vendor with no checked-in items, or no sales yet.
- [x] Speed: the list loads in about 2 seconds for every vendor over All time. It uses grouped queries, not one Phase 1 call per order. If that is not enough, a nightly table holds the numbers and the page shows its date.
- [x] Tests cover each definition on a small two-vendor fixture, the weighting, and the period filter.
- [x] Hand check: Target's numbers for the last 12 months match a sum of its orders on the Orders page.
- [x] `extended/inventory-pipeline.md` lists the vendor metrics and their definitions.

### Phase 7 — Next intake screen
The next intake screen gets the same care. The owner names which one once Phase 1 is in production: Receiving or Processing.
**Gated by:** Phase 1.
Detail when Phase 1 is built.

---

## Acceptance

- [ ] Phase 1: the Orders page columns and summary cards show the owner's definitions, tested, hand-checked on three orders, and shipped on their own.
- [ ] Phase 2: the new-order form, the order modal and expected delivery on the list work as above, tested and shipped on their own.
- [ ] Phase 3: `TGT` is gone in production, everything it held is under `TRGET`, and the backfill cannot bring it back.
- [ ] Phase 5: the AI's formulas are waiting on step 1 after every upload, and no template is left in the screen or the code.
- [ ] Phase 6: the Vendors list and vendor page show the metrics above, fast, for the chosen period.
- [ ] Out-of-scope items stay out

---

## Record

**2026-10-02 — Opened.** In one session the owner:

- set the Orders page definitions for Cost, Retail, Priced and Sold, after the numbers there stopped making sense (Phase 1);
- asked for the order as a standard modal, a faster New Purchase Order and expected delivery on the list (Phase 2), and one Target vendor (Phase 3);
- said Preprocessing templates do not work, so the AI picks the formulas on upload and templates go (Phase 5);
- asked for vendor metrics, naming the number of orders and the usual starting-price % of retail, and left the rest to Claude (Phase 6).

The owner's "eventually minus dispute refunds" became Phase 4. Claude made these calls; the owner can change any of them:

- Retail also takes `x+y`.
- The vendor guess learns from earlier orders' prefixes.
- A failed AI run falls back to the built-in column guesses.
- One formula can still be fixed by hand.
- Buying's own manifest templates stay.
- The vendor metric list itself.

Nothing is built yet.

**2026-10-02 — Phase 1 built.** The Orders page shows the owner's definitions (`purchase_order_financials.py`, columns and
summary cards; labels spelled out, the reasons in tooltips). Hand check on the dev copy (pulled 2026-10-02), every number
recomputed a second, simpler way, all equal:

| Order | Kind | Manifest | Processed | Priced (starting) | Approved retail | Unsold left | Sold | Flags |
|---|---|---|---|---|---|---|---|---|
| 381 `TRGET-OGG-9L2P` | clean | $5,027.17 | $4,960.17 | $2,549.45 | $4,960.17 | $1,673.59 | $874.95 | none |
| 322 `TRGET-OL9-8K83` | with a dispute | $54,303.46 | $52,025.27 | $28,772.36 | $54,850.97 | $9,164.23 | $17,001.03 | none |
| 3 `AMZ11175` | with extras (old era) | $6,719.54 | $0.00 | $6,618.70 | $7,398.89 | $0.00 | $2,576.80 | no price history |

Order 3's items were never linked to manifest rows (old era), so nothing counts as processed from the manifest. Over all
351 orders: 45 have no manifest, 17 differ from their listing retail by more than 2%, 305 have no price history.

**2026-10-02 — Phase 2 built.** An order opens in the object modal (`order` type, 1,400 px). `/inventory/orders/:id`
is the Orders list with that modal open; links with `?drawer=timeline&undo=…` still open the intake drawer. The vendor guess
is `services/order_vendor_guess.py` (`GET orders/vendor-guess/`). Claude's calls:

- A Paid Date on the new-order form marks the order paid, the same as Mark paid.
- The `EXP` line shows whenever an order has an expected date, delivered or not, as written.
- Closing the modal replaces the history entry, so Back after closing does not reopen it.

Checked on the dev copy: `TRGET-…` guessed Target; `412.50+38` showed $450.50; Enter created and stayed on the list;
Create & Open opened the modal. The two test orders were deleted.

**2026-10-02 — Phase 3 code built.** Request kind `inventory.merge_vendor` (`services/vendor_merge.py`) finds the tables
from `Vendor`'s own relations (today `PurchaseOrder`, `CSVTemplate`, `VendorProductRef`), so nothing is missed. The
backfill maps `TGT` to `TRGET`. The production count could not be run from Claude's session (the read was blocked);
the Request's preview shows the same counts in Dash. Waiting on: staging in production and the owner's approval.

**2026-10-02 — Phase 6 built.** Vendor metrics (`services/vendor_metrics.py`) on the Vendors list (period choice, sortable
columns, contact under the name) and the vendor page (a card per metric, then the Orders page columns). Speed on the dev
copy: 12 months 1.6 s, all time 5.9 s, so the list is cached six hours and shows when it was worked out, with Refresh;
`warm_vendor_metrics` can run nightly in Heroku Scheduler. Hand check, Target last 12 months (24 orders), against the Orders
page summary for the same orders: spent $143,119.14, manifest $796,516.30, priced $325,383.89, sold $160,015.53, recovery
227% / 112%, sold 49%, received 39%, accuracy 81%, all equal. Until the Phase 3 Request runs, `TGT` shows as its own row.

---

## See also

- Index: [`_index.md`](./_index.md)
- Pipeline: [`extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- Modals and the house container rule: [`extended/inventory-search.md`](../extended/inventory-search.md)
- Data rules: [`extended/data-quality.md`](../extended/data-quality.md)
- Earlier intake work: [`_archived/intake_processing_improvements.md`](_archived/intake_processing_improvements.md)
