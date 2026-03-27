# Print server receipt fixtures

JSON files are `receipt_data` objects (same shape as `POST /print/receipt`). Use them with the local PNG renderer or the API.

## Header vs address (print + PNG)

- **Under the store name:** `store_phone` (labeled **Phone**), optional **`store_hours`** (labeled **Hours**, multi-line with `\n`). Do not put the street address here.
- **After the thank-you `footer`:** **`store_address`** only (street + city/state ZIP). Then the two policy lines from `RECEIPT_POLICY_LINES`.

## PNG layout (local preview)

- **`receipt_layout` `professional`:** thermal-style **grayscale** (black/white/gray): black **YOU SAVED** and **NO REFUNDS** bands with white type, no color accents.
- **`cool` / `emoji`:** color preview themes (teal/warm).
- Override layout from CLI: `--style professional`, `--style cool`, or `--style emoji`.

Structured PNGs use `render_receipt_to_image`: full-width logo (no separate pad strip), transaction block (monospace receipt # / date-time on `professional`), items, savings banner, totals, payment, footer, **Location** + address, then the policy card (headline + subhead + two policy sentences).

Windows print / `POST /print/receipt` use `format_receipt_text` / `format_receipt` with the same header/footer/address order.

## Render to PNG (batch)

From repo root (with venv activated), or use `printserver/dev_print_receipt_test.bat`:

```bat
python printserver\scripts\print_receipt_local_test.py --all-fixtures
```

PNG files are written to `printserver/output/`, named from each file’s stem (e.g. `receipt_var_01_minimal.png`).

Single file:

```bat
python printserver\scripts\print_receipt_local_test.py printserver\fixtures\receipt_var_01_minimal.json
```

```bat
python printserver\scripts\print_receipt_local_test.py --style cool printserver\fixtures\receipt_showcase_professional.json
```

## Fixture index

| File | Intent |
|------|--------|
| `receipt_showcase_professional.json` | Full Canfield-style data; `receipt_layout` professional (thermal grayscale PNG) |
| `receipt_showcase_cool.json` | Same payload; teal accent bar + color sectioning |
| `receipt_showcase_emoji.json` | Same payload; emoji labels + warm palette |
| `receipt_showcase_pro_no_you_saved.json` | Professional; omits `you_saved` (no savings banner) |
| `receipt_canfield_1.json` | Canfield sample — cash, `you_saved` |
| `receipt_canfield_2.json` | Canfield sample — card, smaller basket |
| `receipt_canfield_3.json` | Canfield sample — debit, furniture + $0 line |
| `receipt_var_01_minimal.json` | Sparse: name, one item, totals, payment only |
| `receipt_var_02_default_footer.json` | Omits `footer` (uses formatter default string) |
| `receipt_var_03_no_tax.json` | Explicit `tax: 0` — no Tax line |
| `receipt_var_04_tax_shown.json` | Non-zero tax |
| `receipt_var_05_no_you_saved.json` | No `you_saved` key (typical POS) |
| `receipt_var_06_cash_change.json` | Cash with change back |
| `receipt_var_07_card_exact.json` | Card, tendered = total, change 0 |
| `receipt_var_08_card_no_tender.json` | Card label only — no Tendered/Change |
| `receipt_var_09_qty_multiline.json` | `quantity > 1` item (two-line item block) |
| `receipt_var_10_zero_line.json` | `$0` line + normal line |
| `receipt_var_11_long_item_name.json` | Very long item name (PNG font scaling) |
| `receipt_var_12_many_items.json` | Many short lines (tall receipt) |
| `receipt_var_13_sparse_header_rich_meta.json` | No address/phone/time; long receipt # |
| `receipt_var_14_unicode.json` | Apostrophes, em dash, café; `store_address` only in tail |

Printed and PNG receipts end with two policy lines (final sale + as-is); the PNG adds a large monochrome (professional) or colored (cool/emoji) policy card with headline and subhead.
