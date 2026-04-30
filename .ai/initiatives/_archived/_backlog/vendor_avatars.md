<!-- Archived 2026-04-29: disposition=backlog (future work — not scheduled; user parked) -->
<!-- initiative: slug=vendor-avatars status=backlog updated=2026-04-29 -->
<!-- Last updated: 2026-04-29 -->
# Vendor avatars (upload + dashboard-wide display)

**Status:** **Backlog** — parked under [`.ai/initiatives/_archived/_backlog/`](./). No active session. When ready to implement, move to initiatives root per [`.ai/initiatives/_archived/_protocols/README.md`](../_protocols/README.md) (**`activate_initiative`**) and add a row to [`.ai/initiatives/_index.md`](../../_index.md).

---

## Objective

Let staff **upload a photo per vendor** that serves as a **visual avatar** (replacing or supplementing **initials / code chips**), and **surface that image consistently** anywhere the dashboard identifies a vendor (starting with the highest-traffic inventory surfaces).

---

## Current state (baseline)

- **`Vendor`** (`apps/inventory/models.py`) has text/contact fields only — **no image or file FK**.
- **`VendorSerializer`** (`apps/inventory/serializers.py`) uses `fields = '__all__'` — no avatar today.
- **`VendorViewSet`** (`apps/inventory/views.py`) — standard CRUD only.
- **Purchase order list** (`GET /api/inventory/orders/`) uses **`PurchaseOrderListSerializer`**: denormalized `vendor_name_cache` / `vendor_code_cache`; queryset for **list** does **not** `select_related('vendor')` (important if serializer reads live vendor fields — add joins to avoid N+1).
- **Frontend — initials-style vendor affordance today:** `frontend/src/pages/inventory/OrderListPage.tsx` — `Avatar` with `vendorInitials(row.vendor_name, row.vendor_code)` and `hueFromString`.
- **Vendor admin UI:** `VendorListPage.tsx`, `VendorDetailPage.tsx` — no avatar; create/edit is JSON fields only (`inventory.api.ts` / `useInventory.ts`).
- **Create PO dialog:** `CreatePurchaseOrderDialog.tsx` — `VendorSelect` shows a **code chip**, not initials; still a good place for `Avatar src={...}` when `Vendor` carries a URL.
- **Storage pattern in-repo:** `core.S3File` + `default_storage`; nested **`S3FileSerializer`** already used for PO `manifest_file`. Reference: `upload-manifest`, receiving photo uploads (`uploadReceivingPhoto` in `inventory.api.ts`).

---

## Proposed technical approach

### Backend

1. **Model** — On `Vendor`, add nullable FK, e.g.  
   `avatar = models.ForeignKey('core.S3File', null=True, blank=True, on_delete=models.SET_NULL)`  
   (or `PROTECT` if you always delete via a service that cleans storage first).

2. **Migration** — Standard schema migration; no data backfill required (null = fall back to initials in UI).

3. **Serializer** — Extend **`VendorSerializer`** with read-only nested avatar (`S3FileSerializer`) and/or a single **`avatar_url`** for lean clients. Keep writes explicit (multipart action or `avatar` id) so JSON PATCH does not accidentally clear blobs.

4. **Upload API** — Prefer **`@action(detail=True, methods=['post'], url_path='upload-avatar')`** on **`VendorViewSet`**: multipart file → validate type/size → write via **`default_storage`** → create **`S3File`** → assign **`vendor.avatar`** → delete previous **`S3File`** row + storage object when replacing (same hygiene as manifest upload). Optional **`DELETE`** on the same path to clear avatar.

5. **List endpoints that show vendor** — Add **`vendor_avatar_url`** (nullable) to **`PurchaseOrderListSerializer`** (and any sibling list serializers that should show the same chip, e.g. receiving list if desired). In **`PurchaseOrderViewSet.get_queryset()`**, for actions **`list`**, **`summary`**, **`for_receiving`**, add **`select_related('vendor', 'vendor__avatar')`** once the serializer reads from `vendor` for the URL (avoids N+1).

6. **Admin / ops** — Optional: `VendorAdmin` raw id or inline for `avatar`; ensure **`reset_business_data`** (or similar) respects FK order if it wipes **`S3File`**.

7. **Tests** — `apps/inventory/tests/`: upload happy path, auth, invalid MIME/size, replace deletes old key; list row includes `vendor_avatar_url` when set.

### Frontend

1. **Types** — `frontend/src/types/inventory.types.ts`: on **`Vendor`**, optional `avatar` / `avatar_url` (match API). On **`PurchaseOrderListRow`**, optional `vendor_avatar_url` (or nested shape — stay consistent with serializer).

2. **API + hooks** — `frontend/src/api/inventory.api.ts`: e.g. `uploadVendorAvatar(id, file)` with **`FormData`** (mirror `uploadManifest` headers). `useInventory.ts`: mutation + **`invalidateQueries`** for vendors, vendor detail, and purchase order list.

3. **UI (minimum viable)**  
   - **`VendorDetailPage.tsx`**: preview, file input, upload + optional remove, loading/error.  
   - **`OrderListPage.tsx`**: if `vendor_avatar_url`, `<Avatar src={url} />` with **`onError`** fallback to current initials + HSL styling.  
   - **`CreatePurchaseOrderDialog.tsx`**: replace or accompany code chip with avatar when URL exists.

4. **UI (rollout / polish)** — Optionally reuse the same small **`VendorAvatar`** component in order detail header, preprocessing subtitle, processing PO picker, receiving rows, item form PO autocomplete — **same fallback rules** (initials or code chip) everywhere.

### Product / constraints (decide at implementation time)

- Max upload size and allowed MIME types (e.g. jpeg/png/webp).
- Whether to **resize server-side** (recommended for predictable chips and storage).
- Browser must be able to load **`S3File.url`** in `<img>` (CORS / CSP already OK if manifest URLs work similarly).

---

## Acceptance (draft)

- [ ] Staff can upload, replace, and clear a vendor avatar; image persists and survives page reload.
- [ ] **`Vendor`** API responses expose enough for the UI to render **`Avatar src`** (URL or nested file object).
- [ ] **Purchase order dashboard** list shows photo when present, **initials fallback** when absent (no broken layout).
- [ ] **Create PO** vendor picker shows avatar when present.
- [ ] List/query plan: **no N+1** on PO list for avatar URLs.
- [ ] Tests cover upload + list field; **`CHANGELOG`** `[Unreleased]` updated when code ships.

---

## See also

- Inventory models / serializers / views: `apps/inventory/models.py`, `apps/inventory/serializers.py`, `apps/inventory/views.py`
- `core.S3File`: `apps/core/models.py`, `apps/core/serializers.py`
- Prior analysis (session 2026-04-29): initials live in `frontend/src/pages/inventory/OrderListPage.tsx` (`vendorInitials`, `hueFromString`).

---

## Sessions

_When this leaves backlog and work starts, add **`## Sessions`** blocks in the file at the initiatives root per [`.ai/protocols/startup.md`](../../../protocols/startup.md) step 8._
