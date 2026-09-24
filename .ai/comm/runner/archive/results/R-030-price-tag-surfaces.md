# R-030 result · Where names print today

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:46 · **Finished:** 2026-09-23 17:50

There is no `short_name` field yet. Every surface below reads `Product.title` or a copy of it. The price-tag template does not state a character count. It keeps the first 15 words (`printserver/services/label_printer.py:31` and `:285`) and wraps those into at most 2 bold lines plus 2 regular lines (`:32`, `:542`, `:559`). Font size starts at 28 (`:26`). A 28-character short name is inside that cap.

| Surface | File:line | Field | Cut | Notes |
|---|---|---|---|---|
| Price tag sent to the printer | `frontend/src/pages/inventory/processing/printProcessingLabel.ts:25` | `product_title`, else `title`, else `sku` | none here | `product_title` is `Product.title` (`apps/inventory/serializers.py:46`) |
| Price tag layout | `printserver/services/label_printer.py:542` | `product_title` | 15 words, then 2+2 wrapped lines | Pixel width of the right column, not a character limit |
| POS cart line | `apps/pos/views.py:709` | `item.product.title` stored on `CartLine.description` | 300 characters (`apps/pos/models.py:257`) | Manual lines are typed text, also capped at 300 (`views.py:817`) |
| Receipt | `frontend/src/utils/posReceipt.ts:22` | cart line `description` | wraps at 48 characters (`printserver/config.py:540`, used at `receipt_printer.py:452`) | Sale suffix is appended to the name |
| Processing screen | `frontend/src/pages/inventory/processing/ProcessingActiveCard.tsx:1471` | row bookmark `title`, else "Manifest line" | none found | Editor draft uses `product.title` at `:984` and `:1510` |
| Preprocessing | same processing UI; row title is the line title | bookmark / manifest title | none found | No separate `final_title` read in the processing pages |
| Online listing | `apps/webstore/models.py:53` | `Listing.title`, its own field | 200 characters | Not copied from `Product.title` in `apps/webstore` |
| Store report | `apps/inventory/views.py:8434` | `product.title` as `item_title` | none | Category breakdown uses manifest category, else product category (`:8422`), not the title |
| Item stats | `apps/inventory/views.py:7578` | `Product.title` as the block label | none | Counts only; it does not print a name per item |

## One change that switches a surface to `short_name`

- **Price tag:** `printProcessingLabel.ts:25`. The printer already shortens by words; this is the only place that chooses the string.
- **POS and the receipt:** `apps/pos/views.py:709` (and the same assignment at `:780`). The receipt only reprints `description`.
- **Processing screens:** `apps/inventory/serializers.py:46` (`product_title = product.title`). The active card and the check-in panels read that field.
- **Listings:** no single read of `Product.title`. A listing keeps its own `title`. Switching it means writing `short_name` when the listing is created, not a one-line read swap.
