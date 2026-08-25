<!-- initiative: slug=custom-label-studio status=completed updated=2026-07-10 -->
<!-- Archived 2026-07-10: disposition=completed (Label Studio library/designer/AI/print × N; print-server 1.4.1; shipped v2.48.0–v2.48.2) -->
<!-- Last updated: 2026-07-10 (archived → _completed/; owner closed) -->

# Initiative: Custom Label Studio

**Status:** **Completed** (2026-07-10) — Phases **0–4 + final polish** shipped **v2.48.0**; prod media/print-server hotfixes **v2.48.1**–**v2.48.2**. See [`CHANGELOG`](../../../../CHANGELOG.md) `[2.48.0]`–`[2.48.2]`. Print-server **1.4.1** current.

**Home:** Admin **`/admin/label-studio`**. **Print path:** local print server (`printserver/`) + dashboard UI; assets on **S3** (`S3File`).

---

## Finish line (initiative)

Staff can **design, save, and print custom labels** from the dashboard: pick a printer, fill template variables (and/or use a background image), print **N** copies. Labels are **persistent** (Postgres definition + S3 media). An optional **AI Create for me** flow can propose structure and/or a monochrome background image for approval before save. Print-server changes ship via the existing **distribute / installer** path.

**Finish-line check (2026-07-10):** Library + designer + PDF/template print × N + AI propose/apply + AI bg approve/upload + orphan purge + Manager+ gates + prod media stream/cache-bust — **met**. Owner closed initiative as complete.

---

## Product direction (owner-confirmed, 2026-07-09)

**Not** “custom labels are just photos.” Every custom label is a **template**:

| Capability | Intent |
|------------|--------|
| **Variables** | Named fields (Name + Default) → print form; **increment** kind advances per copy (start/step/format). |

| **Background image** | Optional S3 image under the layout (monochrome-friendly). |
| **Aspect ratio** | Per-label size / ratio (not locked to today’s 3×2 / 1.5×1 product presets only). |
| **Layout** | User places text (and later other elements) with basic formatting: position, font family, size. |
| **Color** | **Monochrome for now** (thermal / B&W print reality). |
| **Print** | Select printer → render → print **× N**. Early path may also support **upload PDF** and print N copies (bridge / alternate job type). |
| **Persistence** | Label definitions in **Postgres**; images/PDFs on **S3**. |

### Storage model

Prefer **structured instructions in Postgres**, not “only a baked PNG”:

- **Definition JSON**: canvas size / aspect, element list (text / QR / Code128), variable schema.
- **Media FKs:** background image, optional uploaded PDF — via **S3**.
- **Render at print time** in the dashboard (203 DPI) → print server `image-copies` / `pdf-copies`.

Photos alone are a **degenerate template** (background only, no variables) — allowed, not the default mental model.

### AI Create for me (shipped Phase 3)

1. **Structure:** `AI_MODEL_LABEL_STRUCTURE` via `llm_complete` → validated definition → user **Apply to canvas** → Save.
2. **Image:** Canned mono/thermal prompt + brief → xAI **`/v1/images/generations`** (`AI_MODEL_LABEL_IMAGE`, default `grok-imagine-image-quality`) → preview → user **Use as background** (existing multipart upload) → Save.
3. Same CRUD/upload APIs as the manual designer.

---

## Surfaces

| Surface | Role |
|---------|------|
| **Label library page** | List saved templates; create / edit / duplicate / archive; open print dialog. |
| **Designer** | Aspect ratio, background upload/AI, place text/QR/barcode, bind variables, preview (B&W). |
| **Print dialog** | Printer select (local print server), variable form, copies **N**, print / reprint. |
| **PDF print** | Upload PDF → printer → × N. |
| **Print server** | `/print/image-copies`, `/print/pdf-copies` (**1.4.1**). |
| **Admin** | Nav under Admin → Label Studio. |

---

## Phases

| Phase | Focus | Notes |
|-------|--------|------|
| **0 — Design & decisions** | ✅ Done | nav Admin; PDF + template; 203 DPI client render. |
| **1 — Persist + print path** | ✅ Closed | `apps.labels` + 1.4.0 distributed. |
| **2 — Designer** | ✅ Done | full-page designer + QR/barcode. |
| **3 — AI Create for me** | ✅ Done (Session 4) | structure + xAI image + approval gate. |
| **4 — Harden** | ✅ Done (Session 4) | orphan purge, permissions, smoke checklist, docs. |

---

## Out of scope (for now)

- Full-color retail signage / dye-sub.
- Replacing the existing **product price/QR label** pipeline (`label_printer.py` Concept C) — that stays; custom labels are a **parallel** catalog.
- Customer-facing / public storefront labels.
- Non-Windows print clients.

---

## Technical anchors (existing)

- Print server: [`printserver/`](../../../../printserver/), [`.ai/extended/print-server.md`](../../../extended/print-server.md)
- Dashboard print client: `frontend/src/services/localPrintService.ts`; Admin Settings printer UI
- S3 / releases: `apps.core` `S3File`, `PrintServerRelease`; `printserver/distribute.py`
- Prior label work (closed): [`print_server_label_design`](./print_server_label_design.md), [`print_server_label_price_layout`](./print_server_label_price_layout.md)

---

## Resolved questions

1. Nav: **Admin** `/admin/label-studio`.
2. MVP: **both** PDF × N and minimal template in Phase 1.
3. Render owner: **dashboard raster** → `send_image` / pdf-copies on print server.
4. Fonts: allowlist **arial / consolas / georgia** (system fonts on store PC).
5. AI Create: **`llm_complete`** for structure; **xAI Grok Imagine** (`XAI_API_KEY`) for images.

---

## Print-server 1.4.1 smoke checklist (reference)

1. Admin **Settings** → install/update print server to **1.4.1**.
2. Confirm print-server health (`http://127.0.0.1:8888`).
3. Label Studio → PDF label → print × 2.
4. Fixed template → print × 2 (check physical size).
5. Increment template → print × 3 (check sequence).
6. AI Create → save → print once.

---

## See also

- [`.ai/extended/print-server.md`](../../../extended/print-server.md)
- [`.ai/initiatives/_index.md`](../../_index.md)
