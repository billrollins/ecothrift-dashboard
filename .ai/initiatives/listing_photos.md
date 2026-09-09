<!-- initiative: slug=listing_photos status=active updated=2026-09-09 -->
<!-- Last updated: 2026-09-09 (whole-picture default) -->

# Initiative: Listing photos

**Status:** **Active** — four photo slots, staff editor, public lightbox, autosave, Mark posted.

**Objective:** Listing Studio photos are framed for the shop surfaces that actually exist, stored as a full gallery image plus main / grid / thumb crops, and never wipe the rest of the listing while someone is writing copy.

**Compass:** this file is not the compass. Documents stays the compass: [`documents`](./documents.md).

---

## Finish line

A staff member drops or multi-selects photos and frames them on one screen. The whole picture is kept by default; **full** / **main** / **grid** / **thumb** chips crop only when they ask. Clicking the listing photo opens the full image in a lightbox. Listing copy autosaves. Pasting a Facebook posted URL marks the listing posted.

---

## Out of scope

- HEIC / RAW pipelines
- Role-based photo permissions
- Facebook Graph posting (URL tracking only)

---

## Acceptance

- [x] Full max-2048 + main 1600×1200 + grid 800×600 + thumb 400×400 on upload
- [x] Drag-drop / multi-select + single-screen editor (slot chips, live previews, one Apply)
- [x] Studio tiles show main / grid / thumb sizes; click opens full-res viewer
- [x] Public PDP main opens a full-resolution lightbox
- [x] Photo mutations do not wipe listing copy; autosave dirty fields
- [x] Mark posted auto-fires on Posted URL; posted vs not is visually distinct
- [x] `backfill_listing_image_variants --regenerate` for existing photos

---

## Record

**2026-09-08 — Opened.** Listing Studio raw uploads were uncropped and a refetch after upload wiped unsaved copy.

**2026-09-08 — Slots.** Replaced the single 1200×900 display file with main / grid / thumb variants and a public listing lightbox.

**2026-09-09 — Single-screen editor.** Replaced the three-step Next flow (dead Apply on the last step) with one crop box and Full / Main / Grid / Thumb chips.

**2026-09-09 — Shipped v2.91.0.** Acceptance complete. Stays Active until archived.

**2026-09-09 — Whole picture default.** Center 4:3 cover was chopping portrait product shots. Derived slots now letterbox the full image; the public shop uses the full file with contain.

---

## See also

- Domain: [`.ai/extended/backend.md`](../extended/backend.md) (webstore listing photos)
- Index: [`_index.md`](./_index.md)
