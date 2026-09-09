<!-- initiative: slug=cardx-surcharge status=active updated=2026-09-09 -->
<!-- Last updated: 2026-09-09 (one-window + drawer both) -->

# Initiative: CardX credit surcharge

**Status:** **Active** — Phases 1–4 implemented. Phase 5 (fix card type) stays after launch.

**Objective:** Cashiers can complete card and split sales by keying the POS pre-surcharge amount into CardX and matching the machine's approved total to one of two server-computed buttons. The POS records a 3% credit surcharge (not debit, prepaid, or cash) without adding it to sale revenue, and prints the breakdown on the store receipt.

**Compass:** this file is not the compass; [`documents`](./documents.md) stays the compass.

---

## Finish line

A cashier on POS Terminal taps Card or Split, keys the displayed amount into CardX, taps the button that matches the CardX screen, and the receipt shows base + surcharge + card total. Cash sales never see the prompt. The cash drawer kick fires on cash/split receipts without failing the print if no drawer is plugged in.

---

## Out of scope

- POS talking to CardX over a cable or API
- Taxing or folding surcharge into `Cart.total`, item `sold_for`, consignment, or drawer cash math
- Manager "fix card type" correction (Phase 5, after launch)
- No-sale open-drawer button on the Terminal

---

## Phases

### Phase 1 — Backend record + validate
Server stores card type and surcharge, computes amounts from `pos.card_surcharge`, rejects mismatches.
**Gated by:** none.

Acceptance:
- [x] `Cart` has `card_type`, `card_surcharge_rate`, `card_surcharge_amount`, `card_charged_total`
- [x] Complete requires `card_type` on card/split, rejects it on cash, rejects a mismatched `card_charged_total`
- [x] `GET …/card-preview/` returns server-computed no-surcharge and with-surcharge totals
- [x] Disabled setting yields 0 surcharge

### Phase 2 — Terminal one-window match
TYPE THIS INTO CARDX plus CARDX DIDN'T ASK / SURCHARGED. Card amount is auto-filled.
**Gated by:** Phase 1.

Acceptance:
- [x] Card/split opens `CardTenderDialog`; cash does not
- [x] Buttons show server preview amounts; cancel voids on CardX
- [x] Disabled setting skips the dialog and posts `card_type: debit`
- [x] Card amount is cart total; split card amount is total minus cash (not typed)

### Phase 3 — Receipt + drawer kick
Print server 1.7.0 prints the card breakdown; drawer kick cannot fail a receipt.
**Gated by:** Phase 2.

Acceptance:
- [x] Credit receipt shows base, 3% line, charged total, and disclosure
- [x] Debit receipt shows Card (Debit) only
- [x] Drawer kick is isolated from receipt success; pin is configurable on `/`

### Phase 4 — Reporting
Drawer close and dashboard expose surcharge totals without changing expected cash.
**Gated by:** Phase 1.

Acceptance:
- [x] Drawer close / drawer payload shows card sales and credit surcharges
- [x] Daily sales payload includes `card_surcharge_total`

### Phase 5 — Optional correction
Manager-only fix card type after launch.
**Gated by:** Phase 1.
Detail when Phase 1 is built.

---

## Acceptance

- [x] Phase 1 record + validate
- [x] Phase 2 Terminal match
- [x] Phase 3 receipt + drawer kick
- [x] Phase 4 reporting
- [x] Out-of-scope items stay out

---

## Record

**2026-09-09 — Opened.** Record-only CardX 3% credit surcharge: cashier copies a POS amount into the machine, then matches the approved total. Drawer kick on cash/split must not error when unplugged.

**2026-09-09 — Implemented Phases 1–4.** Cart fields + `card-preview` + complete validation; Terminal `CardTenderDialog`; receipt payload and print-server 1.7.0 lines; drawer kick isolated from receipt success; drawer/dashboard surcharge totals. Phase 5 (fix card type) not built.

**2026-09-09 — Shipped v2.92.0 + print-server 1.7.0.** `card-preview` excludes the cart list filters (a `payment_method=card` query was 404ing the open cart). Print-server 1.7.0 is on S3 and is the Settings download on local and prod.

**2026-09-09 — One window + drawer both pins.** Card amount is auto-filled (card = total, split = total − cash). `CardTenderDialog` is one window from `cardx-one-window.html` (no APPROVED line). Print-server 1.8.0 pulses both drawer pins in the receipt RAW job; Settings → Printing has Drawer pin + Open drawer.

---

## See also

- Domain: [`.ai/extended/pos-system.md`](../extended/pos-system.md), [`.ai/extended/print-server.md`](../extended/print-server.md)
- Index: [`_index.md`](./_index.md)
