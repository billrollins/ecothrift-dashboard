# Manifest preprocessing formulas — what you can express

CSV template **formula** strings are evaluated on the server (`apps/inventory/formula_engine.py`) when manifests are standardized. The Preprocessing Step 1 **Sample Result** and **Formula Preview** use a TypeScript port (`frontend/src/components/inventory/preprocessing/formula_engine.ts`) that is intended to match the same grammar and behavior.

This document describes **what the engine allows today**, not what the AI suggest prompt might mention elsewhere.

---

## Fields (standard manifest targets)

Preprocessing maps each row into **standard fields** defined in `MANIFEST_STANDARD_COLUMNS` (`apps/inventory/views.py`). Formulas only read **raw** CSV headers. **`description`** below appears in both **Super important** and **Common 1→1**: it blocks standardize when empty and normally maps from a single text column.

*Coverage:* every key in `MANIFEST_STANDARD_COLUMNS` appears in exactly one grouping below (**Common 1→1** ∪ **Super important** ∪ **The rest**); `description` is intentionally duplicated across **Super important** and **Common 1→1** because it satisfies both notions.

---

### Super important

Fields that anchor **identity / how you merchandise and reconcile** rows (seller copy, taxonomy string, marketplace line id)—even when other cells are messy.

| Key | Label (UI) | Role |
| --- | --- | --- |
| `description` | Description | Primary line prose; required for standardize; usually one source column (`Item Description`, etc.). |
| `title` | Title | Shelf/listing-ready short name—often sparse on raw CSVs until cleanup or richer formulas. |
| `category` | Category | Manifest category / department string (seller taxonomy)—drives grouping and downstream category work even if not your POS taxonomy verbatim. |
| `vendor_item_number` | Vendor Item # | Stable vendor/marketplace id per line (`ASIN`, `Item #`, `SKU`, …)—matching, receipts, refs. |

*Product note:* Step 1 still requires a **`retail_value`** (unit retail) formula before standardize (`PreprocessingPage`); here it is grouped under **Common 1→1** rather than duplicated under Important.

---

### Common 1→1

Typically **one raw column → one standard field**, sometimes with trivial wraps (`TRIM`, `TITLE` only—not multi-column logic).

| Key | Label (UI) | Typical raw column ideas |
| --- | --- | --- |
| `quantity` | Quantity | `Qty`, `Quantity`, `Units`, … |
| `description` | Description | `Item Description`, `Description`, `Product`, … |
| `brand` | Brand | `Brand`, `Manufacturer`, or supplier `Vendor` on some Costco-style files |
| `model` | Model | `Model`, `Model Number`, … — often populated when the manifest includes it |
| `retail_value` | Unit retail (MSRP) | `Unit Retail`, `MSRP`, … — prefer **unit** stated retail vs extended line totals when both exist |
| `upc` | UPC | `UPC`, `UPC/EAN`, `Barcode` — may still be blank on some loads |

---

### The rest

Still useful defaults, but commonly **formula-heavy**, vendor-coded, or ancillary.

| Key | Label (UI) | Notes |
| --- | --- | --- |
| `condition` | Condition | One column on many manifests, but **`USED_GOOD`**-style enums and semantics vary by marketplace. |
| `notes` | Notes | Usually **constructed** (`CONCAT` of lot / LPN / pallet / location / rollups)—rarely a single raw field. |

---

## Column references

- **Syntax:** `[Exact Header Name]`
- The name inside brackets must match a **CSV column header string** exactly (spacing and casing matter), because values are read from each row dict with that key.
- Missing columns evaluate to an empty string.

**Examples**

- `[Qty]`
- `[Item Description]`
- `[Unit Retail]`

---

## String literals

- **Syntax:** `"..."`
- Escape inside literals: `\"` for a quote, `\\` for a backslash (same escaping rules as the Python tokenizer).

**Example**

- `CONCAT("Lot: ", [Lot ID], " | Pallet: ", [Pallet ID])`

---

## Concatenation

- **Operator:** `+` (only binary string concatenation; there is no numeric `+`).
- **Associativity:** Chains of `+` are left-associative: `a + b + c` means `(a + b) + c`.
- Operands can be literals, column refs, function calls, or parenthesized sub-expressions.

**Examples**

- `[Brand] + " — " + [Model]`
- `TRIM([Brand]) + " " + TRIM([Model])`

---

## Grouping

- **Parentheses** `( ... )` override evaluation order for concatenation and for building complex function arguments.

**Example**

- `(TITLE([Brand]) + " ") + TITLE([Product Class])`

---

## Integer literals

- **Syntax:** Bare digits `\d+` (non-negative integers only). No decimals, signs, or scientific notation in the lexer.
- Used mainly as the second argument to `LEFT` / `RIGHT`; they also concatenate as strings if combined with `+`.

---

## Built-in functions

All function names are **uppercase** as written below. Arguments are full sub-expressions (not only column refs).

| Function | Arguments | Meaning |
| --- | --- | --- |
| `TRIM` | `(expr)` | Strip leading/trailing whitespace (`str.strip()` / `.trim()`). |
| `UPPER` | `(expr)` | Uppercase entire string. |
| `LOWER` | `(expr)` | Lowercase entire string. |
| `TITLE` | `(expr)` | Title-style casing: server uses Python `str.title()`; preview uses an ASCII-ish word capitalization that **may differ slightly** from Python for edge cases. |
| `REPLACE` | `(expr, find, replace)` | **Literal substring** replacement only (same as Python/JS single-pass `replace`), not regex. Each of the three arguments is a full expression. |
| `CONCAT` | `(expr1, expr2, ...)` | At least one argument; joins all argument results as strings (empty variadic not allowed). |
| `LEFT` | `(expr, n)` | First `n` characters of `expr`; `n` must evaluate to an integer string. |
| `RIGHT` | `(expr, n)` | Last `n` characters; if `n <= 0`, result is `""`. |

**`REPLACE` notes**

- To replace a double quote inside a find/replace string, use a string literal: e.g. `REPLACE([Name], "\"", "")`.
- Global “replace all” is not a separate mode; behavior is whatever the language’s `replace` does for non-overlapping occurrences of the **find** substring.

---

## Nesting

You can nest calls arbitrarily as long as parentheses and commas stay balanced, e.g.:

- `TRIM(CONCAT(UPPER([Brand]), " ", LOWER([Category])))`
- `LEFT(REPLACE([UPC], " ", ""), 12)`

---

## What you **cannot** do (today)

- **No arithmetic** on numeric-looking cells (no `*`, `/`, `-`, numeric `+`, rounding, or unit math).
- **No conditionals** (`IF`, ternary, etc.).
- **No regex** or pattern-based replace (only `REPLACE` literal substrings).
- **No other functions** (no `SUBSTITUTE` with index, `LEN`, `MID`, `SPLIT`, date parsing, etc.) unless the engine is extended.
- **No single-quoted strings** — only double-quoted literals.
- **No referencing another standard field’s output** — formulas only read **raw** CSV columns for the same row.
- **No row index or cross-row logic.**

Invalid syntax or unknown tokens raise **`FormulaError`** on the server; the UI preview returns a safe error object.

---

## Implementation pointers

| Layer | Path |
| --- | --- |
| Server evaluator | `apps/inventory/formula_engine.py` |
| Client preview (mirrored grammar) | `frontend/src/components/inventory/preprocessing/formula_engine.ts` |
| AI suggest prompt (may list similar ops) | `PurchaseOrderViewSet.suggest_formulas` in `apps/inventory/views.py` |

When adding new capabilities, update **both** Python and TypeScript parsers/evaluators and extend the suggest-formulas system prompt so model output stays valid.
