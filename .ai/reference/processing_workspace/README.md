<!-- Last updated: 2026-06-08 (spreadsheet-first production direction) -->

# Processing Workspace Reference

Historical design reference for the Processing workspace redesign.

## Baseline Mockup

- [`../processing mockup.html`](../processing%20mockup.html) - external consultant reference for layout/IA only. Colors, nav, and static demo data are not production direction.

## Current Direction

- Production `/inventory/processing/:id` is the source of truth.
- Spreadsheet-first is the selected direction: one order row, full-width stats, quick-switch tabs, dense queue table, and independently scrolling workspace regions.
- Temporary HTML variants and the React design lab have been removed.

## Implementation Surface

Implementation lives in `frontend/src/pages/inventory/processing/`.
