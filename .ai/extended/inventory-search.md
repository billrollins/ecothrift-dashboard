<!-- Last updated: 2026-10-02 -->
# Inventory search and the standard object views

Owner, 2026-10-02: one fast search for everything in inventory, and one standard way to open a product, a check-in
or an item anywhere on the site. It replaced the old Catalog page (`/inventory/workbench`, which now redirects).

## The page (`/inventory/search`)

- One box, one table, **one row per product**: on shelf, price range, sold, average sold price, days to sell, last
  sold. Click a row for its items (SKU, status, price, condition, location, check-in, order, dates).
- On the shelf only by default; **Include sold** searches everything we have had (price research).
- A typed or scanned SKU jumps to that item's product and opens its items.
- Nothing found: the closest products by spelling are shown ("Nothing matched exactly").
- In the items list: click a price to change it (then "Reprint tag" in the confirmation), the printer icon reprints
  a tag, the plus icon on a product adds more of it (a new check-in).
- Page state is in the URL: `q`, `sold`, `page`, `open=<product|checkin|item>:<id>`.

## Speed (target: under a second; measured 15 to 360 ms on a copy of production, 2026-10-02)

- `Product.search_text`: one lowercased line per product, built from the product (title, brand, model, product
  number, UPC) and its standard (title, tag name, brand, model, category, subcategory, aliases). GIN trigram index
  `inv_product_search_trgm`. Every word of the query must appear in it.
- Numbers are computed only for the 50 products on the page; items load only when a row is opened.
- Kept current by: a save of the product or its profile (`apps/inventory/signals.py`), the bulk loaders
  (`standard_load.load_standard`, `product_profile.apply_proposals`), and `python manage.py rebuild_product_search`.
- Code: `apps/inventory/services/inventory_search.py`, `api_inventory_search.py`
  (`GET /api/inventory/search/`, `GET /api/inventory/search/items/`), tests `test_inventory_search.py`.

## Which container for what (the house rule)

| Tool | Use it for | Here |
|---|---|---|
| Modal | Look, do one quick thing, done | Item, check-in, product quick look; add items |
| Full page | Room to do a lot | Product (`/inventory/products/:id`), order |
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
