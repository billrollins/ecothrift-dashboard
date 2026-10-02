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

## Phases

1. **Built 2026-10-02:** the search page, the three modals, the product page, price edit in place, reprint, add items.
2. Bulk price change (set, percent off, round; managers and the owner only) with a preview and a progress drawer;
   "similar products" by vector when text finds little.
3. Id links across the rest of the site; orders and manifests get the same standard view; remove the old page's code.
