<!-- Last updated: 2026-10-26 (spaces ignored: "barstool" finds "Bar Stool") -->
# Inventory search and the standard object views

Owner, 2026-10-02: one fast search for everything in inventory, and one standard way to open a product, a check-in
or an item anywhere on the site. It replaced the old Catalog page (`/inventory/workbench`, which now redirects).

## The page (`/inventory/search`)

- One box, one table, **one row per product**: on shelf, retail, price range, sold, average sold price, days to sell,
  last sold. Under the price and under the average sold price: its **percent of retail** (the pricing cue; owner,
  2026-10-02). The items list and Similar products show the same. Click a row for its items (SKU, status, price, condition, location, check-in, order, dates).
- On the shelf only by default; **Include sold** searches everything we have had (price research).
- A typed or scanned SKU jumps to that item's product and opens its items.
- Nothing found: the closest products by spelling are shown ("Nothing matched exactly").
- In the items list: click a price to change it (then "Reprint tag" in the confirmation), the printer icon reprints
  a tag, the plus icon on a product adds more of it (a new check-in).
- **Sort:** every column header sorts all the matches on the server (high to low first; A to Z for Product), blanks
  last. The header box ticks every product on the page with something on the shelf.
- Page state is in the URL: `q`, `sold`, `misfit`, `page`, `sort`, `open=<product|checkin|item>:<id>`.
- **Review's drill** (2026-10-26): `category` (taxonomy bucket, the same as Buying), `sub` (profile subcategory;
  `(none)` = none), `vendor` (order's vendor code; `(none)` = no order), `price_point` (tag price band) and `stale=1`
  (on the shelf longer than `inventory_review_stale_days`) keep products with one unit on the shelf matching them all (`inventory_review.product_ids_sql`). They show as chips with an x. [`inventory-review.md`](inventory-review.md)
- **Items one person put on the floor** (2026-10-22, from a Processing row in the Dashboard's details):
  `processed_by=<user id|none>&from=YYYY-MM-DD&to=YYYY-MM-DD` shows those items (SKU, product, status, day, price,
  retail; a list on a phone) instead of the search. "Search all inventory" goes back. Code:
  `pages/inventory/ProcessedItemsView.tsx`, `GET /api/pos/dashboard/processed-items/`.
- In the menu it is **Inventory > Search** (2026-10-02; with Run count, and PR Fix-it under a line). Bill calls it
  Find item.
- **Misfit only** (2026-10-22): items with no purchase order: source `misfit`, anything on a `MISFIT-*` order (so the
  V1 and V2 orphans count too), and PR Fix-it quick adds (source `misc` with no order). `services/misfit.py`
  (`misfit_items_q`, `is_misfit_item`); 7 to 81 ms on the local copy, no extra index needed. The items list shows a
  Misfit chip in the Order column, and **who** checked each item in beside the date.
- **Phone** (below `sm`): one card per product (name, brand, category; shelf, price, sold, retail), a Sort box
  instead of the column headers, and the items as short cards. The desk keeps the table.

## Add item: Misfit items (owner, 2026-10-22)

The **Add item** button on this page adds something we sell that came with no purchase order. It replaced the old
item list's Add item (removed in v2.202.0). A modal (full screen on a phone), built on Processing's parts:

1. **Find the product.** One box: a scanned tag, product number, barcode (UPC/EAN/GTIN, with or without leading
   zeros), part number or model answers first (Enter picks a single exact match, for scanners); then the words, on
   `Product.search_text` (trigram index; words under 3 letters are checked on the candidates). Ranking: words in what
   the product is ("Beater **for** KitchenAid Mixer" is a beater), the whole phrase, a name close to what was typed,
   the brand; then times sold and shelf count. Each row: photo, tag name, typical price (median sold, else median
   shelf), times sold, Use / Copy. Measured on the local copy of production (202k products): 8 to 96 ms. Vectors are
   not used for typed words (that needs the model on the web server); they are used for price comps.
2. **Not found: make the product.** *Copy* a near match and edit title, brand, model; or *AI fill*: a rough title and
   an optional photo (camera on a phone). The AI drafts title, tag name, brand, model, category and subcategory (the
   taxonomy's exact names: anything else is dropped) and a retail estimate; the person checks it. Through the AI
   router (purpose `SUGGEST_PRODUCT`, Settings > AI), logged in AIUsage as `inventory.add_item_ai`; the router now
   sends photos to xAI, Google and Spark too. The product is made at check-in (one transaction), or matched when the
   same UPC or title/brand/model/category exists. Profile fields keep their source (`human`, or `ai:<model>` when
   left as drafted); the photo is kept on the product (`Product.photo`, `photo_thumb`; 2048 px and 480 px).
3. **Check in.** Quantity, condition, where it goes (Floor, Back stock, Restoration = location `on_shelf`,
   `back_storage`, `restoration`), the price (`suggest_price`: the median this product sold for once it has 2 sales,
   else what similar products sold for, by stored vector when the product has one, else by title), the retail
   through the same retail check as Processing (an AI or copied retail is an estimate, so it is asked about).
   **Restoration needs the request** (2026-10-28): what it needs and the done price; the as-is prices fill in
   (`restoration.md`). It goes on the job and its queue note, then the usual Grade for Restoration dialog opens.
4. **Tags print** the Processing way. Items are on the year's Misfit order (`MISFIT-<year>`, vendor MIS, made on
   first use, no cost: item cost stays unknown), source `misfit`, with who and when.

Who: the same people as Processing check-in (staff). Code: `apps/inventory/services/add_item.py`, `misfit.py`,
`api_add_item.py` (`/api/inventory/add-item/find|price|taxonomy|ai-fill|check-in/`),
`frontend/src/pages/inventory/addItem/`; tests `test_add_item.py`, `addItemModel.test.ts`.

## Speed (target: under a second; measured 15 to 360 ms on a copy of production, 2026-10-02)

- `Product.search_text`: one lowercased line per product, built from the product (title, brand, model, product
  number, UPC) and its standard (title, tag name, brand, model, category, subcategory, aliases). GIN trigram index
  `inv_product_search_trgm`. Every word of the query must appear in it, **spaces ignored** (2026-10-26): a word
  matches the line with its spaces taken out, so "barstool" finds "Bar Stool" (`matching_words`, index
  `inv_product_search_nosp_trgm` on `replace(search_text, ' ', '')`; ~1-3 ms on 200k products, "toy" ~50 ms).
  Inventory search and Add item's find use it. Processing's product picker (ProductSearchAutocomplete, the products
  API's `search`) is a different matcher and does not.
- Numbers are computed only for the 50 products on the page; items load only when a row is opened.
- Kept current by: a save of the product or its profile (`apps/inventory/signals.py`), the bulk loaders
  (`standard_load.load_standard`, `product_profile.apply_proposals`), and `python manage.py rebuild_product_search`.
- Code: `apps/inventory/services/inventory_search.py`, `api_inventory_search.py`
  (`GET /api/inventory/search/`, `GET /api/inventory/search/items/`), tests `test_inventory_search.py`.

## Which container for what (the house rule)

| Tool | Use it for | Here |
|---|---|---|
| Modal | Look, do one quick thing, done | Item, check-in, product quick look; add items; order (wide, 1,400 px: `/inventory/orders/:id` opens the Orders list with it) |
| Full page | Room to do a lot | Product (`/inventory/products/:id`) |
| Tabs | Related views you flip between | Inside the product page: Product, Items, Check-ins |
| Drawer | Something running that you check on | Bulk progress, print queue (Phase 2) |
| Inline in the table | What you do 50 times a day | Change a price, reprint a tag |

A modal never opens a second modal: a link inside it swaps the content and shows a Back arrow.

## The standard object views (`frontend/src/components/objects/`)

- `ObjectModalProvider` wraps a page; `<ObjectLink type="product|checkin|item" id=... />` is the clickable id.
- The modal shows the existing edit panels (`ProductManagePanel`, `ItemCheckInManagePanel`, `ItemManagePanel`), so
  nothing the old page could do was lost.
- `ProductItemsTable` is the items list used under a search row and on the product page.

## Bulk work (Phase 2, built 2026-10-02)

- **Select:** a tick on a product row means every shelf item of that product; a tick on an item row means that item.
  A bar appears: Change price (managers and the owner), Reprint tags (staff), Clear.
- **Change price** (a dialog, because it is one quick decision): percent off, dollars off, or set a price; then
  optional rounding to .99 or to the dollar. The preview shows the count and the total before and after. Only items
  on the shelf change; no price goes below $0.50; at most 5,000 items at once.
- **Bulk work drawer** (a drawer, because you close it and reopen it to see how a job is doing): the tag print
  progress, and for managers the recent price changes, each with **Reprint tags** and **Undo**. Undo puts the old
  price back on every item that still holds the new one and is still on the shelf.
- **Record:** `BulkPriceChange` (who, the rule, each item's price before and after) plus a `price_change` history
  line per item. Code: `apps/inventory/services/bulk_price.py`, `api_bulk_price.py`,
  `frontend/src/components/objects/bulkTools.tsx`; tests `test_bulk_price.py`.
- **Similar products** (price research): a link under a product's items lists the closest products by meaning with
  the same numbers. It reads the stored vectors only (`inventory_search.similar`); no model is loaded on the web
  server.
- **Speed:** a partial index for "is anything of this product on the shelf" and one pass for the page and the
  count. Broad one-word searches went from about 330 ms to about 140 ms on a copy of production.

**Memory (measured 2026-10-02):** the embedding model takes about 200 MB per process once loaded. The web dyno was
Standard-1X (512 MB, two workers), too small for the intake switch `product_standard_at_intake` (vector matching at
cleanup, a vector at check-in). The owner moved it to **Standard-2X (1 GB)** on 2026-10-02 for that reason.

## Phases

1. **Built 2026-10-02:** the search page, the three modals, the product page, price edit in place, reprint, add items.
2. **Built 2026-10-02:** bulk price change with preview, undo and the Bulk work drawer; bulk tag reprint; similar
   products; faster broad searches.
3. Id links across the rest of the site; orders and manifests get the same standard view; remove the old page's code.
