<!-- Last updated: 2026-07-13 -->
# POS terminal cart scroll — test pack

Manual QA pack for **cart line visibility / auto-scroll / viewport use** on `/pos/terminal`.

| File | Purpose |
|------|---------|
| [`testing_skus.md`](./testing_skus.md) | Copy-paste SKUs + scenarios |
| [`testing_skus.csv`](./testing_skus.csv) | Same SKUs as CSV (sku, price, title, status) |

## Seed (local)

```bat
venv\Scripts\python.exe manage.py seed_pos_terminal_test_items
venv\Scripts\python.exe manage.py seed_pos_terminal_test_items --reset
```

- Creates **`POSTEST01`…`POSTEST25`** (`on_shelf`) + **`POSTESTSOLD`** (`sold`).
- Idempotent. `--reset` returns on-shelf SKUs after a completed sale and strips them from open carts.
- DEBUG only unless `--force`.

## Prerequisites

1. Staff dashboard running (`scripts/dev/start_dashboard.bat`).
2. Device setup → register (e.g. `REG-01`).
3. Open a drawer for today on that register.
4. Prefer **Void** over **Complete sale** while iterating scroll UX (keeps SKUs on shelf). If you complete, run `--reset`.

## See also

- Terminal UI: `frontend/src/pages/pos/TerminalPage.tsx`
- Domain: [`.ai/extended/pos-system.md`](../../extended/pos-system.md)
