<!-- Last updated: 2026-08-25 (receive vs inspect, nav badge) -->
# Parts orders — associate rules

Minutes of labor is the only estimate you type on the bench. Parts dollars come from the orders.

## What you own

1. **The list** — description, link, qty, price, and whether the line is Parts, Supplies, or FFE. Only Parts count against the repair. Shipping on an order that is mostly FFE only charges the repair the Parts share of the freight.
2. **The order** — name it, pick lines from the list, add shipping / tax / fees, and say which grade it would achieve. You can have several orders on one item. They are alternatives.
3. **One live request** — only one order on the item can be requested, approved, or purchased at a time.
   - A draft shows **Request**. **Cancel** appears only after it is requested; it puts the order back to a draft. Unused drafts are **Delete** in the editor, not Cancel on the tile.
   - Requesting B while A is only requested puts A back to a draft. No one else is involved.
   - Requesting B while A is approved or purchased asks you to submit a cancel first. If the owner cancels A, B is requested automatically. If they keep A, B stays a draft.
4. **Request** does not hold the item and does not leave the bench. Hold is a choice you make after, if you are waiting.

## What the owner does

`/restoration/parts-requests` is the command center. **Live** is a four-lane board: Requested → Approved → Ordered → Received. The strip above it counts what needs you: cancel asks, approvals, orders to place, late deliveries, and received orders that need a look. Click a counter to filter the board; click it again to show everything. A cancel ask stays in its lane but paints red.

Accept or deny (with a reason), mark as ordered (with a delivery date), then mark delivered. **Received** and inspect are two steps. You can mark it delivered now and inspect later. The Received lane *is* the inspect form (and the bench ORDERS pane keeps a reserved copy): Acceptable or Issues per bought line, with a description when there are issues. Qty 3 is still one line. Save stays off until every line is marked. After inspect the order leaves Received and sits in History, even if the job is still open. The Parts Requests nav badge counts approvals, cancel asks, and reviews and should clear as soon as those are handled. Revise the date on an ordered row if the estimate moves. Confirming a purchased cancel keeps the spend unless they tick Refunded. Finish stays blocked until an open order is received or cancelled.

**History** is settled spend, grouped by item: inspected received orders, plus cancelled or denied. Unfinished jobs sit under Not finished.

## The grade table

PARTS is the cheapest and dearest live order path for that grade. One number when they match; **x to y** when they do not. WORTH uses the same range. There is no estimate to reconcile against.
