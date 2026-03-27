<!-- Archived 2026-03-28: disposition=completed initiative=print_server_label_price_layout -->
<!-- Last updated: 2026-03-28T12:00:00-05:00 -->

# Print server — label price layout & fringe tooling — **ARCHIVED**

**Closed 2026-03-28.** Shipped in print server **v1.2.35–v1.2.38** (see `printserver/CHANGELOG.md`, `printserver/config.py` `VERSION`).

**Predecessor:** [`.ai/initiatives/_archived/_completed/print_server_label_design.md`](./print_server_label_design.md) (Concept C side stripe).

---

## Outcome

- **Price fit:** scale search **1.0 → 0.5** step **0.01** (`_PRICE_SCALE_STEPS`); optional `price_fit_stats` on `generate_label` (`first_fit_scale`, `used_fallback`).
- **Sub-dollar:** whole dollars **0** → **`$` + cents only** (no large middle `0`); `_draw_price_zero_whole_block`.
- **Typography:** smaller **`$`**, larger **dollar line** and **cents**; **`big_base`** ladder by dollar **digit count** (`nd`) so long comma-formatted amounts fit at **scale 1.0** on 1.5×1 / 3×2.
- **Dev:** [`printserver/scripts/label_price_fringe_grid.py`](../../../../printserver/scripts/label_price_fringe_grid.py) — default `--preset 1.5x1`; `--preset both` for full grid; output under `printserver/output_label_fringe_review/` (gitignored).

---

## Implementation map (reference)

| Area | File(s) |
|------|---------|
| Layout + fit | `printserver/services/label_printer.py` — `_draw_price_block`, `_draw_price_zero_whole_block`, `_whole_dollars_int` |
| Version | `printserver/config.py` |
| Fringe runner | `printserver/scripts/label_price_fringe_grid.py` |
| Extended context | `.ai/extended/print-server.md` |

---

## Related

- **AI context:** [`.ai/extended/print-server.md`](../../../extended/print-server.md)
- **Receipt follow-on (pending):** [`.ai/initiatives/_archived/_pending/print_server_receipt_format.md`](../_pending/print_server_receipt_format.md)
