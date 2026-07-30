# H4 — Self-review of overnight branch

## Stage-by-stage

| Stage | Quality | Notes |
|-------|---------|-------|
| A | Solid | Auth fix real; audits useful; kill switch expanded |
| B | Solid | Staff routes + vitest; public gate; copy guard |
| C | Solid | New model + FE; nested atomic + email side effects OK |
| D | Solid | Three emails only; DNS doc honest about lookup timeout |
| E | Solid | Magic link never echoed; staff bounce; public auth minimal |
| F | Good | Pickup tab frontend-heavy; demo seed DEBUG-only |
| G | Good | Matrix/journeys/concurrency/query pins; rollback rehearsed |
| H | This file | |

## Sloppiness / follow-ups for Opus

1. `confirm_reservation` sends email inside the atomic block — prefer `transaction.on_commit`.
2. Public `CheckoutPage` route still named checkout (CSS/route exceptions in copy guard).
3. Demo seed creates Items only if a Category exists; warn path if not.
4. Query budgets pinned to current counts — brittle if pagination defaults change.
5. Customer “My messages” for inquiry-only threads has no public deep link yet (hold-linked only).
6. Overnight log timestamps are approximate.

## Open questions (also in DECISIONS NEEDED)

- G9 provider choice + SPF append.
- When to enable `ONLINE_SALES_ENABLED` in prod.
- Whether inquiry threads need a public token status page (not just hold page).
