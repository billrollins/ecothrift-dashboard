<!-- Last updated: 2026-04-16 (reference folder note) -->
# Plan: Print server — label design (V3) — **ARCHIVED**

**Closed 2026-03-26.** Shipped in print server **v1.2.x** (see `printserver/CHANGELOG.md`, `printserver/config.py` `VERSION`).

---

## Outcome

- **Layout:** “Concept C” **side stripe** — column 1 ≈ ⅓ width, top half black **price** (`$` / dollars with thousands / cents), bottom half **QR**; column 2 title + brand + **logo** (uniform contain in band). Presets **3×2** and **1.5×1** at **203 DPI**, same proportions.
- **Printing:** `printer_manager.send_image` — fit to printable rect, center X, top Y (thermal roll stability).
- **Code128** removed earlier; **QR + price** only on labels.
- **Reference:** Consultant **Consult Label** notes and sample PNGs lived under **`.ai/reference/`** (removed); **`printserver/services/label_printer.py`** and **`printserver/label_test_data.py`** are the in-repo source of truth.
- **Samples:** `printserver/label_test_data.py` (e.g. `$1.99`, `$25.00`, `$1,123.75`).

---

## Historical objectives (met)

1. Match **physical label stock** (presets, landscape, DPI).
2. Improve **scan reliability** and **readability**.
3. **Branding** (logo on GDI path).

---

## Implementation map (reference)

| Area | File(s) |
|------|---------|
| Presets + DPI | `printserver/config.py` — `LABEL_DPI`, `LABEL_SIZE_PRESETS` |
| Layout | `printserver/services/label_printer.py` — `generate_label` |
| GDI labels | `printserver/services/printer_manager.py` — `send_image` |
| API | `printserver/routers/labels.py`, `printserver/models.py` `LabelPrintRequest` |
| Dashboard | `frontend/src/services/localPrintService.ts`, Settings |

---

## Related (current)

- **AI context:** [`.ai/extended/print-server.md`](../../../extended/print-server.md)
- **Follow-on (completed):** [Print server — label price layout & fringe](./print_server_label_price_layout.md) (v1.2.35–v1.2.38)
- **Follow-on (pending):** [Print server — receipt format](../_pending/print_server_receipt_format.md)
