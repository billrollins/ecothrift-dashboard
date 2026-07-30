# Staff SOP — Online Sales (draft for Bill)

## Flow

1. **List** — Work queue → start listing from `online_sales` item, or New listing in Listings. Finish photos/copy in Listing Studio → Publish.
2. **Customer requests** — Public shop: hold list → Request a hold, or Ask about this item.
3. **Inbox → Messages** — Reply, Assign to me, Resolve when done.
4. **Inbox → Holds** — Verify request → **Confirm** (emails customer) → optionally **Stage**.
5. **Inbox → Ready for pickup** — Stage / Extend / Complete / Cancel / No-show.
6. **POS pickup** — Customer pays at register; complete hold (or POS hold guard blocks conflicting cart use).
7. **Expiry / no-show** — Scheduler `expire_online_holds` or manual Expire / No-show releases qty.

## Rules

- Pay in store only. No shipping, delivery, or online payment.
- Customer status links use unguessable tokens — not ETW order numbers.
- Flip `ONLINE_SALES_ENABLED` only after a successful seed + round-trip.
