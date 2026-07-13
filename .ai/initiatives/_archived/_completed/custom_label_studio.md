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

- Print server: [`printserver/`](../../../../printserver/), [`.ai/extended/print-server.md`](../../extended/print-server.md)
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

## Sessions

### Session 7 — 2026-07-10

**Goal:** Owner closeout — archive initiative as completed.

**#### Result:** Moved to `_archived/_completed/`. Shipped **v2.48.0**–**v2.48.2**; print-server **1.4.1**.

---

### Session 6 — 2026-07-09

**Goal:** Final productization pass: zero-training designer/library/print workflow, backend and print-server hardening, regression coverage, and release readiness.

**Updates:**

- Draft safety: explicit Saved/Unsaved state, leave guard, atomic background save/reload, and exact visible draft-to-print parity.
- Designer: starter label, element list/layer controls, keyboard nudge, confirmations, hidden internal keys, smoother rendering.
- Print: exact thumbnail, increment copy browser/examples, printer health, progress and partial-batch recovery.
- Library: search/retry, PDF-create guard, archive confirmation/show/restore, friendly errors.
- Hardening: AI throttles, upload signatures, retryable S3 cleanup + command; print-server 1.4.1 bounds and exact-size template raster path.
- Verified: Django labels **64 tests**; Label Studio Vitest **16 tests** (full frontend **245**); print-server router **7 tests**; frontend TypeScript + production build clean. Print-server **1.4.1** built, uploaded, and registered current.
- Follow-on hotfixes: **v2.48.1** (stream media on prod; register 1.4.1 on Heroku), **v2.48.2** (background replace cache-bust).

---

### Session 5 — 2026-07-09

**Goal:** Simplify variables UX (Name + Default) and add increment-per-copy variables.

**Updates:**

- Definition: `kind` text|increment; `name` (legacy `label` migrates); drop `required` from surface; increment `default_start`/`default_step`/`format`.
- Designer: variables rail Name+Default or Start/Step/Format; Source by Name + default hint; preview uses default or Name.
- Print: start/step per increment + Qty; per-copy raster loop when increments present (else single raster × N).
- Verified: labels tests + frontend tsc.

---

### Session 4 — 2026-07-09

**Goal:** Implement Phase 3 (AI Create) + Phase 4 (harden) in one pass.

**Finish line:** Designer AI dialog wired to propose-structure / generate-background; orphan S3 purge; permissions covered; docs + smoke checklist; initiative ready for owner physical smoke then archive.

**Est:** half day. **Start:** 2026-07-09T15:06:00-05:00

**Updates (2026-07-09):**

- Backend: `apps/labels/ai_create.py` (structure + xAI image); settings `AI_MODEL_LABEL_STRUCTURE` / `AI_MODEL_LABEL_IMAGE`; viewset actions `ai/propose-structure`, `ai/generate-background`; `services.purge_orphan_label_media` (24h grace, soft-archive protects FKs) hooked on upload/clear/archive.
- Frontend: `AiCreateDialog` + toolbar button on `LabelDesignerPage`; `labels.api` helpers; approve → existing `uploadLabelBackground`.
- Tests: **40** labels tests OK (AI mocks + orphan purge + Employee 403 on AI).
- Docs: this initiative Phase 3–4 ✅; CHANGELOG `[Unreleased]`; frontend + print-server extended notes; smoke checklist above.
- Verified: `manage.py test apps.labels` 40 OK; frontend `tsc` clean.

---

### Session 3 — 2026-07-09

**Goal:** Close out Phase 1 (changelog sync + distribute 1.4.0 + docs), then implement Phase 2 full-page designer with QR + Code128.

**Finish line:** Print-server 1.4.0 current on S3/Settings; Phase 1 marked closed; template labels editable on `/admin/label-studio/:id` with drag text/QR/barcode; print path still works.

**Est:** half–full day. **Start:** 2026-07-09T14:40:00-05:00

**Updates (2026-07-09) — Phase 1 closeout:**

- Synced [`printserver/CHANGELOG.md`](../../printserver/CHANGELOG.md) with dated **`## [1.4.0]`** (copies endpoints + folded installer VBS-name fix); aligned `config.py` embedded CHANGELOG string.
- Fixed `distribute.py` Unicode arrow crash on Windows cp1252.
- Ran distribute: built server/setup exes, uploaded `print-server/ecothrift-printserver-setup-v1.4.0.exe`, registered `PrintServerRelease` **1.4.0** as current (replaced 1.2.38).
- Root CHANGELOG: distribute no longer pending. Local print-server process was offline at closeout — install/update from Settings for physical smoke.

**Updates (2026-07-09) — Phase 2 designer:**

- Definition schema: `qr` / `barcode` / text `bold` / `w_pct`/`h_pct`; Django tests **25 OK**; `POST …/duplicate/`.
- Renderer: async `renderLabelToCanvas` with `qrcode` + `jsbarcode` (Code128).
- Full-page `LabelDesignerPage` at `/admin/label-studio/:id` (canvas drag/resize, variables + add-element rails, properties); library New Template / Edit Template navigate here; PDF stays dialog; Duplicate action.
- Verified: labels tests 25 OK; vitest 229 OK; tsc clean for Label Studio (fixed unrelated `OrderDetailPage` timer typing that blocked `tsc`).

---

### Session 2 — 2026-07-09

**Goal:** Plan and implement **Phase 1** — persistence + print path (PDF × N and minimal template labels) end to end.

**Finish line:** Manager+ can create/save a PDF or template label at `/admin/label-studio` and print N copies to a chosen local printer; print server has matching endpoints; Django + tsc + vitest + build green.

**Scope:** `apps/labels` (model/API/tests), print server 1.4.0 (`/print/image-copies`, `/print/pdf-copies`, PyMuPDF), `localPrintService` client methods, Label Studio page (library + editors + print dialog), nav/route wiring, docs.

**Out of scope:** Drag-drop designer, AI Create, distribute run to stores (do when validating on a store PC).

**Est:** half day. **Start:** 2026-07-09T13:50:00-05:00

**Updates (2026-07-09):**

- Backend: `apps.labels` — `CustomLabel` (kind `pdf`/`template`, `width_in`/`height_in`, validated `definition` JSON, `background`/`pdf_file` → `core.S3File`, soft archive), migration `0001`; `validate_definition` (variable keys, text elements, font allowlist, pct bounds); ViewSet at `/api/labels/labels/` with `background`/`pdf` multipart uploads (S3 keys `label-studio/{id}/…`), `media/{attr}` staff proxy (302 presigned), `include_archived` filter. **21 tests green.**
- Print server **1.4.0**: `routers/custom.py` — `POST /print/image-copies` (base64 raster × N via GDI `send_image`) and `POST /print/pdf-copies` (PyMuPDF grayscale raster @ 203 DPI per page × N); copies capped 100; `pymupdf` added to requirements + hidden-import; changelog/version bumped. **Distributed Session 3** (2026-07-09).
- Frontend: `labels.api.ts`; `localPrintService.printImageCopies`/`printPdfCopies` (404 → "update print server" message); `pages/admin/labelStudio/` — `LabelStudioPage` (library table, kind chips, archive), `LabelEditorDialog` (PDF upload; template size/background/variables/text rows + live mono canvas preview), `LabelPrintDialog` (printer select, copies 1–100, variable form), `renderTemplate.ts` (203 DPI canvas renderer shared by preview + print). Nav `labelStudio` (Admin group) + `ManagerRoute /admin/label-studio`.
- Verified: `manage.py test apps.labels` 21 OK; tsc clean; vitest 229 OK; `npm run build` green.

**Result:** Phase 1 code complete; closeout (distribute) completed in Session 3.

---

### Session 1 — 2026-07-09

**Goal:** Stand up the initiative and capture high-level product/tech direction (no Phase 1 build yet).

**Finish line:** Active initiative file + index row; owner direction on templates vs photos, variables, background, aspect ratio, monochrome, AI Create, and print-server/distribute called out.

**Scope:** Initiative markdown + `_index` / `context` compass only.

**Out of scope:** Schema, UI mockups, print-server code, AI wiring.

**Est:** ~30m. **Start:** 2026-07-09T13:01:00-05:00

**Result:** Initiative created with phased outline; ready for a Phase 0/1 planning session next.

---

## See also

- [`.ai/extended/print-server.md`](../extended/print-server.md)
- [`.ai/initiatives/_index.md`](./_index.md)
