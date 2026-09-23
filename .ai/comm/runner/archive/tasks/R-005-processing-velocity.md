# R-005 · recon · Processing velocity and backlog

**Why:** How fast we can process sets how much we should buy (a 5,000-unit truck can swamp us). Need v2 and the manifest hazard "quantity too big for processing" both need this.

**Answer these:**

1. **Timestamps.** Which fields record the steps from receiving to shelf, at the PO level and the item level (`path:line`)? Examples: `receiving_started_at`, `receiving_done_at`, processing and check-in times, item created and shelved.
2. **Weekly velocity:** items processed, meaning moved to on-shelf or checked in, per week for the last 26 weeks. Total, and for the top 8 categories. Say which field defines "processed".
3. **Backlog now:**
   - POs delivered or received but not fully processed: count, their items or rows, and the oldest date;
   - items created but not on the shelf, by status: count and median age in days.
4. **Per truck:** for POs fully processed in the last 6 months, the median days from delivered to processing done, and the median rows per PO.
5. **Staff time (optional, 20 minutes max):** is there any data linking staff hours or routines to processing? A yes or no, and where.

**Result:** `results/R-005-processing-velocity.md`. Read-only; no outside calls.
