<!-- initiative: slug=universal-object-surfaces status=active updated=2026-08-21 -->
<!-- Last updated: 2026-08-21 (design only) -->

# Initiative: Universal object surfaces

**Status:** **Active** — Design only. No code is scheduled. The item notes ledger shipped under [`finalize_tars_app`](./_archived/_completed/finalize_tars_app.md); this file records the larger object-surface idea so it does not get reinvented inside TARS.

**Objective:** One permissioned way to open any inventory object from any screen — a chip that always opens the same tabbed surface — instead of a new drawer, dialog, or permission check for each desk.

**Compass:** TARS stays the compass. This initiative does not take over [`.ai/context.md`](../context.md).

---

## Finish line

A staff member can click a SKU, a product, a check-in, a PO, a manifest row, or a restoration job and land on one surface that shows every facet they are allowed to see, with writes gated by capability rather than “is staff.” The notes trail is one tab of the item surface, not a one-off widget.

This file is not that finish line. It is the design we will build from when we pick it up.

---

## Why this is not built yet

Today every inventory viewset is `[IsAuthenticated, IsStaff]`. Role is a Django group name (`Admin` / `Manager` / `Employee`…) in [`apps/accounts/models.py`](../../apps/accounts/models.py). There are eight `has_permission` classes and **no** `has_object_permission` anywhere. There is no field-level read/write. A universal modal without that layer would either leak or lie.

The notes ledger is the first durable item-scoped history. It is not the object surface.

---

## Facets of an Item

An item is not one form. It is several objects that happen to share a SKU:

| Facet | What it is | Lives on |
|-------|------------|----------|
| Identity / product | Title, brand, identifiers, category | `Product` + `Item` |
| Lineage | PO → manifest row → check-in → `parent_item` | FKs on `Item` |
| Pricing | Retail, price, cost | `Item` |
| Status / location | Shelf, restoration, sold | `Item.status` / `location` |
| Notes trail | Append-only what people wrote | `ItemNote` |
| Restoration | Jobs and actions | `RestorationJob` (soft id on notes; the job row can die) |
| Item history | Status/price/location events | `ItemHistory` |
| POS / sale | Cart line, sold_at | POS |
| Web listing | Online sales listing | web store |

The item is the only durable spine. `RestorationJob` is `OneToOne` on `ItemCheckIn`; `Item.check_in` is a single mutable FK; split/combine **delete** jobs. An object surface that keys to the job loses history. Notes already learned this.

---

## The pattern

Each surface that mentions an object renders its own **summary**. The id is always a clickable `ObjectChip`. The chip opens one tabbed `ObjectSurface` modal. Closing it returns to the same place on the same screen. Nothing in the page flow grows.

```
ObjectChip (id + label)
        │
        ▼
ObjectSurface modal
  tabs declared by the object's descriptor
  each field: read scope + write scope
```

No new inline drawer per desk. The house badge-and-drawer pattern stays for standing conditions on a page; the object surface is for “open this thing.”

---

## Registry

A descriptor per object type, living in one registry (not scattered in page files):

| Object | Typical tabs (draft) |
|--------|----------------------|
| `product` | Identity, items, pricing |
| `item` | Identity, lineage, notes, restoration, history, sale |
| `check_in` | Snapshot, items, restoration job |
| `manifest_row` | Listing, matches, items |
| `purchase_order` | Header, rows, receiving |
| `restoration_job` | Queue card, actions, parts, timeline — knowing the job may be gone |

Each field on a tab carries `read` and `write` capability strings. The client hides or disables from `GET /api/auth/capabilities/`. The server enforces the same strings in the serializer. If they disagree, the server wins.

---

## Permissions, which do not exist yet

Design, not implementation:

- Capability strings such as `item.notes:write`, `item.price:write`, `restoration.job:read`.
- One `GET /api/auth/capabilities/` that returns the calling user's set.
- Serializers check write capabilities per field. Viewsets keep `[IsAuthenticated, IsStaff]` as the floor until object permissions land.
- `has_object_permission` is required before any surface can show another person's PII or another location's drawer.

Until that layer exists, the notes composer is staff-wide, matching every other inventory write.

---

## To be completed

These sections are deliberately empty. Do not invent them in a coding session.

### Capability taxonomy

Who can read vs write each facet. Manager vs Employee vs a future processor-only role. Not listed here.

### Descriptor schema

The TypeScript/Python shape of a descriptor (tabs, fields, capability keys, loaders). Not written.

### Per-object tab inventory

The real list of tabs and fields per object, walked against the live screens. The table above is a sketch.

### Migration path off the current bespoke drawers

`OverviewJobHistory`, item detail, check-in dialogs, POS lookup, Processing row detail. Which close, which become a chip, which stay because they are a task not an object. Not decided.

---

## Acceptance

- [x] Design recorded in this file
- [x] Active row on [`_index.md`](./_index.md) marked design-only
- [ ] Capability taxonomy written
- [ ] Descriptor schema written
- [ ] Per-object tab inventory written
- [ ] Migration path written
- [ ] No object-surface code until those four are accepted

---

## Record

**2026-08-21 — Design opened.** Written next to the item notes ledger so the chip-to-surface idea has a home. No code. TARS remains the compass.

---

## See also

- Notes ledger: [`finalize_tars_app`](./_archived/_completed/finalize_tars_app.md)
- Accounts roles: [`apps/accounts/models.py`](../../apps/accounts/models.py)
- Index: [`_index.md`](./_index.md)
