> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-054 · Recon: how a purchase order and its manifest are created today

- **Type:** recon · **Code + dev database, read-only** · **Time box:** 45 minutes
- **Why:** Buying Phase 6 turns a won B-Stock auction into an inventory `PurchaseOrder` that carries the auction's manifest, so nobody uploads it twice. It must reuse the existing paths so processing is not disturbed.

## Questions

1. **Create a PO.** Which API endpoint(s), serializer and service create an `apps.inventory.models.PurchaseOrder`? List required fields and defaults (vendor, order number, status, dates, costs such as purchase cost, fees, shipping). Cite `path:line`.
2. **PO manifest.** How do `apps.inventory.models.ManifestRow` rows get onto a PO today (upload endpoint, CSV template, standard fields)? Which fields does preprocessing read from them (title, brand, UPC/identifiers, quantity, retail, condition, category)? Cite the upload service and the preprocessing entry point.
3. **Vendors.** How are B-Stock sellers represented as `Vendor` rows (names like Target, Amazon, Walmart; any code or `external_id`)? List the vendors with the most POs (name, count) and any field linking a PO to a B-Stock auction or lot id today (order number conventions, notes).
4. **Existing links.** How many dev POs could be tied to a `buying.Auction` today (same lot id / order number / title), and by what rule?
5. **Status flow.** The PO status choices and which code moves a PO between them (ordered → paid → shipped → delivered → processing …). Which status should a PO created at "won" start in so it shows in the normal inbound flow (Orders → Preprocessing)?
6. **Anything that would break** if a PO were created by code with manifest rows already attached (signals, unique constraints, numbering, required receiving rows).

## Hand back

Answers 1–6 with `path:line` refs, and **Observations** (5 lines max): the safest way for code to create "PO from auction" using existing functions.
