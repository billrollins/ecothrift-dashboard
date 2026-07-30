<!-- Last updated: 2026-07-30T18:50:00-05:00 -->
# Audit: API contract — frontend clients vs backend routes

Read-only cross-check of `frontend/src/api/webstore.api.ts`, `frontend-public/src/api.ts`, and `apps/webstore/urls.py` + view actions.

## Backend routes (canonical)

| Method | Path | View | Auth |
|--------|------|------|------|
| GET | `/api/webstore/catalog/` | `public_catalog` | AllowAny |
| GET | `/api/webstore/catalog/categories/` | `public_categories` | AllowAny |
| GET | `/api/webstore/catalog/<slug>/` | `public_listing_detail` | AllowAny |
| GET | `/api/webstore/images/<id>/` | `listing_image` | unauthenticated Django view |
| POST | `/api/webstore/checkout/` | `checkout` | AllowAny → always 410 |
| GET | `/api/webstore/order-status/<n>/` | `order_status` | AllowAny → always 410 |
| POST | `/api/webstore/holds/` | `request_hold` | AllowAny (flag-gated) |
| GET | `/api/webstore/holds/<token>/` | `hold_status` | AllowAny |
| GET | `/api/webstore/work-queue/` | `work_queue` | Manager+ |
| GET | `/api/webstore/sales-log/` | `sales_log` | Manager+ |
| * | `/api/webstore/listings/`… | `WebListingViewSet` | Manager+ |
| POST | `…/listings/{id}/publish/` | action | Manager+ |
| POST | `…/listings/{id}/pause/` | action | Manager+ |
| POST | `…/listings/{id}/archive/` | action | Manager+ |
| POST | `…/listings/{id}/restore/` | action | Manager+ |
| POST | `…/listings/{id}/generate-fb-copy/` | action | Manager+ |
| POST | `…/listings/{id}/mark-fb-posted/` | action | Manager+ |
| POST | `…/listings/{id}/images/` | `add_image` | Manager+ |
| POST | `…/listings/{id}/images/reorder/` | `reorder_images` | Manager+ |
| DELETE | `…/listings/{id}/images/{image_id}/` | `delete_image` | Manager+ |
| * | `/api/webstore/orders/`… | `OrderViewSet` | Manager+ (list/retrieve/patch only) |
| * | `/api/webstore/reservations/`… | `ReservationViewSet` | Manager+ |
| POST | `…/reservations/{id}/confirm\|stage\|decline\|cancel\|expire\|complete/` | actions | Manager+ |

## Staff client (`webstore.api.ts`) — mismatches

| Client function | Calls | Backend | Verdict |
|-----------------|-------|---------|---------|
| `setWebOrderStatus` | `POST …/orders/{id}/set-status/` | **No such action** | **BROKEN** — remove in A4 |
| `useSetWebOrderStatus` in `useWebStore.ts` | wraps above | same | **BROKEN** — remove with A4 |
| `getCategoryOptions` | `GET catalog/categories/` | exists | OK (public AllowAny used by staff) |
| All listing CRUD + publish/pause/archive/restore/FB/images | match | match | OK |
| `getReservations` / `reservationAction` / `updateReservation` | match | match | OK |
| `getWorkQueue` / `getSalesLog` | match | match | OK |
| `getWebOrders` / `getWebOrder` / `updateWebOrder` | match | match | OK (legacy) |

## Backend endpoints with no staff client caller

| Endpoint | Notes |
|----------|-------|
| `POST …/listings/{id}/images/reorder/` | Backend exists; **no frontend client function**. ListingStudio may reorder only client-side or not at all — verify in B2/page smoke. |
| `GET /api/webstore/config/` | **Does not exist yet** — A4 will add it. |
| Conversation/message endpoints | **Do not exist yet** — C1. |

## Public client (`frontend-public/src/api.ts`)

| Client | Calls | Verdict |
|--------|-------|---------|
| `fetchCatalog` / `fetchListing` / `fetchCategories` | catalog routes | OK |
| `requestHold` / `fetchHold` | holds routes | OK |
| `checkout` / `fetchOrder` | throw/reject locally | OK (stubs; backend also 410) |
| Blog helpers | `/api/blog/public` | OK (out of webstore scope) |
| Config / kill-switch fetch | missing | A4/B3 will add |

## Summary for Opus

1. Confirmed broken: `setWebOrderStatus` → nonexistent `set-status` action (also hooked in `useWebStore.ts` / `WebOrdersPage`).
2. Orphan backend: `images/reorder/` has no FE client.
3. Missing for kill switch: `GET /config/`.
4. No other phantom client→backend mismatches found in the two API modules.
