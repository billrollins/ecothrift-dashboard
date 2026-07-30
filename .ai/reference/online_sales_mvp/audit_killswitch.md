<!-- Last updated: 2026-07-30T18:50:00-05:00 -->
# Audit: `ONLINE_SALES_ENABLED` kill-switch completeness

Intent (initiative): flipping the flag **false** removes the entire customer surface — not only hold creation.

## Current behavior (`ONLINE_SALES_ENABLED` default **False**)

| Surface | Gated today? | Behavior when flag false |
|---------|--------------|--------------------------|
| `POST /api/webstore/holds/` | **Yes** | 410 `HOLDS_DISABLED` |
| `GET /api/webstore/holds/<token>/` | **No** | Still returns hold status if token known |
| `GET /api/webstore/catalog/` | **No** | Live; returns published listings (0 today) |
| `GET /api/webstore/catalog/<slug>/` | **No** | Live |
| `GET /api/webstore/catalog/categories/` | **No** | Live |
| `GET /api/webstore/images/<id>/` | **No** | Live (serves any listing image by id) |
| `POST checkout/` / `GET order-status/` | N/A | Always 410 regardless of flag |
| Staff `/api/webstore/listings/` etc. | **No** (by design) | Staff APIs remain for Manager+ |
| Staff SPA `/online-sales/*` | Hard redirect in `App.tsx` | Not settings-driven |
| Public SPA shop/hold routes | Hard redirect to `/visit` | Not settings-driven |
| Public Layout banner | Static "under construction" | Not settings-driven |

## Gaps vs intent

1. **Catalog stays live** while UI redirects — a client calling the API still sees listings when they exist.
2. **Image serving stays live** — enumerable by id (low risk today with 0 images).
3. **Hold status by token stays live** — arguably OK (customer already has a link); document as intentional or gate it.
4. **No `GET /config/`** for SPAs to ask the server — both SPAs hard-code park behavior instead of reading the flag.
5. Staff APIs correctly stay up when flag is false (listing work can continue offline from public).

## A4 / B3 target

- Add `GET /api/webstore/config/` → `{ online_sales_enabled: bool }`.
- Gate `public_catalog`, `public_listing_detail`, `public_categories` on the flag (empty / 404 / 410 — pick one and document; recommend **empty catalog + 404 detail** or **410 with code**).
- Optionally gate `listing_image` when the parent listing is not published or flag is off.
- Public SPA: fetch config; show shop only when enabled; banner when off.
- Staff SPA: routes always available to Manager+ (flag does not hide staff workspace).

## Summary for Opus

Kill switch today is **holds-only**. A4 must expand it to catalog (+ preferably images). Token status lookup is a product choice — default leave available so existing hold links still work during a temporary disable.
