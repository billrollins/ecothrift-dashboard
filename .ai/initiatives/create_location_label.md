<!-- initiative: slug=create-location-label status=active updated=2026-03-28 -->
<!-- Last updated: 2026-03-28T18:30:00-05:00 -->
# Initiative: Create location label (inventory scan)

**Status:** Active — **planning only**; implementation TBD in a later session.

**Scope:** Thermal-printed **location labels** for store-wide inventory counts: staff scan a **location QR** at each bay, then scan items at that location. This initiative covers delivering that label type end-to-end (data, layout, print path) per the build specification below.

---

## Authoritative spec (source of truth)

| Resource | Path |
|----------|------|
| **Build specification** | [`workspace/notes/ecothrift_label_spec.txt`](../../workspace/notes/ecothrift_label_spec.txt) |

The spec defines **3×2 in** thermal labels (216×144 pt), **rounded corners**, a **branded top banner** (“ECOTHRIFT” / “INVENTORY SCAN”), **aisle / shelf / category** presentation, a **location code pill**, a **QR** with a defined payload format, **category icons** (TOYS, CLOTHING, BOOKS, … + DEFAULT), **screen vs thermal** color mapping (greens → black on thermal; decorative texture skippable on thermal), and **sample label data** for QA sheets.

**QR payload format (from spec):**

`ECOTHRIFT:INV|{LOCATION_CODE}|{CATEGORY}|A{AISLE}|S{SHELF}`  
Example: `ECOTHRIFT:INV|TOY-A3-S3|TOYS|A3|S3`

---

## Context (why this exists)

- **Workflow:** Handheld scanner + walk the floor by **location**, not ad-hoc item-only scans.
- **Output:** Monochrome thermal (black on white); any “color” in the spec is for preview / PDF only unless noted.
- **Relationship to existing work:** The repo already has substantial **print server** label work (Concept C item labels, price fit, installer). Location labels are a **new label type** with different layout, data, and use case; reuse patterns (FastAPI, Windows client, GDI printing) should align with `.ai/extended/print-server.md` and archived label initiatives where sensible — **details decided during implementation.**

---

## Objectives (acceptance-oriented)

1. **Spec compliance** — Rendered label matches [`ecothrift_label_spec.txt`](../../workspace/notes/ecothrift_label_spec.txt): dimensions, banner, columns, QR size/placement, typography roles, pill, category icons, and thermal vs preview behavior notes.
2. **Scannable QR** — Error correction **H**; crisp black modules; quiet zone satisfied via the framed border described in the spec.
3. **Operational fit** — Staff can print location labels from an agreed trigger (e.g. admin UI, batch export, or print-server endpoint) — **workflow not fixed in this initiative doc.**
4. **Data wiring** — Location code, category label, aisle, and shelf resolve from the **canonical store/location model** — **exact API/model mapping TBD.**

---

## Out of scope (for this document)

- Concrete **dashboard UI** mockups and **API contracts** (defer to implementation plan).
- **Category taxonomy** changes beyond what the spec’s icon set requires (see separate backlog/archived docs if taxonomy work overlaps).

---

## Implementation plan

**Deferred.** A later session should: split work across **print server** (raster/PDF/generate), **backend** (location payloads, permissions), and **frontend** (if any), with traceability in `CHANGELOG` when code ships.

---

## See also

- [`workspace/notes/ecothrift_label_spec.txt`](../../workspace/notes/ecothrift_label_spec.txt) — full layer-by-layer build spec.
- [`.ai/extended/print-server.md`](../extended/print-server.md) — print server architecture and distribution.
- [`_archived/_completed/print_server_label_design.md`](./_archived/_completed/print_server_label_design.md) — prior item-label design initiative (reference, not same label).

---

*Parent: [`.ai/initiatives/_index.md`](./_index.md).*
